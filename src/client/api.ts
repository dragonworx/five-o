import type { PublicConfig } from "../config/public-config";
import { TEST_MODE_HEADER, TEST_MODE_QUERY_PARAM } from "../shared/test-mode";
import { showTestBadge } from "./test-badge";

// Client-side mirror of the server's guest summary and endpoint response shapes.
// Redeclared here (rather than imported from the server) so the client bundle
// never pulls in server modules such as bun:sqlite.

export type Diet = "omnivore" | "vegetarian" | "vegan";

export interface GuestSummary {
  id: string;
  name: string;
  attending: boolean | null;
  adults: number;
  kids: number;
  isMusician: boolean;
  diet: Diet | null;
  message: string | null;
  slidesSeenAt: string | null;
}

export interface DeviceSignals {
  storageToken?: string;
  idbToken?: string;
  cacheToken?: string;
  fingerprint?: string;
}

export interface SoftMatch {
  guestId: string;
  name: string;
}

export type IdentifyResponse =
  | { outcome: "auto"; guest: GuestSummary }
  | { outcome: "soft"; candidate: SoftMatch; claimToken: string }
  | { outcome: "ambiguous"; candidates: SoftMatch[]; claimToken: string }
  | { outcome: "new" };

export interface LookupMatch {
  guestId: string;
  label: string;
}

export interface LookupResponse {
  outcome: "lookup" | "new";
  matches: LookupMatch[];
  claimToken?: string;
}

export interface OverrideResponse {
  outcome: "new";
  previousGuestId: string | null;
}

export interface RsvpPayload extends DeviceSignals {
  name: string;
  attending: boolean;
  adults: number;
  kids: number;
  isMusician: boolean;
  diet?: Diet;
  message?: string;
  overriddenFrom?: string;
}

// ?test=1 on the page URL tags every request so a dev server keeps the run out
// of the real database. Read once at load; the hash router never drops the query.
const TEST_MODE = new URLSearchParams(window.location.search).get(TEST_MODE_QUERY_PARAM) === "1";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return TEST_MODE ? { ...extra, [TEST_MODE_HEADER]: "1" } : extra;
}

// The server echoes the header only when it really switched to the test database.
function noteTestMode(res: Response): void {
  if (res.headers.get(TEST_MODE_HEADER) === "1") showTestBadge();
}

/** A non-2xx API response, carrying the server's machine-readable `code` when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`${path} failed: ${status}`);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  noteTestMode(res);
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { code?: unknown } | null;
    throw new ApiError(path, res.status, typeof detail?.code === "string" ? detail.code : null);
  }
  return (await res.json()) as T;
}

export async function fetchConfig(): Promise<PublicConfig> {
  const res = await fetch("/api/config", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`config failed: ${res.status}`);
  return (await res.json()) as PublicConfig;
}

export function identify(signals: DeviceSignals): Promise<IdentifyResponse> {
  return postJson<IdentifyResponse>("/api/identify", signals);
}

export function claim(guestId: string, claimToken: string, signals: DeviceSignals): Promise<IdentifyResponse> {
  return postJson<IdentifyResponse>("/api/claim", { guestId, claimToken, ...signals });
}

export function override(signals: DeviceSignals): Promise<OverrideResponse> {
  return postJson<OverrideResponse>("/api/override", signals);
}

export function lookup(name: string): Promise<LookupResponse> {
  return postJson<LookupResponse>("/api/lookup", { name });
}

export async function isNameAvailable(name: string): Promise<boolean> {
  const res = await postJson<{ available: boolean }>("/api/name-check", { name });
  return res.available;
}

export function rsvp(payload: RsvpPayload): Promise<{ guest: GuestSummary }> {
  return postJson<{ guest: GuestSummary }>("/api/rsvp", payload);
}

export function slidesComplete(): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/slides-complete", {});
}

export async function getMe(): Promise<GuestSummary | null> {
  const res = await fetch("/api/me", { credentials: "same-origin", headers: headers() });
  noteTestMode(res);
  if (!res.ok) return null;
  const data = (await res.json()) as { guest: GuestSummary | null };
  return data.guest;
}

export async function deleteMe(): Promise<void> {
  await fetch("/api/me", { method: "DELETE", credentials: "same-origin", headers: headers() });
}
