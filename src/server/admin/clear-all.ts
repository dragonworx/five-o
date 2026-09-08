import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CONFIG } from "../../config/party.config";
import { db, nowIso } from "../db";
import { ENV } from "../env";
import { sha256Hex } from "../hash";
import { badRequest, forbidden, json } from "../http";

// The destructive wipe. Four independent gates (config flag, typed phrase,
// server re-verification, automatic backup-first) because a mis-click here is
// unrecoverable in a way nothing else in this app is.

const clearSchema = z.object({ confirmPhrase: z.string() });

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

export async function handleClearAll(req: Request, ip: string): Promise<Response> {
  if (!CONFIG.admin.dangerZone.allowClearAll) return forbidden("Clear-all is disabled");

  const raw = await req.json().catch(() => null);
  const parsed = clearSchema.safeParse(raw);
  if (!parsed.success) return badRequest("Missing confirmation");
  if (parsed.data.confirmPhrase !== CONFIG.admin.dangerZone.confirmPhrase) {
    return badRequest("Confirmation phrase does not match");
  }

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
