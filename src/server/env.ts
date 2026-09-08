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

export const ENV = {
  isProd: IS_PROD,
  dbPath: process.env.DB_PATH ?? "./data/five-o.sqlite",
  ipPepper: required("IP_PEPPER", "dev-ip-pepper-not-for-production"),
  cookieSecret: required("COOKIE_SECRET", "dev-cookie-secret-not-for-production"),
  // Config holds a non-secret default; the env var wins when present.
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? CONFIG.admin.passwordHash,
  backupsDir: process.env.BACKUPS_DIR ?? "./backups",
} as const;
