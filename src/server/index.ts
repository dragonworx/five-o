import { join, normalize } from "node:path";
import { CONFIG } from "../config/party.config";
import { toPublicConfig } from "../config/public-config";
import { renderShell } from "./html";
import { db, withTestDatabase } from "./db"; // opens the database and runs migrations at boot
import { getClientIp, getUserAgent } from "./http";
import { dispatchApi } from "./routes/api";
import { dispatchAdmin } from "./admin";
import { APP_CSS } from "./styles";
import { TEST_MODE_HEADER } from "../shared/test-mode";

// ─────────────────────────────────────────────────────────────────────────────
// Bun server. This is the runnable skeleton (Phase 1): it serves the config-
// driven HTML shell, the public config, the client bundle and static assets.
// API routes and the admin console are added in later phases.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_DIR = join(import.meta.dir, "..", "..", "public");

// Build the client bundle once at boot; --watch rebuilds on change in dev.
async function buildClient(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "..", "client", "main.ts")],
    target: "browser",
    minify: process.env.NODE_ENV === "production",
    sourcemap: "inline",
  });
  if (!result.success) {
    console.error("Client build failed:", result.logs);
    return "document.getElementById('app').textContent = 'Client build failed.';";
  }
  const [out] = result.outputs;
  return out ? await out.text() : "";
}

const clientJs = await buildClient();

function securityHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "img-src 'self' data:",
    `style-src 'self' 'nonce-${nonce}'`,
    "script-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function noStore(headers: Record<string, string> = {}): Record<string, string> {
  return { "Cache-Control": "no-store", ...headers };
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

// Serve a file from /public with a path-traversal guard.
async function serveStatic(pathname: string): Promise<Response> {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }
  const ext = filePath.slice(filePath.lastIndexOf("."));
  const type = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const immutable = pathname.startsWith("/dist/");
  return new Response(file, {
    headers: {
      "Content-Type": type,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    },
  });
}

const server = Bun.serve({
  port: CONFIG.server.port,
  routes: {
    "/": (req: Request) => {
      const nonce = crypto.randomUUID().replaceAll("-", "");
      return new Response(renderShell(nonce), {
        headers: noStore({ "Content-Type": "text/html; charset=utf-8", ...securityHeaders(nonce) }),
      });
    },

    "/client.js": () =>
      new Response(clientJs, {
        headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
      }),

    "/app.css": () =>
      new Response(APP_CSS, {
        headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" },
      }),

    "/api/config": () =>
      Response.json(toPublicConfig(CONFIG), { headers: noStore() }),

    "/healthz": () => {
      const guests = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM guest").get()?.n ?? 0;
      const visits = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM visit").get()?.n ?? 0;
      return Response.json({ ok: true, ts: new Date().toISOString(), guests, visits }, { headers: noStore() });
    },
  },

  // Fallback: dynamic API routes, then static assets from /public.
  async fetch(req: Request, server): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      const ctx = { ip: getClientIp(req, server), ua: getUserAgent(req) };
      const res = await dispatchAdmin(url.pathname, req, ctx);
      if (res) return res;
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname.startsWith("/api/")) {
      const ctx = { ip: getClientIp(req, server), ua: getUserAgent(req) };
      const testMode = req.headers.get(TEST_MODE_HEADER) === "1";
      const dispatch = () => dispatchApi(url.pathname, req, ctx);
      const res = await (testMode ? withTestDatabase(dispatch) : dispatch());
      if (res) {
        if (testMode) res.headers.set(TEST_MODE_HEADER, "1"); // lets the client show its badge
        return res;
      }
      return new Response("Not found", { status: 404 });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    return serveStatic(url.pathname);
  },
});

console.log(`Five-O running at http://localhost:${server.port}`);
