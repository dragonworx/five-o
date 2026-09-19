import { tooManyRequests, type ApiContext } from "../http";
import { rateLimit } from "../ratelimit";
import {
  handleClaim,
  handleDeleteMe,
  handleIdentify,
  handleLookup,
  handleMe,
  handleOverride,
} from "./identify";
import { handleNameCheck, handleRsvp, handleSlidesComplete } from "./rsvp";

type Handler = (req: Request, ctx: ApiContext) => Response | Promise<Response>;

interface Route {
  handler: Handler;
  /** Requests allowed per client IP per window. */
  perIp: number;
}

// Every route is rate-limited per IP so a script can't flood the guest list (or
// the in-memory test database). Limits are generous because a mobile carrier
// can put many guests behind one IP; a real guest makes a handful of calls.
const WINDOW_MS = 10 * 60 * 1000;

const ROUTES: Record<string, Partial<Record<string, Route>>> = {
  "/api/identify": { POST: { handler: handleIdentify, perIp: 60 } },
  "/api/claim": { POST: { handler: handleClaim, perIp: 20 } },
  "/api/override": { POST: { handler: (req) => handleOverride(req), perIp: 20 } },
  "/api/lookup": { POST: { handler: handleLookup, perIp: 8 } }, // name guessing
  "/api/name-check": { POST: { handler: (req) => handleNameCheck(req), perIp: 40 } }, // fires as the guest types
  "/api/rsvp": { POST: { handler: handleRsvp, perIp: 20 } },
  "/api/slides-complete": { POST: { handler: (req) => handleSlidesComplete(req), perIp: 30 } },
  "/api/me": {
    GET: { handler: (req) => handleMe(req), perIp: 60 },
    DELETE: { handler: (req) => handleDeleteMe(req), perIp: 10 },
  },
};

// Returns null when the path is not a dynamic API route (so the caller can fall
// through to static serving). /api/config and /healthz are handled by the
// static routes object in index.ts.
export function dispatchApi(pathname: string, req: Request, ctx: ApiContext): Response | Promise<Response> | null {
  const methods = ROUTES[pathname];
  if (!methods) return null;
  const route = methods[req.method];
  if (!route) return new Response("Method not allowed", { status: 405 });
  const rl = rateLimit(`${req.method} ${pathname}:${ctx.ip}`, route.perIp, WINDOW_MS);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSeconds);
  return route.handler(req, ctx);
}
