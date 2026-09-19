import type { EventConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Event details: who, where, when. Times are ISO 8601 with a UTC offset.
// ─────────────────────────────────────────────────────────────────────────────

const event: EventConfig = {
  hostName: "Ali",
  title: "Ali's big Five-O Party!",
  tagline: "Half a century to make one party.",
  venueName: "Kincumba Mountain Reserve",
  addressLines: ["Island View Dr", "Kincumber", "NSW 2251"],
  mapsUrl: "https://maps.app.goo.gl/fpjYhWbj6SnwvhAk6",
  startsAt: "2026-10-10T14:30:00+10:00",
  endsAt: "2026-10-10T23:30:00+10:00",
  timezone: "Australia/Sydney",
  calendarTitle: "Ali's 50th",
  notes: ["Kids friendly", "Food and drinks will be provided", "BYO whatever you ingest", "It's in the Kiosk building"],
  rsvpDeadline: "2026-11-01T23:59:59+11:00",
};

export default event;
