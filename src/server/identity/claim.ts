import { base64UrlHmac, safeEqual } from "../hash";
import { ENV } from "../env";

// A short-lived, HMAC-signed ticket listing the guest ids a device is allowed to
// claim after a soft/ambiguous match or a name lookup. Prevents a client from
// claiming an arbitrary guest id it was never offered.

const TTL_MS = 15 * 60 * 1000;

interface ClaimPayload {
  ids: string[];
  exp: number;
}

export function makeClaimToken(guestIds: string[]): string {
  const payload: ClaimPayload = { ids: guestIds, exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = base64UrlHmac(encoded, ENV.cookieSecret);
  return `${encoded}.${sig}`;
}

export function verifyClaimToken(token: string): string[] | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, base64UrlHmac(encoded, ENV.cookieSecret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ClaimPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!Array.isArray(payload.ids)) return null;
    return payload.ids.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}
