import { currentDb, nowIso } from "./db";
import { normaliseName } from "./hash";
import { levenshtein } from "./text";
import type { Diet } from "./schemas";

// Guest rows (raw DB shape) and the client-facing summary, plus the primitive
// operations. All headcount/CHECK invariants live in the DB schema; callers
// must zero adults/kids on a decline before writing.

export interface GuestRow {
  id: string;
  name: string;
  name_normalised: string;
  attending: number | null;
  adults: number;
  kids: number;
  is_musician: number;
  diet: Diet | null;
  message: string | null;
  slides_seen_at: string | null;
  merged_into: string | null;
  overridden_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuestSummary {
  id: string;
  name: string;
  attending: boolean | null;
  adults: number;
  kids: number;
  isMusician: boolean;
  diet: Diet | null;
  message: string | null;
  slidesSeenAt: string | null;
}

export interface RsvpFields {
  name: string;
  attending: boolean;
  adults: number;
  kids: number;
  isMusician: boolean;
  diet: Diet | null;
  message: string | null;
}

export function toSummary(row: GuestRow): GuestSummary {
  return {
    id: row.id,
    name: row.name,
    attending: row.attending === null ? null : row.attending === 1,
    adults: row.adults,
    kids: row.kids,
    isMusician: row.is_musician === 1,
    diet: row.diet,
    message: row.message,
    slidesSeenAt: row.slides_seen_at,
  };
}

export function getGuest(id: string): GuestRow | null {
  return currentDb().query<GuestRow, [string]>("SELECT * FROM guest WHERE id = ?").get(id) ?? null;
}

// Follow the merge chain to the surviving guest.
export function resolveGuest(id: string): GuestRow | null {
  let row = getGuest(id);
  const seen = new Set<string>();
  while (row?.merged_into && !seen.has(row.id)) {
    seen.add(row.id);
    row = getGuest(row.merged_into);
  }
  return row;
}

export function findByNormalisedName(normalised: string): GuestRow[] {
  return currentDb()
    .query<GuestRow, [string]>(
      "SELECT * FROM guest WHERE name_normalised = ? AND merged_into IS NULL",
    )
    .all(normalised);
}

// True when another active guest already has this full name. `exceptGuestId` is the
// caller's own record, so re-saving an unchanged name is never a conflict.
export function isNameTaken(name: string, exceptGuestId: string | null = null): boolean {
  return findByNormalisedName(normaliseName(name)).some((g) => g.id !== exceptGuestId);
}

export function allActiveGuests(): GuestRow[] {
  return currentDb().query<GuestRow, []>("SELECT * FROM guest WHERE merged_into IS NULL").all();
}

// Exact normalised match plus a Levenshtein-≤2 fuzzy pass, capped.
export function findNameMatches(normalised: string, limit = 5): GuestRow[] {
  const exact = findByNormalisedName(normalised);
  const seen = new Set(exact.map((g) => g.id));
  const fuzzy = allActiveGuests().filter(
    (g) => !seen.has(g.id) && levenshtein(normalised, g.name_normalised, 2) <= 2,
  );
  return [...exact, ...fuzzy].slice(0, limit);
}

// A confirmation summary that reveals little to a stranger guessing names.
export function redactedLabel(row: GuestRow): string {
  if (row.attending === 0) return `${row.name} · not coming`;
  if (row.attending === null) return `${row.name} · not answered yet`;
  const party: string[] = [];
  if (row.adults > 0) party.push(`${row.adults} ${row.adults === 1 ? "adult" : "adults"}`);
  if (row.kids > 0) party.push(`${row.kids} ${row.kids === 1 ? "kid" : "kids"}`);
  if (row.diet) party.push(row.diet);
  return `${row.name} · ${party.join(" · ") || "coming"}`;
}

function writeAudit(guestId: string, action: string, before: GuestRow | null, after: GuestRow | null): void {
  currentDb().prepare("INSERT INTO audit (guest_id, action, before_json, after_json, created_at) VALUES (?,?,?,?,?)").run(
    guestId,
    action,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    nowIso(),
  );
}

export function createGuest(fields: RsvpFields, overriddenFrom: string | null): GuestRow {
  const id = Bun.randomUUIDv7();
  const now = nowIso();
  currentDb().prepare(
    `INSERT INTO guest
      (id, name, name_normalised, attending, adults, kids, is_musician, diet, message, overridden_from, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    fields.name,
    normaliseName(fields.name),
    fields.attending ? 1 : 0,
    fields.adults,
    fields.kids,
    fields.isMusician ? 1 : 0,
    fields.diet,
    fields.message,
    overriddenFrom,
    now,
    now,
  );
  const row = getGuest(id);
  if (!row) throw new Error("guest insert failed");
  writeAudit(id, "create", null, row);
  return row;
}

export function updateGuestRsvp(id: string, fields: RsvpFields): GuestRow {
  const before = getGuest(id);
  if (!before) throw new Error(`guest ${id} not found`);
  currentDb().prepare(
    `UPDATE guest SET
      name = ?, name_normalised = ?, attending = ?, adults = ?, kids = ?,
      is_musician = ?, diet = ?, message = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    fields.name,
    normaliseName(fields.name),
    fields.attending ? 1 : 0,
    fields.adults,
    fields.kids,
    fields.isMusician ? 1 : 0,
    fields.diet,
    fields.message,
    nowIso(),
    id,
  );
  const after = getGuest(id);
  if (!after) throw new Error("guest update failed");
  writeAudit(id, "update", before, after);
  return after;
}

export function markSlidesSeen(id: string): void {
  const now = nowIso();
  currentDb().prepare("UPDATE guest SET slides_seen_at = COALESCE(slides_seen_at, ?), updated_at = ? WHERE id = ?").run(
    now,
    now,
    id,
  );
}

export function markMerged(shellId: string, survivorId: string): void {
  const before = getGuest(shellId);
  currentDb().prepare("UPDATE guest SET merged_into = ?, updated_at = ? WHERE id = ?").run(survivorId, nowIso(), shellId);
  writeAudit(shellId, "merged", before, getGuest(shellId));
}

export function deleteGuest(id: string): void {
  const before = getGuest(id);
  currentDb().prepare("DELETE FROM guest WHERE id = ?").run(id); // cascades to identity_signal
  writeAudit(id, "delete", before, null);
}
