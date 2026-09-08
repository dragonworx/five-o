import { base64UrlHmac, safeEqual } from "../hash";
import { ENV } from "../env";
import { CONFIG } from "../../config/party.config";

const COOKIE_NAME = CONFIG.detection.cookieName;

// Secure is required in production (HTTPS-only) but must be omitted in local dev,
// where the app is served over http and browsers/curl would otherwise drop it.
const SECURE_ATTR = ENV.isProd ? " Secure;" : "";
const BASE_ATTRS = `Path=/; HttpOnly;${SECURE_ATTR} SameSite=Lax`;

// The fo_id cookie carries the guest id, HMAC-signed so it can't be forged.
// Format: "<guestId>.<base64url(hmac)>".

export function signGuestId(guestId: string): string {
  const sig = base64UrlHmac(guestId, ENV.cookieSecret);
  return `${guestId}.${sig}`;
}

export function verifyGuestToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const guestId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = base64UrlHmac(guestId, ENV.cookieSecret);
  if (!safeEqual(sig, expected)) return null;
  return guestId;
}

export function cookieHeader(guestId: string, maxAgeDays: number): string {
  const value = signGuestId(guestId);
  const maxAge = Math.floor(maxAgeDays * 24 * 60 * 60);
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${maxAge}; ${BASE_ATTRS}`;
}

// The standard session cookie using the configured max age.
export function sessionCookieHeader(guestId: string): string {
  return cookieHeader(guestId, CONFIG.detection.cookieMaxAgeDays);
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; Max-Age=0; ${BASE_ATTRS}`;
}

export function readGuestFromCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== COOKIE_NAME) continue;
    const raw = decodeURIComponent(part.slice(eq + 1).trim());
    return verifyGuestToken(raw);
  }
  return null;
}
