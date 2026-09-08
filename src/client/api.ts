import type { PublicConfig } from "../config/public-config";

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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
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

export function rsvp(payload: RsvpPayload): Promise<{ guest: GuestSummary }> {
  return postJson<{ guest: GuestSummary }>("/api/rsvp", payload);
}

export function slidesComplete(): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/slides-complete", {});
}

export async function getMe(): Promise<GuestSummary | null> {
  const res = await fetch("/api/me", { credentials: "same-origin" });
  if (!res.ok) return null;
  const data = (await res.json()) as { guest: GuestSummary | null };
  return data.guest;
}

export async function deleteMe(): Promise<void> {
  await fetch("/api/me", { method: "DELETE", credentials: "same-origin" });
}
