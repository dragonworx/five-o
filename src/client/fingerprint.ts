import { getThumbmark } from "@thumbmarkjs/thumbmarkjs";

// ThumbmarkJS wrapper. Computes the local hash only (no api_key is passed, so the
// library never contacts its API — no phone-home) and is time-boxed so a slow
// fingerprint never blocks the identify request.

export async function getDeviceFingerprint(timeoutMs = 2500): Promise<string | undefined> {
  try {
    const timeout = new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), timeoutMs);
    });
    const result = await Promise.race([getThumbmark({ logging: false }), timeout]);
    if (result && typeof result === "object" && typeof result.thumbmark === "string") {
      return result.thumbmark;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
