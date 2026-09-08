import type { SignalKind } from "./score";

// Initial signal weights (see the plan's §4.1 table). Stored per-row in
// identity_signal so they can be mutated by decay and collision penalties.
export const DEFAULT_SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  cookie: 0.92, // strongest — survives everything but a deliberate clear
  local: 0.88,
  idb: 0.04, // cheap corroborating mirror
  cache: 0.04,
  fingerprint: 0.5, // never sufficient alone
  ipua: 0.12, // household / carrier NAT — corroboration only
};

// A fingerprint hash linked to ≥ 2 distinct guests is a non-unique device model;
// its weight is pinned down to this value.
export const FINGERPRINT_COLLISION_WEIGHT = 0.15;

// Fingerprints older than the TTL lose half their weight before expiring.
export const FINGERPRINT_DECAY_FACTOR = 0.5;

// Two contenders within this score gap are treated as ambiguous.
export const AMBIGUITY_DELTA = 0.15;
