import { join } from "node:path";
import { CONFIG } from "../../config/party.config";
import { db } from "../db";
import type { GuestRow } from "../guests";
import { json, type ApiContext } from "../http";
import { requireAdmin } from "./auth";
import { handleClearAll } from "./clear-all";
import { handleCorrection } from "./correction";
import { guestsCsv, type CsvList } from "./export-csv";
import { renderAdminShell } from "./html";
import { getComing, getDeclined, getNoAnswer, getSuperseded, getSummary, getVisits } from "./queries";

async function buildAdmin(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "..", "..", "admin", "main.ts")],
    target: "browser",
    minify: process.env.NODE_ENV === "production",
    sourcemap: "inline",
  });
  if (!result.success) {
    console.error("Admin build failed:", result.logs);
    return "document.body.textContent = 'Admin build failed.';";
  }
  const [out] = result.outputs;
  return out ? await out.text() : "";
}

const adminJs = await buildAdmin();

interface AdminGuest {
  id: string;
  name: string;
  attending: boolean | null;
  adults: number;
  kids: number;
  isMusician: boolean;
  diet: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  mergedInto: string | null;
  overriddenFrom: string | null;
}

function serialize(g: GuestRow): AdminGuest {
  return {
    id: g.id,
    name: g.name,
    attending: g.attending === null ? null : g.attending === 1,
    adults: g.adults,
    kids: g.kids,
    isMusician: g.is_musician === 1,
    diet: g.diet,
    message: g.message,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    mergedInto: g.merged_into,
    overriddenFrom: g.overridden_from,
  };
}

function tableCount(table: string): number {
  return db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;
}

function adminCsp(nonce: string): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `style-src 'self' 'nonce-${nonce}'`,
      "script-src 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
  };
}

function shellResponse(): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  return new Response(renderAdminShell(nonce), {
    headers: { "Content-Type": "text/html; charset=utf-8", ...adminCsp(nonce) },
  });
}

function bundleResponse(): Response {
  return new Response(adminJs, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function guestsResponse(): Response {
  return json({
    summary: getSummary(),
    coming: getComing().map(serialize),
    declined: getDeclined().map(serialize),
    noAnswer: getNoAnswer().map(serialize),
    superseded: getSuperseded().map(serialize),
    danger: { allowClearAll: CONFIG.admin.dangerZone.allowClearAll },
    counts: {
      guests: tableCount("guest"),
      signals: tableCount("identity_signal"),
      visits: tableCount("visit"),
      audit: tableCount("audit"),
    },
  });
}

function csvResponse(req: Request): Response {
  const url = new URL(req.url);
  const raw = url.searchParams.get("list");
  const list: CsvList = raw === "declined" || raw === "all" ? raw : "attending";
  return new Response(guestsCsv(list), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guests-${list}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function routeAdminGet(pathname: string, req: Request): Response | null {
  if (pathname === "/admin") return shellResponse();
  if (pathname === "/admin/app.js") return bundleResponse();
  if (pathname === "/admin/api/guests") return guestsResponse();
  if (pathname === "/admin/api/visits") return json({ visits: getVisits() });
  if (pathname === "/admin/export.csv") return csvResponse(req);
  return null;
}

function routeAdminPost(pathname: string, req: Request, ctx: ApiContext): Response | Promise<Response> | null {
  if (pathname === "/admin/api/clear-all") return handleClearAll(req, ctx.ip);
  const correction = /^\/admin\/api\/guests\/([^/]+)$/.exec(pathname);
  if (correction?.[1]) return handleCorrection(req, correction[1]);
  return null;
}

export async function dispatchAdmin(
  pathname: string,
  req: Request,
  ctx: ApiContext,
): Promise<Response | null> {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;

  const authFailure = await requireAdmin(req, ctx.ip);
  if (authFailure) return authFailure;

  const routed = req.method === "GET" ? routeAdminGet(pathname, req) : null;
  const posted = req.method === "POST" ? routeAdminPost(pathname, req, ctx) : null;
  return routed ?? posted ?? new Response("Not found", { status: 404 });
}
