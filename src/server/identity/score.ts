// Signal kinds and the pure scoring model. This module has no I/O and no
// dependency on the database or config, so it is fully unit-testable — which
// matters because a bug here corrupts data rather than merely looking wrong.

export type SignalKind = "cookie" | "local" | "idb" | "cache" | "fingerprint" | "ipua";

// Signals that live on a single device/browser. Only these can establish
// identity; "ipua" (IP /24 + UA family) is shared across a household and is
// corroboration-only.
export const DEVICE_LOCAL_KINDS: readonly SignalKind[] = [
  "cookie",
  "local",
  "idb",
  "cache",
  "fingerprint",
];

export interface MatchedSignal {
  kind: SignalKind;
  weight: number;
}

export interface Candidate {
  guestId: string;
  signals: MatchedSignal[];
}

export interface ScoreOptions {
  autoRecogniseAt: number;
  softMatchAt: number;
  /** When true, an "ipua" match is discarded unless a device-local signal also matched. */
  ipCorroborationOnly: boolean;
  /** Two contenders within this score gap are downgraded to "ambiguous". */
  ambiguityDelta: number;
}

export type Outcome = "new" | "auto" | "soft" | "ambiguous";

export interface ScoredCandidate {
  guestId: string;
  score: number;
  matchedKinds: SignalKind[];
}

export interface IdentificationResult {
  outcome: Outcome;
  /** The chosen guest for "auto"/"soft"; null for "new"/"ambiguous". */
  best: ScoredCandidate | null;
  /** Candidates at or above softMatchAt, sorted descending — powers the chooser. */
  contenders: ScoredCandidate[];
}

const MAX_WEIGHT = 0.999;

function clampWeight(w: number): number {
  if (!Number.isFinite(w) || w <= 0) return 0;
  return Math.min(w, MAX_WEIGHT);
}

// Noisy-OR: combine independent pieces of evidence as 1 - Π(1 - wᵢ). The right
// model here — naive addition would let three weak signals outvote one strong one.
export function noisyOr(weights: readonly number[]): number {
  let product = 1;
  for (const w of weights) product *= 1 - clampWeight(w);
  return 1 - product;
}

// Apply the IP cap, then combine. A candidate whose only evidence is a shared IP
// scores zero, so twelve friends behind one Wi-Fi never collapse into one identity.
export function scoreCandidate(candidate: Candidate, opts: ScoreOptions): ScoredCandidate {
  const hasDeviceLocal = candidate.signals.some((s) =>
    DEVICE_LOCAL_KINDS.includes(s.kind),
  );
  const effective = candidate.signals.filter((s) => {
    if (s.kind === "ipua" && opts.ipCorroborationOnly && !hasDeviceLocal) return false;
    return clampWeight(s.weight) > 0;
  });
  const score = noisyOr(effective.map((s) => s.weight));
  return {
    guestId: candidate.guestId,
    score,
    matchedKinds: effective.map((s) => s.kind),
  };
}

function sortByScoreDesc(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.guestId < b.guestId ? -1 : 1; // stable, deterministic tie-break
}

export function identify(candidates: readonly Candidate[], opts: ScoreOptions): IdentificationResult {
  const scored = candidates
    .map((c) => scoreCandidate(c, opts))
    .filter((s) => s.score > 0)
    .sort(sortByScoreDesc);

  const contenders = scored.filter((s) => s.score >= opts.softMatchAt);
  if (contenders.length === 0) {
    return { outcome: "new", best: null, contenders: [] };
  }

  const [top, second] = contenders;
  if (!top) return { outcome: "new", best: null, contenders: [] };

  // Ambiguity is checked before auto-recognition: two close contenders must
  // never produce a silent auto-greet.
  if (second && top.score - second.score <= opts.ambiguityDelta) {
    return { outcome: "ambiguous", best: null, contenders };
  }

  if (top.score >= opts.autoRecogniseAt) {
    return { outcome: "auto", best: top, contenders };
  }
  return { outcome: "soft", best: top, contenders };
}
