import type { PublicConfig } from "../config/public-config";
import type { DeviceSignals, GuestSummary } from "./api";

// Shared client state. The flow is linear and tiny, so a single mutable store
// with explicit setters is clearer than a reducer.

export interface SoftMatchState {
  guestId: string;
  name: string;
  claimToken: string;
}

export interface AmbiguousState {
  candidates: { guestId: string; name: string }[];
  claimToken: string;
}

interface Store {
  config: PublicConfig;
  guest: GuestSummary | null;
  signals: DeviceSignals;
  overriddenFrom: string | null;
  softMatch: SoftMatchState | null;
  ambiguous: AmbiguousState | null;
  formIntent: boolean | null;
}

let store: Store | null = null;

export function initStore(initial: Store): void {
  store = initial;
}

function get(): Store {
  if (!store) throw new Error("Store not initialised");
  return store;
}

export const config = (): PublicConfig => get().config;
export const copy = (): PublicConfig["copy"] => get().config.copy;
export const guest = (): GuestSummary | null => get().guest;
export const signals = (): DeviceSignals => get().signals;
export const softMatch = (): SoftMatchState | null => get().softMatch;
export const ambiguous = (): AmbiguousState | null => get().ambiguous;
export const overriddenFrom = (): string | null => get().overriddenFrom;
export const formIntent = (): boolean | null => get().formIntent;

export function setGuest(next: GuestSummary | null): void {
  get().guest = next;
}
export function setSignals(next: DeviceSignals): void {
  get().signals = next;
}
export function setSoftMatch(next: SoftMatchState | null): void {
  get().softMatch = next;
}
export function setAmbiguous(next: AmbiguousState | null): void {
  get().ambiguous = next;
}
export function setOverriddenFrom(next: string | null): void {
  get().overriddenFrom = next;
}
export function setFormIntent(next: boolean | null): void {
  get().formIntent = next;
}
