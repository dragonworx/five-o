import type { EventConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Event details: who, where, when. Times are ISO 8601 with a UTC offset.
// ─────────────────────────────────────────────────────────────────────────────

const event: EventConfig = {
  hostName: "Ali",
  title: "LOAD \"ALI_50\",8,1 : RUN",
  tagline: "Probably my last 50th...",
  venueName: "Kincumba Mountain Reserve",
  addressLines: ["Island View Dr", "Kincumber", "NSW 2251"],
  mapsUrl: "https://maps.app.goo.gl/fpjYhWbj6SnwvhAk6",
  // Sydney is on daylight time (AEDT, +11:00) from 4 Oct 2026; the deadline
  // below is before the switch, so it stays on AEST (+10:00).
  startsAt: "2026-10-10T13:30:00+11:00",
  endsAt: "2026-10-10T23:30:00+11:00",
  timezone: "Australia/Sydney",
  calendarTitle: "Ali's 50th",
  notes: ["Kids Welcome", "There will be jamming", "Catered dinner", "It's BYO", "Under cover", "Parking at top of mountain"],
  rsvpDeadline: "2026-10-01T23:59:59+10:00",
};

export default event;
