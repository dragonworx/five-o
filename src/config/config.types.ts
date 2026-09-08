// Types for the single source of truth (src/config/party.config.ts).
// Nothing else in the codebase should hard-code copy, colours, images or addresses.

export type DietValue = "omnivore" | "vegetarian" | "vegan";
export type DarkMode = "auto" | "light" | "dark";

export interface EventConfig {
  hostName: string;
  title: string;
  tagline: string;
  venueName: string;
  addressLines: readonly string[];
  mapsUrl: string;
  /** ISO 8601 with offset, e.g. "2026-11-14T18:00:00+11:00" */
  startsAt: string;
  endsAt: string;
  /** IANA timezone, e.g. "Australia/Sydney" */
  timezone: string;
  calendarTitle: string;
  notes: readonly string[];
  rsvpDeadline: string;
}

export interface Palette {
  ink: string;
  paper: string;
  paperDark: string;
  accent: string;
  accentSoft: string;
  support: string;
  success: string;
  danger: string;
  muted: string;
}

export interface RadiusScale {
  sm: string;
  md: string;
  lg: string;
  pill: string;
}

export interface FontSpec {
  family: string;
  stack: string;
  /** Variable-font weight range, e.g. "400 900" */
  weightRange: string;
}

export interface Fonts {
  display: FontSpec;
  body: FontSpec;
}

export interface TypeScale {
  base: string;
  ratio: number;
}

export interface MotionConfig {
  spring: { stiffness: number; damping: number };
  pageMs: number;
  reduceMotionRespected: boolean;
}

export interface ThemeConfig {
  palette: Palette;
  radius: RadiusScale;
  fonts: Fonts;
  typeScale: TypeScale;
  motion: MotionConfig;
  grain: boolean;
  darkMode: DarkMode;
}

export interface CopyConfig {
  /** The big title shown on the landing screen. */
  landingTitle: string;
  landingNew: string;
  /** May contain the "{name}" placeholder. */
  landingReturning: string;
  identityPrompt: string;
  formIntro: string;
  attendingQuestion: string;
  attendingYes: string;
  attendingNo: string;
  declineThanks: string;
  /** CTA that launches the slideshow from the landing screen. */
  slidesCta: string;
  /** Label for the skip control at the top of the slideshow. */
  skipToRsvp: string;
  /** May contain the "{count}" placeholder. */
  slidesIntro: string;
  /** May contain the "{name}" placeholder. */
  detailsIntro: string;
  musicianYes: string;
}

export interface DietOption {
  value: DietValue;
  label: string;
  emoji: string;
}

export interface DeclineConfig {
  askMessage: boolean;
  showSlides: boolean;
  showDetails: boolean;
}

export interface FormConfig {
  maxAdults: number;
  maxKids: number;
  dietOptions: readonly DietOption[];
  askMusician: boolean;
  decline: DeclineConfig;
}

export interface SlideItem {
  /** Public path served from /public, e.g. "/img/slides/space-walk.jpeg" */
  src: string;
  /** Editable caption shown under the slide. */
  caption: string;
  /** Alt text for screen readers. */
  alt: string;
}

export interface SlidesConfig {
  /** 0 disables autoplay. */
  autoAdvanceMs: number;
  allowSkip: boolean;
  showProgressBar: boolean;
  /** Ordered list — reorder freely; the UI adapts to the array length. */
  items: readonly SlideItem[];
}

export interface DetectionConfig {
  cookieName: string;
  cookieMaxAgeDays: number;
  storageKey: string;
  autoRecogniseAt: number;
  softMatchAt: number;
  fingerprintTtlDays: number;
  ipCorroborationOnly: boolean;
}

export interface DangerZoneConfig {
  allowClearAll: boolean;
  confirmPhrase: string;
  backupBeforeClear: boolean;
}

export interface AdminConfig {
  username: string;
  /** argon2id hash; overridable via the ADMIN_PASSWORD_HASH env var. */
  passwordHash: string;
  realm: string;
  dangerZone: DangerZoneConfig;
}

export interface ServerConfig {
  port: number;
  publicOrigin: string;
  trustProxy: boolean;
}

export interface PartyConfig {
  event: EventConfig;
  theme: ThemeConfig;
  copy: CopyConfig;
  form: FormConfig;
  slides: SlidesConfig;
  detection: DetectionConfig;
  admin: AdminConfig;
  server: ServerConfig;
}
