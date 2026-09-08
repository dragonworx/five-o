import { CONFIG } from "../../config/party.config";
import { ENV } from "../env";
import { safeEqual } from "../hash";
import { tooManyRequests } from "../http";

// HTTP Basic auth for the admin console. Acceptable here because the whole site
// is HTTPS-only (HSTS on) and the scope is one host. Failed attempts are
// rate-limited per IP with exponential backoff, and every attempt is logged.

interface FailureState {
  count: number;
  windowResetAt: number;
  blockedUntil: number;
}

const failures = new Map<string, FailureState>();
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function parseBasic(req: Request): { user: string; pass: string } | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

function blockedFor(ip: string): number {
  const state = failures.get(ip);
  if (!state) return 0;
  const remaining = state.blockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function registerFailure(ip: string): void {
  const now = Date.now();
  const state = failures.get(ip) ?? { count: 0, windowResetAt: now + WINDOW_MS, blockedUntil: 0 };
  if (state.windowResetAt <= now) {
    state.count = 0;
    state.windowResetAt = now + WINDOW_MS;
  }
  state.count += 1;
  if (state.count >= MAX_FAILURES) {
    // Exponential backoff beyond the threshold.
    const over = state.count - MAX_FAILURES;
    state.blockedUntil = now + Math.min(WINDOW_MS, 1000 * 2 ** over);
  }
  failures.set(ip, state);
}

function clearFailures(ip: string): void {
  failures.delete(ip);
}

function challenge(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${CONFIG.admin.realm}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

async function verifyPassword(pass: string): Promise<boolean> {
  try {
    return await Bun.password.verify(pass, ENV.adminPasswordHash);
  } catch {
    return false;
  }
}

// Returns a Response (401/429) when the request is not authenticated, or null
// when it is. Callers must short-circuit on a non-null return.
export async function requireAdmin(req: Request, ip: string): Promise<Response | null> {
  const blockedSeconds = blockedFor(ip);
  if (blockedSeconds > 0) {
    console.warn(`[admin] blocked login attempt from ${ip}`);
    return tooManyRequests(blockedSeconds);
  }

  const creds = parseBasic(req);
  if (!creds) return challenge();

  const userOk = safeEqual(creds.user, CONFIG.admin.username);
  const passOk = await verifyPassword(creds.pass);
  if (!userOk || !passOk) {
    registerFailure(ip);
    console.warn(`[admin] failed login for user "${creds.user}" from ${ip}`);
    return challenge();
  }

  clearFailures(ip);
  return null;
}
