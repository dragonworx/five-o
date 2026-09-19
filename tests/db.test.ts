import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";

// Use an isolated temp database: set DB_PATH before importing db.ts (which opens
// the connection and migrates at import time).
const DB_PATH = `/tmp/five-o-test-${crypto.randomUUID()}.sqlite`;
process.env.DB_PATH = DB_PATH;

const { db, withTestDatabase } = await import("../src/server/db");
const { createGuest, isNameTaken, resolveGuest, updateGuestRsvp, markMerged } = await import("../src/server/guests");
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

describe("unique full names", () => {
  beforeEach(() => db.run("DELETE FROM guest"));

  test("a name is taken regardless of case, accents or spacing", () => {
    createGuest(accept("José  García", 1, 0, null), null);
    expect(isNameTaken("jose garcia")).toBe(true);
    expect(isNameTaken("  JOSÉ GARCÍA ")).toBe(true);
    expect(isNameTaken("José García Jr")).toBe(false);
  });

  test("a guest's own name is not a conflict for them", () => {
    const priya = createGuest(accept("Priya", 1, 0, null), null);
    expect(isNameTaken("Priya", priya.id)).toBe(false);
    expect(isNameTaken("Priya", "someone-else")).toBe(true);
  });

  test("the database refuses a duplicate name even if the app check is bypassed", () => {
    createGuest(accept("Alex", 1, 0, null), null);
    expect(() => createGuest(accept("alex", 1, 0, null), null)).toThrow();
  });

  test("renaming onto another guest's name is refused by the database", () => {
    createGuest(accept("Alex", 1, 0, null), null);
    const sam = createGuest(decline("Sam"), null);
    expect(() => updateGuestRsvp(sam.id, decline("ALEX"))).toThrow();
  });

  test("a merged shell no longer holds its name", () => {
    const shell = createGuest(decline("Sam"), null);
    const survivor = createGuest(accept("Samuel", 1, 0, null), null);
    markMerged(shell.id, survivor.id);
    expect(isNameTaken("Sam")).toBe(false);
    expect(() => createGuest(decline("Sam"), null)).not.toThrow();
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

describe("test mode database", () => {
  const realGuestCount = () => db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM guest").get()?.n ?? 0;
  beforeEach(() => db.run("DELETE FROM guest"));

  test("writes inside withTestDatabase never reach the real database", () => {
    const guest = withTestDatabase(() => createGuest(accept("Ada", 2, 0, null), null));
    expect(realGuestCount()).toBe(0);
    expect(resolveGuest(guest.id)).toBeNull();
  });

  test("the flow still works: a test guest is readable by later test requests", () => {
    // The in-memory database persists across tests, so use a name no earlier test took.
    const guest = withTestDatabase(() => createGuest(accept("Ada Lovelace", 2, 0, null), null));
    expect(withTestDatabase(() => resolveGuest(guest.id))?.name).toBe("Ada Lovelace");
  });

  test("the test database stays selected across awaits", async () => {
    const found = await withTestDatabase(async () => {
      await Bun.sleep(1);
      const created = createGuest(accept("Grace", 1, 0, null), null);
      await Bun.sleep(1);
      return resolveGuest(created.id);
    });
    expect(found?.name).toBe("Grace");
    expect(realGuestCount()).toBe(0);
  });

  test("requests outside test mode still write to the real database", () => {
    createGuest(accept("Real", 1, 0, null), null);
    expect(realGuestCount()).toBe(1);
  });
});
