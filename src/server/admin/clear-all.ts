import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CONFIG } from "../../config/party.config";
import { db, nowIso } from "../db";
import { ENV } from "../env";
import { sha256Hex } from "../hash";
import { forbidden, json } from "../http";

// The destructive wipe. Independent gates (config flag, a custom request header
// that a cross-site form can't send, the admin UI's confirm dialog, and an
// automatic backup-first) because a mis-click here is unrecoverable in a way
// nothing else in this app is.

// Basic-auth credentials are re-sent by the browser on cross-site requests, and
// nothing else in the admin checks origin. A custom header forces a CORS
// preflight this server never answers, so only the admin page itself can set it.
export const CLEAR_ALL_HEADER = "x-admin-action";
export const CLEAR_ALL_HEADER_VALUE = "clear-all";

export interface DestroyedCounts {
  guests: number;
  signals: number;
  visits: number;
  audit: number;
}

function countAll(): DestroyedCounts {
  const count = (table: string): number =>
    db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;
  return {
    guests: count("guest"),
    signals: count("identity_signal"),
    visits: count("visit"),
    audit: count("audit"),
  };
}

function backupNow(): string {
  mkdirSync(ENV.backupsDir, { recursive: true });
  const stamp = nowIso().replaceAll(":", "").replaceAll(".", "-");
  const path = join(ENV.backupsDir, `pre-clear-${stamp}.sqlite`);
  db.run(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  return path;
}

function logAdminAction(ip: string, destroyed: DestroyedCounts, backup: string | null): void {
  mkdirSync(ENV.backupsDir, { recursive: true });
  const entry = {
    action: "clear-all",
    at: nowIso(),
    ipHash: sha256Hex(`${ip}|${ENV.ipPepper}`),
    destroyed,
    backup,
  };
  appendFileSync(join(ENV.backupsDir, "admin_action.log"), `${JSON.stringify(entry)}\n`);
}

export function handleClearAll(req: Request, ip: string): Response {
  if (!CONFIG.admin.dangerZone.allowClearAll) return forbidden("Clear-all is disabled");

  if (req.headers.get(CLEAR_ALL_HEADER) !== CLEAR_ALL_HEADER_VALUE) return forbidden("Missing admin action header");

  const destroyed = countAll();

  let backupPath: string | null = null;
  if (CONFIG.admin.dangerZone.backupBeforeClear) {
    backupPath = backupNow();
    if (statSync(backupPath).size === 0) {
      return json({ error: "Backup produced an empty file — aborting" }, { status: 500 });
    }
  }

  db.transaction(() => {
    db.run("DELETE FROM audit;");
    db.run("DELETE FROM visit;");
    db.run("DELETE FROM identity_signal;");
    db.run("DELETE FROM guest;");
  })();
  db.run("VACUUM");

  logAdminAction(ip, destroyed, backupPath);
  return json({ ok: true, backup: backupPath, destroyed });
}
