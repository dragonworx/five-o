import { CONFIG } from "../../config/party.config";
import {
  createGuest,
  markSlidesSeen,
  resolveGuest,
  toSummary,
  updateGuestRsvp,
  type RsvpFields,
} from "../guests";
import { badRequest, json, notFound, parseJson, type ApiContext } from "../http";
import { rsvpRequestSchema, type Diet, type RsvpRequest } from "../schemas";
import { readGuestFromCookie, sessionCookieHeader } from "../identity/cookie";
import { buildDeviceContext, repointDeviceSignals, writeThrough } from "../identity/signals";

const DIET_VALUES = new Set<Diet>(CONFIG.form.dietOptions.map((d) => d.value));

// Enforce the per-event caps from config (schema only guards structure) and the
// headcount rules the DB CHECK constraints also enforce.
function validateLimits(data: RsvpRequest): string | null {
  if (data.attending) {
    if (data.adults < 1) return "An acceptance needs at least one adult";
    if (data.adults > CONFIG.form.maxAdults) return `At most ${CONFIG.form.maxAdults} adults`;
    if (data.kids > CONFIG.form.maxKids) return `At most ${CONFIG.form.maxKids} kids`;
    if (data.diet && !DIET_VALUES.has(data.diet)) return "Unknown diet option";
  }
  if (data.isMusician && !CONFIG.form.askMusician) return "Musician question is disabled";
  return null;
}

// A decline carries no headcount, diet or musician flag — zeroed here as well as
// by the DB, so a bad client can't inflate the catering numbers.
function toRsvpFields(data: RsvpRequest): RsvpFields {
  const attending = data.attending;
  const message = data.message?.trim();
  return {
    name: data.name.trim(),
    attending,
    adults: attending ? data.adults : 0,
    kids: attending ? data.kids : 0,
    isMusician: attending ? data.isMusician : false,
    diet: attending ? (data.diet ?? null) : null,
    message: message || null,
  };
}

export async function handleRsvp(req: Request, ctx: ApiContext): Promise<Response> {
  const body = await parseJson(req, rsvpRequestSchema);
  if (!body.ok) return badRequest(body.error);

  const data = body.data;
  const limitError = validateLimits(data);
  if (limitError) return badRequest(limitError);

  const fields = toRsvpFields(data);
  const cookieGuestId = readGuestFromCookie(req);
  const device = buildDeviceContext({ cookieGuestId, signals: data, ip: ctx.ip, ua: ctx.ua });

  const existing = cookieGuestId ? resolveGuest(cookieGuestId) : null;
  const guest = existing
    ? updateGuestRsvp(existing.id, fields)
    : createGuest(fields, data.overriddenFrom ?? null);

  if (!existing && data.overriddenFrom) {
    repointDeviceSignals(data.overriddenFrom, guest.id, device);
  } else {
    writeThrough(guest.id, device);
  }

  return json({ guest: toSummary(guest) }, { cookie: sessionCookieHeader(guest.id) });
}

export function handleSlidesComplete(req: Request): Response {
  const guestId = readGuestFromCookie(req);
  if (!guestId) return badRequest("No guest session");
  const guest = resolveGuest(guestId);
  if (!guest) return notFound("Guest not found");
  markSlidesSeen(guest.id);
  return json({ ok: true });
}
