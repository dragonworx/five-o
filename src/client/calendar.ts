import type { EventConfig } from "../config/config.types";

// Calendar links. Times in the config are ISO strings with an explicit offset, so
// converting to UTC for the calendar payloads is unambiguous.

function toUtcBasic(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function formatEventWhen(event: EventConfig): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const dayFmt = new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: event.timezone,
  });
  const timeFmt = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone,
  });
  return `${dayFmt.format(start)} ▫️ ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

export function toGoogleCalendarUrl(event: EventConfig): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.calendarTitle,
    details: event.notes.join(" ▫️ "),
    location: [event.venueName, ...event.addressLines].join(", "),
  });
  // Google Calendar needs a literal "/" between the start and end; URLSearchParams
  // would encode it as %2F, which breaks the date-range parsing. The date values
  // themselves are all safe characters, so append them raw.
  const dates = `${toUtcBasic(event.startsAt)}/${toUtcBasic(event.endsAt)}`;
  return `https://calendar.google.com/calendar/render?${params.toString()}&dates=${dates}`;
}

function escapeIcs(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

export function toIcsDataUrl(event: EventConfig): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Five-O//RSVP//EN",
    "BEGIN:VEVENT",
    `UID:${toUtcBasic(event.startsAt)}-fiveo@local`,
    `DTSTAMP:${toUtcBasic(new Date().toISOString())}`,
    `DTSTART:${toUtcBasic(event.startsAt)}`,
    `DTEND:${toUtcBasic(event.endsAt)}`,
    `SUMMARY:${escapeIcs(event.calendarTitle)}`,
    `LOCATION:${escapeIcs([event.venueName, ...event.addressLines].join(", "))}`,
    `DESCRIPTION:${escapeIcs(event.notes.join(" ▫️ "))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}
