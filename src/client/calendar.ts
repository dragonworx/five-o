import type { EventConfig } from "../config/config.types";

// Times in the config are ISO strings with an explicit offset; format them in the
// event's own timezone so every guest sees the venue's local date and time.

export interface EventWhen {
  day: string;
  time: string;
}

export function formatEventWhen(event: EventConfig): EventWhen {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const dayFmt = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: event.timezone,
  });
  const timeFmt = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone,
  });
  return {
    day: dayFmt.format(start),
    time: `${timeFmt.format(start)} – ${timeFmt.format(end)}`,
  };
}
