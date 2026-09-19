import { CONFIG } from "../../config/party.config";
import {
  deleteGuest,
  findNameMatches,
  markMerged,
  redactedLabel,
  resolveGuest,
  toSummary,
  type GuestRow,
} from "../guests";
import { normaliseName } from "../hash";
import { badRequest, forbidden, json, notFound, parseJson, type ApiContext } from "../http";
import {
  claimRequestSchema,
  identifyRequestSchema,
  lookupRequestSchema,
  overrideRequestSchema,
} from "../schemas";
import { clearCookieHeader, cookieHeader, readGuestFromCookie } from "../identity/cookie";
import { makeClaimToken, verifyClaimToken } from "../identity/claim";
import { identify, type IdentificationResult, type ScoreOptions } from "../identity/score";
import { AMBIGUITY_DELTA } from "../identity/weights";
import {
  buildDeviceContext,
  gatherCandidates,
  recordVisit,
  repointDeviceSignals,
  writeThrough,
  type DeviceContext,
} from "../identity/signals";

function detectionOpts(): ScoreOptions {
  return {
    autoRecogniseAt: CONFIG.detection.autoRecogniseAt,
    softMatchAt: CONFIG.detection.softMatchAt,
    ipCorroborationOnly: CONFIG.detection.ipCorroborationOnly,
    ambiguityDelta: AMBIGUITY_DELTA,
  };
}

function setCookieFor(guestId: string): string {
  return cookieHeader(guestId, CONFIG.detection.cookieMaxAgeDays);
}

function autoResponse(guestId: string, device: DeviceContext): Response {
  const guest = resolveGuest(guestId);
  if (!guest) return json({ outcome: "new" });
  writeThrough(guest.id, device);
  return json({ outcome: "auto", guest: toSummary(guest) }, { cookie: setCookieFor(guest.id) });
}

function softResponse(guestId: string): Response {
  const guest = resolveGuest(guestId);
  if (!guest) return json({ outcome: "new" });
  return json({
    outcome: "soft",
    candidate: { guestId: guest.id, name: guest.name },
    claimToken: makeClaimToken([guest.id]),
  });
}

function ambiguousResponse(result: IdentificationResult): Response {
  const guests = result.contenders
    .map((c) => resolveGuest(c.guestId))
    .filter((g): g is GuestRow => g !== null);
  if (guests.length === 0) return json({ outcome: "new" });
  return json({
    outcome: "ambiguous",
    candidates: guests.map((g) => ({ guestId: g.id, name: g.name })),
    claimToken: makeClaimToken(guests.map((g) => g.id)),
  });
}

function respondToOutcome(result: IdentificationResult, device: DeviceContext): Response {
  if (result.outcome === "auto" && result.best) return autoResponse(result.best.guestId, device);
  if (result.outcome === "soft" && result.best) return softResponse(result.best.guestId);
  if (result.outcome === "ambiguous") return ambiguousResponse(result);
  return json({ outcome: "new" });
}

export async function handleIdentify(req: Request, ctx: ApiContext): Promise<Response> {
  const body = await parseJson(req, identifyRequestSchema);
  if (!body.ok) return badRequest(body.error);

  const cookieGuestId = readGuestFromCookie(req);
  const device = buildDeviceContext({ cookieGuestId, signals: body.data, ip: ctx.ip, ua: ctx.ua });
  const result = identify(gatherCandidates(device), detectionOpts());

  recordVisit({
    guestId: result.best?.guestId ?? null,
    outcome: result.outcome,
    score: result.best?.score ?? null,
    matchedKinds: result.best?.matchedKinds ?? [],
    ua: ctx.ua,
    ipHash: device.ipuaHash ?? "",
  });

  return respondToOutcome(result, device);
}

// Confirm a soft/ambiguous/lookup match. The claim ticket bounds which guest ids
// this device is allowed to attach to.
export async function handleClaim(req: Request, ctx: ApiContext): Promise<Response> {
  const body = await parseJson(req, claimRequestSchema);
  if (!body.ok) return badRequest(body.error);

  const allowed = verifyClaimToken(body.data.claimToken);
  if (!allowed) return forbidden("Claim token invalid or expired");
  if (!allowed.includes(body.data.guestId)) return forbidden("Guest not offered by this token");

  const guest = resolveGuest(body.data.guestId);
  if (!guest) return notFound("Guest not found");

  const cookieGuestId = readGuestFromCookie(req);
  const device = buildDeviceContext({ cookieGuestId, signals: body.data, ip: ctx.ip, ua: ctx.ua });
  bindDeviceToGuest(guest.id, cookieGuestId, device);

  recordVisit({
    guestId: guest.id,
    outcome: "lookup",
    score: null,
    matchedKinds: [],
    ua: ctx.ua,
    ipHash: device.ipuaHash ?? "",
  });

  return json({ outcome: "auto", guest: toSummary(guest) }, { cookie: setCookieFor(guest.id) });
}

// Merge an abandoned shell (a prior cookie guest that never answered) into the
// claimed guest; otherwise just write the signals through.
function bindDeviceToGuest(guestId: string, prevGuestId: string | null, device: DeviceContext): void {
  if (prevGuestId && prevGuestId !== guestId) {
    const prev = resolveGuest(prevGuestId);
    if (prev?.attending === null) {
      repointDeviceSignals(prev.id, guestId, device);
      markMerged(prev.id, guestId);
      return;
    }
  }
  writeThrough(guestId, device);
}

// "Not you?" — drop the cookie and tell the client to rotate its local tokens.
// A new guest is minted only when they next submit an RSVP (with overriddenFrom).
export async function handleOverride(req: Request): Promise<Response> {
  const body = await parseJson(req, overrideRequestSchema);
  if (!body.ok) return badRequest(body.error);
  const previousGuestId = readGuestFromCookie(req);
  return json({ outcome: "new", previousGuestId }, { cookie: clearCookieHeader() });
}

// Rate-limited in routes/api.ts (tightly, since it lets a stranger guess names).
export async function handleLookup(req: Request): Promise<Response> {
  const body = await parseJson(req, lookupRequestSchema);
  if (!body.ok) return badRequest(body.error);

  const matches = findNameMatches(normaliseName(body.data.name));
  if (matches.length === 0) return json({ outcome: "new", matches: [] });

  return json({
    outcome: "lookup",
    matches: matches.map((m) => ({ guestId: m.id, label: redactedLabel(m) })),
    claimToken: makeClaimToken(matches.map((m) => m.id)),
  });
}

export function handleMe(req: Request): Response {
  const guestId = readGuestFromCookie(req);
  const guest = guestId ? resolveGuest(guestId) : null;
  return json({ guest: guest ? toSummary(guest) : null });
}

export function handleDeleteMe(req: Request): Response {
  const guestId = readGuestFromCookie(req);
  if (guestId) {
    const guest = resolveGuest(guestId);
    if (guest) deleteGuest(guest.id);
  }
  return json({ ok: true }, { cookie: clearCookieHeader() });
}
