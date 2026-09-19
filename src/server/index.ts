import { join, normalize } from "node:path";
import { CONFIG } from "../config/party.config";
import { toPublicConfig } from "../config/public-config";
import { renderShell } from "./html";
import { db, withTestDatabase } from "./db"; // opens the database and runs migrations at boot
import { getClientIp, getUserAgent } from "./http";
import { dispatchApi } from "./routes/api";
import { dispatchAdmin, rebuildAdminBundle } from "./admin";
import { readAppCss, STYLES_DIR } from "./styles";
import { handleLiveReload, watchSources } from "./live-reload";
import { TEST_MODE_HEADER } from "../shared/test-mode";

// ─────────────────────────────────────────────────────────────────────────────
// Bun server. This is the runnable skeleton (Phase 1): it serves the config-
// driven HTML shell, the public config, the client bundle and static assets.
// API routes and the admin console are added in later phases.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_DIR = join(import.meta.dir, "..", "..", "public");
const IS_PROD = process.env.NODE_ENV === "production";

// Build the client bundle at boot; --watch restarts on server changes, and
// live-reload.ts rebuilds it (and the CSS) on client edits in `dev:watch`.
async function buildClient(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "..", "client", "main.ts")],
    target: "browser",
    minify: IS_PROD,
    // An inline map is ~6x the size of the code itself; only worth it in dev.
    sourcemap: IS_PROD ? "none" : "inline",
  });
  if (!result.success) {
    console.error("Client build failed:", result.logs);
    return "document.getElementById('app').textContent = 'Client build failed.';";
  }
  const [out] = result.outputs;
  return out ? await out.text() : "";
}

// The shell (no-store) links the bundle and stylesheet by content hash, so the
// browser caches them forever and a deploy with new content changes the URL.
let clientJs = "";
let clientVersion = "";
let appCss = "";
let cssVersion = "";

async function loadClient(): Promise<void> {
  clientJs = await buildClient();
  clientVersion = Bun.hash(clientJs).toString(36);
}

function loadCss(): void {
  appCss = readAppCss();
  cssVersion = Bun.hash(appCss).toString(36);
}

await loadClient();
loadCss();

const shellAssets = () => ({
  script: `/client.js?v=${clientVersion}`,
  stylesheet: `/app.css?v=${cssVersion}`,
});

// Immutable only when the request names the current version; a stale or missing
// ?v= (an old tab after a deploy) must not pin whatever is served now.
function versionedAsset(req: Request, body: string, contentType: string, version: string): Response {
  const current = new URL(req.url).searchParams.get("v") === version;
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": current ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

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
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

const JPEG_EXT = /\.jpe?g$/i;

// A JPEG with a .webp sibling (written by `bun run slides`) is swapped for the
// WebP when the browser advertises support. Vary keeps caches per format.
async function webpSibling(req: Request, filePath: string): Promise<string | null> {
  if (!JPEG_EXT.test(filePath)) return null;
  if (!(req.headers.get("accept") ?? "").includes("image/webp")) return null;
  const webpPath = filePath.replace(JPEG_EXT, ".webp");
  return (await Bun.file(webpPath).exists()) ? webpPath : null;
}

// Serve a file from /public with a path-traversal guard.
async function serveStatic(req: Request, pathname: string): Promise<Response> {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await Bun.file(filePath).exists())) {
    return new Response("Not found", { status: 404 });
  }
  const webpPath = await webpSibling(req, filePath);
  const servedPath = webpPath ?? filePath;
  const ext = servedPath.slice(servedPath.lastIndexOf(".")).toLowerCase();
  const type = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const immutable = pathname.startsWith("/dist/");
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600",
  };
  if (JPEG_EXT.test(filePath)) headers.Vary = "Accept";
  return new Response(Bun.file(servedPath), { headers });
}

const server = Bun.serve({
  port: CONFIG.server.port,
  // The largest legitimate request (an RSVP) is a few KB; the default is 128 MB.
  maxRequestBodySize: 64 * 1024,
  routes: {
    "/": (req: Request) => {
      const nonce = crypto.randomUUID().replaceAll("-", "");
      return new Response(renderShell(nonce, shellAssets()), {
        headers: noStore({ "Content-Type": "text/html; charset=utf-8", ...securityHeaders(nonce) }),
      });
    },

    "/client.js": (req: Request) =>
      versionedAsset(req, clientJs, "text/javascript; charset=utf-8", clientVersion),

    "/app.css": (req: Request) => versionedAsset(req, appCss, "text/css; charset=utf-8", cssVersion),

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

    const live = handleLiveReload(req, url.pathname, server);
    if (live) return live;

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
    return serveStatic(req, url.pathname);
  },
});

const SRC_DIR = join(import.meta.dir, "..");
watchSources([
  {
    dirs: [STYLES_DIR],
    rebuild: () => {
      loadCss();
      return { type: "css", version: cssVersion };
    },
  },
  {
    dirs: [join(SRC_DIR, "client"), join(SRC_DIR, "shared")],
    rebuild: async () => {
      await loadClient();
      return { type: "reload" };
    },
  },
  {
    dirs: [join(SRC_DIR, "admin")],
    rebuild: async () => {
      await rebuildAdminBundle();
      return { type: "reload" };
    },
  },
]);

console.log(`Five-O running at http://localhost:${server.port}`);
