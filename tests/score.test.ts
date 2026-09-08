import { describe, expect, test } from "bun:test";
import {
  identify,
  noisyOr,
  scoreCandidate,
  type Candidate,
  type ScoreOptions,
} from "../src/server/identity/score";
import {
  DEFAULT_SIGNAL_WEIGHTS,
  FINGERPRINT_COLLISION_WEIGHT,
} from "../src/server/identity/weights";

const OPTS: ScoreOptions = {
  autoRecogniseAt: 0.9,
  softMatchAt: 0.45,
  ipCorroborationOnly: true,
  ambiguityDelta: 0.15,
};

const w = DEFAULT_SIGNAL_WEIGHTS;

function guest(guestId: string, ...signals: Candidate["signals"]): Candidate {
  return { guestId, signals };
}

describe("noisyOr", () => {
  test("empty evidence scores zero", () => {
    expect(noisyOr([])).toBe(0);
  });
  test("single weight passes through", () => {
    expect(noisyOr([0.92])).toBeCloseTo(0.92, 5);
  });
  test("combines as 1 - product of complements", () => {
    expect(noisyOr([0.5, 0.12])).toBeCloseTo(0.56, 5);
  });
  test("stronger than naive addition but never exceeds 1", () => {
    expect(noisyOr([0.92, 0.88, 0.5])).toBeLessThan(1);
    expect(noisyOr([0.92, 0.88, 0.5])).toBeGreaterThan(0.92);
  });
});

describe("worked examples from the plan", () => {
  test("cookie only → 0.92 → auto", () => {
    const r = identify([guest("g1", { kind: "cookie", weight: w.cookie })], OPTS);
    expect(r.best?.score).toBeCloseTo(0.92, 5);
    expect(r.outcome).toBe("auto");
  });

  test("localStorage + fingerprint → 0.94 → auto", () => {
    const r = identify(
      [guest("g1", { kind: "local", weight: w.local }, { kind: "fingerprint", weight: w.fingerprint })],
      OPTS,
    );
    expect(r.best?.score).toBeCloseTo(0.94, 5);
    expect(r.outcome).toBe("auto");
  });

  test("fingerprint only → 0.50 → soft", () => {
    const r = identify([guest("g1", { kind: "fingerprint", weight: w.fingerprint })], OPTS);
    expect(r.best?.score).toBeCloseTo(0.5, 5);
    expect(r.outcome).toBe("soft");
  });

  test("fingerprint + IP → 0.56 → soft (device-local lets IP corroborate)", () => {
    const r = identify(
      [guest("g1", { kind: "fingerprint", weight: w.fingerprint }, { kind: "ipua", weight: w.ipua })],
      OPTS,
    );
    expect(r.best?.score).toBeCloseTo(0.56, 5);
    expect(r.outcome).toBe("soft");
  });

  test("IP only → capped → treated as new", () => {
    const r = identify([guest("g1", { kind: "ipua", weight: w.ipua })], OPTS);
    expect(r.outcome).toBe("new");
    expect(r.best).toBeNull();
  });
});

describe("guards against false positives", () => {
  test("twelve friends on one Wi-Fi never collapse into one identity", () => {
    const candidates = Array.from({ length: 12 }, (_, i) =>
      guest(`friend-${i}`, { kind: "ipua", weight: w.ipua }),
    );
    const r = identify(candidates, OPTS);
    expect(r.outcome).toBe("new");
    expect(r.best).toBeNull();
    expect(r.contenders).toHaveLength(0);
  });

  test("two identical iPhones (fingerprint collision) stay below the soft threshold", () => {
    const r = identify(
      [
        guest("a", { kind: "fingerprint", weight: FINGERPRINT_COLLISION_WEIGHT }),
        guest("b", { kind: "fingerprint", weight: FINGERPRINT_COLLISION_WEIGHT }),
      ],
      OPTS,
    );
    expect(r.outcome).toBe("new");
  });

  test("two close contenders are downgraded to ambiguous, never auto", () => {
    const r = identify(
      [
        guest("a", { kind: "cookie", weight: w.cookie }), // 0.92
        guest("b", { kind: "local", weight: w.local }, { kind: "fingerprint", weight: w.fingerprint }), // 0.94
      ],
      OPTS,
    );
    expect(r.outcome).toBe("ambiguous");
    expect(r.best).toBeNull();
    expect(r.contenders).toHaveLength(2);
  });

  test("a clear leader is not downgraded by a distant second", () => {
    const r = identify(
      [
        guest("a", { kind: "cookie", weight: w.cookie }), // 0.92
        guest("b", { kind: "fingerprint", weight: w.fingerprint }), // 0.50
      ],
      OPTS,
    );
    expect(r.outcome).toBe("auto");
    expect(r.best?.guestId).toBe("a");
  });
});

describe("IP corroboration cap", () => {
  test("ipua is dropped when no device-local signal matched the same guest", () => {
    const s = scoreCandidate(guest("g1", { kind: "ipua", weight: w.ipua }), OPTS);
    expect(s.score).toBe(0);
    expect(s.matchedKinds).not.toContain("ipua");
  });

  test("ipua counts when a device-local signal is present", () => {
    const s = scoreCandidate(
      guest("g1", { kind: "fingerprint", weight: w.fingerprint }, { kind: "ipua", weight: w.ipua }),
      OPTS,
    );
    expect(s.matchedKinds).toContain("ipua");
    expect(s.score).toBeCloseTo(0.56, 5);
  });

  test("with the cap disabled, ipua alone contributes its weight", () => {
    const s = scoreCandidate(guest("g1", { kind: "ipua", weight: w.ipua }), {
      ...OPTS,
      ipCorroborationOnly: false,
    });
    expect(s.score).toBeCloseTo(0.12, 5);
  });
});

describe("degenerate inputs", () => {
  test("no candidates → new", () => {
    expect(identify([], OPTS).outcome).toBe("new");
  });
  test("zero and negative weights are ignored", () => {
    const s = scoreCandidate(
      guest("g1", { kind: "cookie", weight: 0 }, { kind: "fingerprint", weight: -1 }),
      OPTS,
    );
    expect(s.score).toBe(0);
  });
});
