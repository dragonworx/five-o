import type { AdminConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Admin console (/admin). Server-only; never sent to the client.
// ─────────────────────────────────────────────────────────────────────────────

const admin: AdminConfig = {
  username: "ali",
  // argon2id — generate with: bun run scripts/hash-admin-password.ts
  // Overridden at runtime by the ADMIN_PASSWORD_HASH env var when set.
  passwordHash: "$argon2id$v=19$m=65536,t=2,p=1$REPLACE_ME$REPLACE_ME",
  realm: "Five-O Admin",
  dangerZone: {
    allowClearAll: true, // set false once real RSVPs start arriving
    confirmPhrase: "DELETE EVERYTHING",
    backupBeforeClear: true,
  },
};

export default admin;
