import { db } from "../db";
import type { GuestRow } from "../guests";

// Read models for the admin console. All headcount totals filter to
// `attending = 1 AND merged_into IS NULL`, so declines and superseded duplicates
// can never inflate the catering numbers.

export interface Summary {
  households: number;
  totalAdults: number;
  totalKids: number;
  totalHeads: number;
  musicians: number;
  omnivore: number;
  vegetarian: number;
  vegan: number;
  comingCount: number;
  decliningCount: number;
  noAnswerCount: number;
  respondedCount: number;
  guestCount: number;
}

interface AggregateRow {
  households: number;
  total_adults: number;
  total_kids: number;
  total_heads: number;
  musicians: number;
  omnivore: number;
  vegetarian: number;
  vegan: number;
}

export function getSummary(): Summary {
  const agg = db
    .query<AggregateRow, []>(
      `SELECT
         COUNT(*)                              AS households,
         COALESCE(SUM(adults), 0)              AS total_adults,
         COALESCE(SUM(kids),   0)              AS total_kids,
         COALESCE(SUM(adults + kids), 0)       AS total_heads,
         COALESCE(SUM(is_musician), 0)         AS musicians,
         COALESCE(SUM(diet = 'omnivore'),   0) AS omnivore,
         COALESCE(SUM(diet = 'vegetarian'), 0) AS vegetarian,
         COALESCE(SUM(diet = 'vegan'),      0) AS vegan
       FROM guest
       WHERE attending = 1 AND merged_into IS NULL`,
    )
    .get();

  const counts = db
    .query<{ attending: number | null; n: number }, []>(
      `SELECT attending, COUNT(*) AS n
       FROM guest WHERE merged_into IS NULL
       GROUP BY attending`,
    )
    .all();

  const countFor = (value: number | null): number =>
    counts.find((c) => c.attending === value)?.n ?? 0;

  const comingCount = countFor(1);
  const decliningCount = countFor(0);
  const noAnswerCount = countFor(null);

  return {
    households: agg?.households ?? 0,
    totalAdults: agg?.total_adults ?? 0,
    totalKids: agg?.total_kids ?? 0,
    totalHeads: agg?.total_heads ?? 0,
    musicians: agg?.musicians ?? 0,
    omnivore: agg?.omnivore ?? 0,
    vegetarian: agg?.vegetarian ?? 0,
    vegan: agg?.vegan ?? 0,
    comingCount,
    decliningCount,
    noAnswerCount,
    respondedCount: comingCount + decliningCount,
    guestCount: comingCount + decliningCount + noAnswerCount,
  };
}

function listByAttending(clause: string): GuestRow[] {
  return db
    .query<GuestRow, []>(
      `SELECT * FROM guest WHERE merged_into IS NULL AND ${clause} ORDER BY updated_at DESC`,
    )
    .all();
}

export const getComing = (): GuestRow[] => listByAttending("attending = 1");
export const getDeclined = (): GuestRow[] => listByAttending("attending = 0");
export const getNoAnswer = (): GuestRow[] => listByAttending("attending IS NULL");

export function getSuperseded(): GuestRow[] {
  return db
    .query<GuestRow, []>("SELECT * FROM guest WHERE merged_into IS NOT NULL ORDER BY updated_at DESC")
    .all();
}

export interface VisitRow {
  id: number;
  guest_id: string | null;
  outcome: string;
  score: number | null;
  matched_kinds: string | null;
  ua: string | null;
  created_at: string;
}

export function getVisits(limit = 200): VisitRow[] {
  return db
    .query<VisitRow, [number]>(
      "SELECT id, guest_id, outcome, score, matched_kinds, ua, created_at FROM visit ORDER BY id DESC LIMIT ?",
    )
    .all(limit);
}
