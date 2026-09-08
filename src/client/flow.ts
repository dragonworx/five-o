import type { GuestSummary } from "./api";
import { config } from "./store";
import type { ScreenName } from "./router";

// Where a guest with a known answer should be sent from the landing shortcut.
export function destinationForGuest(g: GuestSummary): ScreenName {
  if (g.attending === true) return "details";
  if (g.attending === false) return "farewell";
  return "rsvp";
}

// True once the guest has answered the RSVP either way — gates the details link.
export function hasRsvped(g: GuestSummary): boolean {
  return g.attending !== null;
}

// Decliners only see the venue if the host opted in.
export function attendingCanSeeDetails(g: GuestSummary): boolean {
  if (g.attending === false) return config().form.decline.showDetails;
  return true;
}
