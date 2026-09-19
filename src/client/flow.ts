import type { GuestSummary } from "./api";
import { config } from "./store";
import type { ScreenName } from "./router";

// Journey: landing (identity + RSVP) → slides → details. A guest who has already
// answered is sent straight to their final screen instead of repeating the slides.

// True once the guest has answered the RSVP either way — gates the details link.
export function hasRsvped(g: GuestSummary): boolean {
  return g.attending !== null;
}

// The final screen for a guest: details for those attending, the farewell for
// decliners, and back to the landing screen if they have not answered yet.
export function destinationForGuest(g: GuestSummary): ScreenName {
  if (g.attending === true) return "details";
  if (g.attending === false) return "farewell";
  return "landing";
}

// Where to go right after saving an RSVP. A first answer goes through the slides
// (decliners only if the host opted in); an edit skips straight to the end.
export function destinationAfterRsvp(g: GuestSummary, first: boolean): ScreenName {
  const skipsSlides = g.attending === false && !config().form.decline.showSlides;
  if (first && !skipsSlides) return "slides";
  return destinationForGuest(g);
}

// Decliners only see the venue if the host opted in.
export function attendingCanSeeDetails(g: GuestSummary): boolean {
  if (g.attending === false) return config().form.decline.showDetails;
  return true;
}
