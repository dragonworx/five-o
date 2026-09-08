import type { PartyConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// The one file to edit. Every colour, string, image path and address lives here.
// Secrets (ADMIN_PASSWORD_HASH, IP_PEPPER, COOKIE_SECRET) come from the
// environment — the values below are non-secret defaults only.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG: PartyConfig = {
  event: {
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
  },

  theme: {
    // "Terminal noir" — a dark, near-black canvas with a single hot-pink accent
    // and an electric-lime highlight, set entirely in a monospace typeface.
    palette: {
      ink: "#07080B", // dark text — used on bright accent/lime surfaces
      paper: "#E7EBF2", // primary text on the dark canvas (soft off-white)
      paperDark: "#0A0B0F", // page background — near-black
      accent: "#FF4D8D", // hot pink — buttons, links, focus rings
      accentSoft: "#C8FF5B", // electric lime — selected/toggle highlights, confetti
      support: "#8B5CF6", // violet — subtle background glow
      success: "#34D399",
      danger: "#FB6D77",
      muted: "#8A93A6", // cool grey — muted/secondary text
    },
    radius: { sm: "6px", md: "10px", lg: "14px", pill: "999px" },
    fonts: {
      // Monospace everywhere. A coding font if the guest has one, otherwise the
      // platform's system monospace — no web font is downloaded.
      display: {
        family: "JetBrains Mono",
        stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        weightRange: "400 700",
      },
      body: {
        family: "JetBrains Mono",
        stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        weightRange: "400 700",
      },
    },
    typeScale: { base: "14px", ratio: 1.2 },
    motion: { spring: { stiffness: 300, damping: 24 }, pageMs: 320, reduceMotionRespected: true },
    grain: true,
    darkMode: "dark",
  },

  copy: {
    landingTitle: "Ali’s Big Five O",
    landingNew: "You’re invited.",
    landingReturning: "Welcome back, {name}.",
    identityPrompt: "Is this still you?",
    formIntro: "Tell me who’s coming.",
    attendingQuestion: "Can you make it?",
    attendingYes: "Wouldn’t miss it! 🥳",
    attendingNo: "Sorry, can’t make it 🥲",
    declineThanks: "Gutted you can’t make it. Have a drink on me anyway.",
    slidesCta: "Remember the good old days!",
    skipToRsvp: "Skip to RSVP",
    slidesIntro: "Before you RSVP — fifty years in {count} pictures.",
    detailsIntro: "See you there, {name}!",
    musicianYes: "Amazing. Bring your instrument.",
  },

  form: {
    maxAdults: 8,
    maxKids: 8,
    dietOptions: [
      { value: "omnivore", label: "Omnivore", emoji: "🍖" },
      { value: "vegetarian", label: "Vegetarian", emoji: "🥗" },
      { value: "vegan", label: "Vegan", emoji: "🌱" },
    ],
    askMusician: true,
    decline: {
      askMessage: true, // optional "leave a note" box
      showSlides: true, // decliners still get the slideshow
      showDetails: false, // …but not the address
    },
  },

  slides: {
    autoAdvanceMs: 5200, // 0 disables autoplay
    allowSkip: true,
    showProgressBar: true,
    // ── Edit captions and reorder freely. Order here is the display order. ──
    // Roughly chronological "fifty years in pictures". Drop in / remove items
    // and the UI adapts to the array length automatically.
    items: [
      {
        src: "/img/slides/sperm.jpeg",
        caption: "1976. It all started here - first place out of several million.",
        alt: "1976. It all started here - first place out of several million",
      },
      {
        src: "/img/slides/young-genius-award.jpeg",
        caption: "1988. Accepted the Young Genius of the Year award. Peaked early.",
        alt: "1988. Accepted the Young Genius of the Year award. Peaked early.",
      },
      {
        src: "/img/slides/chess-boxing.jpeg",
        caption: "1998. Undefeated chess-boxing champion. Checkmate, then a left hook.",
        alt: "1998. Undefeated chess-boxing champion. Checkmate, then a left hook.",
      },
      {
        src: "/img/slides/illuminati.jpeg",
        caption: "2003. Inducted into the Illuminati. We’ve already said too much.",
        alt: "2003. Inducted into the Illuminati. We’ve already said too much.",
      },
      {
        src: "/img/slides/jumped-grand-canyon.jpeg",
        caption: "2007. Cleared the Grand Canyon on a scooter. No big deal.",
        alt: "2007. Cleared the Grand Canyon on a scooter. No biggy.",
      },
      {
        src: "/img/slides/knights.jpeg",
        caption: "2011. Cut down the mightiest tree in the forest... with... a herring!",
        alt: "2011. Cut down the mightiest tree in the forest... with... a herring!",
      },
      {
        src: "/img/slides/space-walk.jpeg",
        caption: "2015. Made crucial repairs to the International Space Station.",
        alt: "2015. Made crucial repairs to the International Space Station.",
      },
      {
        src: "/img/slides/starship-troopers.jpeg",
        caption: "2019. Enlisted to fight the bugs. Would you like to know more?",
        alt: "2019. Enlisted to fight the bugs. Would you like to know more?",
      },
    ],
  },

  detection: {
    cookieName: "fo_id",
    cookieMaxAgeDays: 400, // browser cap
    storageKey: "fiveo.visitor.v1",
    autoRecogniseAt: 0.9, // ≥ this → greet by name
    softMatchAt: 0.45, // ≥ this → "are you X?"  below → treat as new
    fingerprintTtlDays: 120,
    ipCorroborationOnly: true, // IP can never establish identity by itself
  },

  admin: {
    username: "ali",
    // argon2id — generate with: bun run scripts/hash-admin-password.ts
    // Overridden at runtime by the ADMIN_PASSWORD_HASH env var when set.
    passwordHash: "$argon2id$v=19$m=65536,t=2,p=1$REPLACE_ME$REPLACE_ME",
    realm: "Five-O Admin",
    dangerZone: {
      allowClearAll: true, // set false once real RSVPs start arriving
      confirmPhrase: "DELETE EVERYTHING",
      backupBeforeClear: true,
    },
  },

  server: { port: 3000, publicOrigin: "https://fifty.example.com", trustProxy: true },
} as const;
