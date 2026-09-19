import type { GuestSummary } from "./api";
import { config } from "./store";
import type { ScreenName } from "./router";

// Journey: landing (identity + RSVP) → confirmed (attending) or farewell (declined), from
// where the slideshow and details are one tap away.

// True once the guest has answered the RSVP either way — gates the details link.
export function hasRsvped(g: GuestSummary): boolean {
  return g.attending !== null;
}

// True for anyone who has not answered yet (unrecognised, or recognised without an
// RSVP). They can preview the details before deciding.
export function canPreviewDetails(g: GuestSummary | null): boolean {
  return !g || !hasRsvped(g);
}

// The final screen for a guest: details for those attending, the farewell for
// decliners, and back to the landing screen if they have not answered yet.
export function destinationForGuest(g: GuestSummary): ScreenName {
  if (g.attending === true) return "details";
  if (g.attending === false) return "farewell";
  return "landing";
}

// Where to go right after saving an RSVP, first answer or edit: the confirmation screen
// for guests who can come, the farewell for those who can't.
export function destinationAfterRsvp(g: GuestSummary): ScreenName {
  return g.attending === true ? "confirmed" : "farewell";
}

// Decliners only see the venue if the host opted in.
export function attendingCanSeeDetails(g: GuestSummary): boolean {
  if (g.attending === false) return config().form.decline.showDetails;
  return true;
}
