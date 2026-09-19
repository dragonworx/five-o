import { Database } from "bun:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ENV } from "./env";

// Single SQLite connection in WAL mode, plus a tiny forward-only migration
// runner. Migrations are the *.sql files in ./migrations, applied in filename
// order and recorded in _migration so each runs exactly once.

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

function openDatabase(): Database {
  mkdirSync(dirname(ENV.dbPath), { recursive: true });
  const database = new Database(ENV.dbPath, { create: true, strict: true });
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  return database;
}

export const db = openDatabase();

function runMigrations(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migration (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`);

  const applied = new Set(
    db.query<{ name: string }, []>("SELECT name FROM _migration").all().map((r) => r.name),
  );
  const record = db.prepare("INSERT INTO _migration (name, applied_at) VALUES (?, ?)");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
    console.log(`[db] applied migration ${file}`);
  }
}

runMigrations(db);

// Test mode (dev only): requests tagged with ?test=1 run against a throwaway
// in-memory database, so the whole flow works but the real file never grows.
// Only the guest-facing data layer (guests.ts, identity/signals.ts) goes through
// currentDb(); admin code keeps using `db`, so it always sees the real data.
const requestDb = new AsyncLocalStorage<Database>();
let testDb: Database | null = null;

function openTestDatabase(): Database {
  if (!testDb) {
    testDb = new Database(":memory:", { strict: true });
    testDb.exec("PRAGMA foreign_keys = ON;");
    runMigrations(testDb);
    console.log("[db] test mode: using an in-memory database, the real database is untouched");
  }
  return testDb;
}

export function currentDb(): Database {
  return requestDb.getStore() ?? db;
}

// Runs `fn` (and everything it awaits) against the shared in-memory test
// database. State persists across requests until the server restarts.
export function withTestDatabase<T>(fn: () => T): T {
  return requestDb.run(openTestDatabase(), fn);
}

export function nowIso(): string {
  return new Date().toISOString();
}
