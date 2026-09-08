import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";

// Use an isolated temp database: set DB_PATH before importing db.ts (which opens
// the connection and migrates at import time).
const DB_PATH = `/tmp/five-o-test-${crypto.randomUUID()}.sqlite`;
process.env.DB_PATH = DB_PATH;

const { db } = await import("../src/server/db");
const { createGuest, updateGuestRsvp, markMerged } = await import("../src/server/guests");
const { getSummary } = await import("../src/server/admin/queries");

type Fields = Parameters<typeof createGuest>[0];

function accept(name: string, adults: number, kids: number, diet: Fields["diet"], musician = false): Fields {
  return { name, attending: true, adults, kids, isMusician: musician, diet, message: null };
}
function decline(name: string): Fields {
  return { name, attending: false, adults: 0, kids: 0, isMusician: false, diet: null, message: null };
}

afterAll(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(DB_PATH + suffix);
    } catch {
      /* already gone */
    }
  }
});

describe("CHECK constraints", () => {
  beforeEach(() => db.run("DELETE FROM guest"));

  test("a decline cannot carry a headcount", () => {
    expect(() =>
      db.run(
        `INSERT INTO guest (id,name,name_normalised,attending,adults,kids,is_musician,created_at,updated_at)
         VALUES ('c1','X','x',0,2,0,0,'t','t')`,
      ),
    ).toThrow();
  });

  test("an acceptance must bring at least one adult", () => {
    expect(() =>
      db.run(
        `INSERT INTO guest (id,name,name_normalised,attending,adults,kids,is_musician,created_at,updated_at)
         VALUES ('c2','X','x',1,0,0,0,'t','t')`,
      ),
    ).toThrow();
  });

  test("a valid acceptance and a valid decline insert cleanly", () => {
    expect(() => createGuest(accept("Ok", 1, 0, "omnivore"), null)).not.toThrow();
    expect(() => createGuest(decline("Nope"), null)).not.toThrow();
  });
});

describe("headcount aggregates", () => {
  let priyaId = "";

  beforeEach(() => {
    db.run("DELETE FROM guest");
    priyaId = createGuest(accept("Priya", 2, 1, "vegetarian", true), null).id;
    createGuest(accept("Alex", 1, 0, "vegan"), null);
    createGuest(decline("Sam"), null);
  });

  test("totals count only attending, non-merged rows", () => {
    const s = getSummary();
    expect(s.totalHeads).toBe(4);
    expect(s.totalAdults).toBe(3);
    expect(s.totalKids).toBe(1);
    expect(s.vegetarian).toBe(1);
    expect(s.vegan).toBe(1);
    expect(s.omnivore).toBe(0);
    expect(s.musicians).toBe(1);
    expect(s.comingCount).toBe(2);
    expect(s.decliningCount).toBe(1);
    expect(s.noAnswerCount).toBe(0);
    expect(s.respondedCount).toBe(3);
  });

  test("flipping yes → no zeroes that party's contribution", () => {
    updateGuestRsvp(priyaId, decline("Priya"));
    const s = getSummary();
    expect(s.totalHeads).toBe(1); // only Alex remains
    expect(s.totalAdults).toBe(1);
    expect(s.totalKids).toBe(0);
    expect(s.comingCount).toBe(1);
    expect(s.decliningCount).toBe(2);
  });

  test("merged (superseded) rows are excluded from every total", () => {
    const ghost = createGuest(accept("Ghost", 5, 5, "omnivore"), null);
    markMerged(ghost.id, priyaId);
    const s = getSummary();
    expect(s.totalHeads).toBe(4); // ghost's 10 heads excluded
    expect(s.comingCount).toBe(2);
  });
});
