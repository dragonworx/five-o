import type { ZodType } from "zod";
import { CONFIG } from "../config/party.config";

// JSON response + request helpers. Every API response is no-store.

// Minimal structural type for the bits of Bun's Server we use — avoids coupling
// to Bun's generic Server<WebSocketData> signature.
interface IpServer {
  requestIP(req: Request): { address: string } | null;
}

export interface ApiContext {
  ip: string;
  ua: string;
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid request" };
  }
  return { ok: true, data: result.data };
}

export function json(data: unknown, init: { status?: number; cookie?: string } = {}): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (init.cookie) headers["Set-Cookie"] = init.cookie;
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found"): Response {
  return json({ error: message }, { status: 404 });
}

export function forbidden(message = "Forbidden"): Response {
  return json({ error: message }, { status: 403 });
}

// `code` lets the client tell a specific rejection apart from a generic failure.
export function conflict(message: string, code: string): Response {
  return json({ error: message, code }, { status: 409 });
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfterSeconds),
    },
  });
}

// With trustProxy, the right-most X-Forwarded-For entry is the one our own proxy
// (Caddy) wrote; anything to its left came from the client and can be forged.
export function getClientIp(req: Request, server: IpServer): string {
  if (CONFIG.server.trustProxy) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const last = xff.split(",").at(-1)?.trim();
      if (last) return last;
    }
  }
  return server.requestIP(req)?.address ?? "0.0.0.0";
}

export function getUserAgent(req: Request): string {
  return req.headers.get("user-agent") ?? "";
}
