import type { PartyConfig } from "./config.types";
import admin from "./admin";
import copy from "./copy";
import detection from "./detection";
import event from "./event";
import form from "./form";
import server from "./server";
import slides from "./slides";
import theme from "./theme";

// ─────────────────────────────────────────────────────────────────────────────
// The single assembled config. Every colour, string, image path and address
// lives in one of the section files imported above — edit those, not this file:
//
//   event.ts      venue, address, dates, notes
//   theme.ts      palette, fonts, radii, motion
//   copy.ts       screen text
//   form.ts       RSVP form rules
//   slides.ts     slideshow images and captions
//   detection.ts  returning-guest recognition (server-only)
//   admin.ts      admin console (server-only)
//   server.ts     port and proxy settings (server-only)
//
// Secrets (ADMIN_PASSWORD_HASH, IP_PEPPER, COOKIE_SECRET) come from the
// environment — the values in those files are non-secret defaults only.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG: PartyConfig = {
  event,
  theme,
  copy,
  form,
  slides,
  detection,
  admin,
  server,
} as const;
