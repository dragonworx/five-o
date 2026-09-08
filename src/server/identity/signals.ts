import { db, nowIso } from "../db";
import { ENV } from "../env";
import { ipUaHash, sha256Hex } from "../hash";
import { resolveGuest } from "../guests";
import { CONFIG } from "../../config/party.config";
import type { Candidate, MatchedSignal, SignalKind } from "./score";
import {
  DEFAULT_SIGNAL_WEIGHTS,
  FINGERPRINT_COLLISION_WEIGHT,
  FINGERPRINT_DECAY_FACTOR,
} from "./weights";
import type { DeviceSignals } from "../schemas";

// The hashed, server-side view of one device's signals for a single request.
export interface DeviceContext {
  cookieGuestId: string | null;
  localHash: string | null;
  idbHash: string | null;
  cacheHash: string | null;
  fingerprintHash: string | null;
  ipuaHash: string | null;
}

interface SignalRow {
  guest_id: string;
  weight: number;
  last_seen: string;
}

export function buildDeviceContext(input: {
  cookieGuestId: string | null;
  signals: DeviceSignals;
  ip: string;
  ua: string;
}): DeviceContext {
  const hash = (v?: string): string | null => (v ? sha256Hex(v) : null);
  return {
    cookieGuestId: input.cookieGuestId,
    localHash: hash(input.signals.storageToken),
    idbHash: hash(input.signals.idbToken),
    cacheHash: hash(input.signals.cacheToken),
    fingerprintHash: hash(input.signals.fingerprint),
    ipuaHash: ipUaHash(input.ip, input.ua, ENV.ipPepper),
  };
}

function ageDays(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
}

class CandidateAccumulator {
  private readonly map = new Map<string, MatchedSignal[]>();

  add(guestId: string, kind: SignalKind, weight: number): void {
    if (weight <= 0) return;
    const survivor = resolveGuest(guestId);
    if (!survivor) return;
    const list = this.map.get(survivor.id) ?? [];
    list.push({ kind, weight });
    this.map.set(survivor.id, list);
  }

  toCandidates(): Candidate[] {
    return [...this.map].map(([guestId, signals]) => ({ guestId, signals }));
  }
}

function rowsForKind(kind: SignalKind, valueHash: string): SignalRow[] {
  return db
    .query<SignalRow, [SignalKind, string]>(
      "SELECT guest_id, weight, last_seen FROM identity_signal WHERE kind = ? AND value_hash = ?",
    )
    .all(kind, valueHash);
}

function addSimpleKind(acc: CandidateAccumulator, kind: SignalKind, hash: string | null): void {
  if (!hash) return;
  for (const row of rowsForKind(kind, hash)) acc.add(row.guest_id, kind, row.weight);
}

// Fingerprints get two adjustments: a permanent collision penalty when one hash
// maps to multiple guests, and a decay that halves (then expires) old hashes.
function addFingerprint(acc: CandidateAccumulator, hash: string | null): void {
  if (!hash) return;
  const rows = rowsForKind("fingerprint", hash);
  const distinctGuests = new Set(rows.map((r) => r.guest_id));
  const collided = distinctGuests.size >= 2;
  if (collided) persistCollisionPenalty(hash);

  const ttl = CONFIG.detection.fingerprintTtlDays;
  for (const row of rows) {
    const age = ageDays(row.last_seen);
    if (age > ttl * 2) continue; // expired
    let weight = collided ? FINGERPRINT_COLLISION_WEIGHT : row.weight;
    if (age > ttl) weight *= FINGERPRINT_DECAY_FACTOR;
    acc.add(row.guest_id, "fingerprint", weight);
  }
}

function persistCollisionPenalty(hash: string): void {
  db.prepare("UPDATE identity_signal SET weight = ? WHERE kind = 'fingerprint' AND value_hash = ?").run(
    FINGERPRINT_COLLISION_WEIGHT,
    hash,
  );
}

export function gatherCandidates(ctx: DeviceContext): Candidate[] {
  const acc = new CandidateAccumulator();
  if (ctx.cookieGuestId) {
    const g = resolveGuest(ctx.cookieGuestId);
    if (g) acc.add(g.id, "cookie", DEFAULT_SIGNAL_WEIGHTS.cookie);
  }
  addSimpleKind(acc, "local", ctx.localHash);
  addSimpleKind(acc, "idb", ctx.idbHash);
  addSimpleKind(acc, "cache", ctx.cacheHash);
  addFingerprint(acc, ctx.fingerprintHash);
  addSimpleKind(acc, "ipua", ctx.ipuaHash);
  return acc.toCandidates();
}

function upsertSignal(guestId: string, kind: SignalKind, valueHash: string, weight: number): void {
  const now = nowIso();
  db.prepare(
    `INSERT INTO identity_signal (guest_id, kind, value_hash, weight, hits, first_seen, last_seen)
     VALUES (?,?,?,?,1,?,?)
     ON CONFLICT (kind, value_hash, guest_id)
     DO UPDATE SET hits = hits + 1, last_seen = excluded.last_seen`,
  ).run(guestId, kind, valueHash, weight, now, now);
}

// Bind every device-local signal (and the corroborating ipua) to this guest, so
// a guest who lost one storage slot but kept another gets all slots rewritten.
export function writeThrough(guestId: string, ctx: DeviceContext): void {
  const w = DEFAULT_SIGNAL_WEIGHTS;
  if (ctx.localHash) upsertSignal(guestId, "local", ctx.localHash, w.local);
  if (ctx.idbHash) upsertSignal(guestId, "idb", ctx.idbHash, w.idb);
  if (ctx.cacheHash) upsertSignal(guestId, "cache", ctx.cacheHash, w.cache);
  if (ctx.fingerprintHash) upsertSignal(guestId, "fingerprint", ctx.fingerprintHash, w.fingerprint);
  if (ctx.ipuaHash) upsertSignal(guestId, "ipua", ctx.ipuaHash, w.ipua);
}

// Re-point this device's signals from an overridden/merged guest to the survivor.
export function repointDeviceSignals(fromGuestId: string, toGuestId: string, ctx: DeviceContext): void {
  const hashes = [ctx.localHash, ctx.idbHash, ctx.cacheHash, ctx.fingerprintHash].filter(
    (h): h is string => h !== null,
  );
  if (hashes.length === 0) return;
  const placeholders = hashes.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM identity_signal WHERE guest_id = ? AND value_hash IN (${placeholders})`,
  ).run(fromGuestId, ...hashes);
  writeThrough(toGuestId, ctx);
}

export function recordVisit(input: {
  guestId: string | null;
  outcome: string;
  score: number | null;
  matchedKinds: SignalKind[];
  ua: string;
  ipHash: string;
}): void {
  db.prepare(
    "INSERT INTO visit (guest_id, outcome, score, matched_kinds, ua, ip_hash, created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(
    input.guestId,
    input.outcome,
    input.score,
    JSON.stringify(input.matchedKinds),
    input.ua,
    input.ipHash,
    nowIso(),
  );
}
