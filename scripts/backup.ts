import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ENV } from "../src/server/env";

// Hourly backup via VACUUM INTO, keeping the newest 48 copies. Run from a systemd
// timer. The whole guest list is a few hundred KB — there is no excuse to lose it.

const KEEP = 48;

function backup(): string {
  mkdirSync(ENV.backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
  const target = join(ENV.backupsDir, `five-o-${stamp}.sqlite`);
  const db = new Database(ENV.dbPath, { readonly: true });
  db.run(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  db.close();
  return target;
}

function prune(): void {
  const files = readdirSync(ENV.backupsDir)
    .filter((f) => f.startsWith("five-o-") && f.endsWith(".sqlite"))
    .map((f) => join(ENV.backupsDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const stale of files.slice(KEEP)) unlinkSync(stale);
}

const path = backup();
prune();
console.log(`[backup] wrote ${path}`);
