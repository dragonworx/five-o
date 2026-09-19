import type { DetectionConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Returning-guest recognition. Server-only; never sent to the client. The
// thresholds are compared against the score from server/identity/score.ts.
// ─────────────────────────────────────────────────────────────────────────────

const detection: DetectionConfig = {
  cookieName: "fo_id",
  cookieMaxAgeDays: 400, // browser cap
  storageKey: "fiveo.visitor.v1", // must match STORAGE_KEY in client/storage.ts
  autoRecogniseAt: 0.9, // ≥ this → greet by name
  softMatchAt: 0.45, // ≥ this → "are you X?"  below → treat as new
  fingerprintTtlDays: 120,
  ipCorroborationOnly: true, // IP can never establish identity by itself
};

export default detection;
