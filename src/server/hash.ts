import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Small hashing helpers. Raw IPs and raw tokens are never stored — only hashes.

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function base64UrlHmac(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

// Constant-time compare of two hex/base64 strings of equal length.
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Lowercase, diacritic-fold, collapse whitespace — for name matching.
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Reduce an IP to its /24 (IPv4) or /48 (IPv6) prefix so a whole household
// shares one value; it can only ever corroborate, never identify.
export function ipPrefix(ip: string): string {
  if (ip.includes(":")) {
    const hextets = ip.split(":");
    return `${hextets.slice(0, 3).join(":")}::/48`;
  }
  const octets = ip.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  return ip;
}

// Coarse UA family (browser + platform bucket), not the full string.
export function uaFamily(ua: string): string {
  const browsers: [RegExp, string][] = [
    [/Edg\//, "edge"],
    [/OPR\/|Opera/, "opera"],
    [/Firefox\//, "firefox"],
    [/Chrome\//, "chrome"],
    [/Safari\//, "safari"],
  ];
  const platforms: [RegExp, string][] = [
    [/iPhone|iPad|iOS/, "ios"],
    [/Android/, "android"],
    [/Macintosh/, "mac"],
    [/Windows/, "windows"],
    [/Linux/, "linux"],
  ];
  const match = (table: [RegExp, string][]): string => {
    for (const [re, label] of table) if (re.test(ua)) return label;
    return "other";
  };
  return `${match(browsers)}/${match(platforms)}`;
}

export function ipUaHash(ip: string, ua: string, pepper: string): string {
  return hmacHex(`${ipPrefix(ip)}|${uaFamily(ua)}`, pepper);
}
