import { CONFIG } from "../config/party.config";

// Secrets and deployment paths come from the environment. In development we
// fall back to fixed dev values and warn loudly, so a misconfigured production
// deploy is obvious rather than silent.

const IS_PROD = process.env.NODE_ENV === "production";

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (IS_PROD) {
    throw new Error(`Missing required environment variable ${name} in production`);
  }
  console.warn(`[env] ${name} not set — using an insecure development default`);
  return devFallback;
}

// The hash is written with every `$` doubled so Docker Compose leaves it alone
// in `.env`. Bun's own `.env` loader has no `$$` escape and expands `$argon2id`
// etc. to empty strings, so when the env value is not a usable hash we re-read
// the raw `.env` line and undouble it. Compose already undoubles it in the
// container, and a shell-provided single-`$` hash passes through untouched.
const ARGON2_PREFIX = "$argon2";

async function readAdminPasswordHash(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD_HASH;
  if (fromEnv?.startsWith(ARGON2_PREFIX)) return fromEnv;

  if (fromEnv) {
    try {
      const text = await Bun.file(".env").text();
      const line = text.match(/^\s*ADMIN_PASSWORD_HASH\s*=\s*(.+?)\s*$/m)?.[1];
      const raw = line?.replace(/^(['"])(.*)\1$/, "$2").replaceAll("$$", "$");
      if (raw?.startsWith(ARGON2_PREFIX)) return raw;
    } catch {
      // no readable .env — fall through to the value as given
    }
    console.warn("[env] ADMIN_PASSWORD_HASH is not a valid argon2 hash — admin login will fail");
    return fromEnv;
  }

  // Config holds a non-secret default; the env var wins when present.
  return CONFIG.admin.passwordHash;
}

export const ENV = {
  isProd: IS_PROD,
  dbPath: process.env.DB_PATH ?? "./data/five-o.sqlite",
  ipPepper: required("IP_PEPPER", "dev-ip-pepper-not-for-production"),
  cookieSecret: required("COOKIE_SECRET", "dev-cookie-secret-not-for-production"),
  adminPasswordHash: await readAdminPasswordHash(),
  backupsDir: process.env.BACKUPS_DIR ?? "./backups",
} as const;
