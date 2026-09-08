import type { ApiContext } from "../http";
import {
  handleClaim,
  handleDeleteMe,
  handleIdentify,
  handleLookup,
  handleMe,
  handleOverride,
} from "./identify";
import { handleRsvp, handleSlidesComplete } from "./rsvp";

type Handler = (req: Request, ctx: ApiContext) => Response | Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/identify": { POST: handleIdentify },
  "/api/claim": { POST: handleClaim },
  "/api/override": { POST: (req) => handleOverride(req) },
  "/api/lookup": { POST: handleLookup },
  "/api/rsvp": { POST: handleRsvp },
  "/api/slides-complete": { POST: (req) => handleSlidesComplete(req) },
  "/api/me": { GET: (req) => handleMe(req), DELETE: (req) => handleDeleteMe(req) },
};

// Returns null when the path is not a dynamic API route (so the caller can fall
// through to static serving). /api/config and /healthz are handled by the
// static routes object in index.ts.
export function dispatchApi(pathname: string, req: Request, ctx: ApiContext): Response | Promise<Response> | null {
  const methods = ROUTES[pathname];
  if (!methods) return null;
  const handler = methods[req.method];
  if (!handler) return new Response("Method not allowed", { status: 405 });
  return handler(req, ctx);
}
