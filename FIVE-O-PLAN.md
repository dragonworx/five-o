# Five-O — 50th Birthday RSVP Application

**Solution design document**

A single-purpose, self-hosted RSVP web app. Guests receive one SMS link, open it on their phone,
are recognised (or introduce themselves), say whether they can make it, give their party details,
watch a short humorous slideshow, and land on the event details page. The host gets a
password-protected admin console with live headcounts.

---

## 1. Design goals & constraints

| Goal | Consequence for the design |
| --- | --- |
| One shared link over SMS | No per-guest tokens in the URL; identity must be *inferred*, not asserted |
| Mobile-first, desktop-capable | Two deliberate layouts, not one squashed layout |
| Robust returning-visitor detection | Multi-signal scoring with an explicit confidence model and an always-available "not you?" escape hatch |
| Everything tweakable in one place | A single typed config module that drives copy, colours, fonts, slides, event details and admin credentials |
| Small, cheap, self-hosted | Bun + `bun:sqlite`, no external services, single binary, single file database |
| Feels premium | View Transitions, spring physics, variable fonts, a restrained palette |

**Non-goals:** accounts, passwords for guests, email, payments, real-time updates, i18n.

---

## 2. Technology choices

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime / server | **Bun** `Bun.serve` with the object-literal `routes` API | Required. Native routing, no Express needed |
| Persistence | **`bun:sqlite`** in WAL mode | Required. Zero-dependency, single file, more than fast enough for ~150 guests |
| Validation | **Zod** | Shared schemas between client and server; parses untrusted form input |
| Fingerprinting | **ThumbmarkJS** (`@thumbmarkjs/thumbmarkjs`, MIT) | Open source, no licence key, no phone-home. FingerprintJS OSS is the fallback but its v4 open version is noisier |
| Animation | **Motion** (`motion`, ~5 kB) + native View Transitions API | Spring-based, hardware-accelerated, tiny |
| Frontend | **Vanilla TypeScript** + a ~100-line state machine, bundled with `Bun.build` | The whole app is four screens in one linear flow. A framework would be more code than the app |
| Styling | Hand-written CSS with custom properties generated from the config | Palette and type scale become themeable at runtime without a build step |
| TLS / proxy | **Caddy** | Automatic Let's Encrypt certificates for the custom domain, one-line config |
| Process supervision | **systemd** | Already on the VPS, restart-on-failure, journald logs |

No `any` types anywhere; all boundaries (HTTP body, SQLite row, `localStorage` value) are parsed
through Zod or an explicit cast to a declared row interface.

---

## 3. Single source of truth: the config module

Everything the host will realistically want to change lives in **`src/config/party.config.ts`**.
Nothing else in the codebase hard-codes a colour, a string, an image path or an address.

```ts
// src/config/party.config.ts
import type { PartyConfig } from "./config.types";

export const CONFIG: PartyConfig = {
  event: {
    hostName: "Ali",
    title: "Ali turns 50",
    tagline: "Half a century. One party.",
    venueName: "The Back Garden",
    addressLines: ["12 Example Street", "Suburb", "City 1234"],
    mapsUrl: "https://maps.google.com/?q=12+Example+Street",
    startsAt: "2026-11-14T18:00:00+11:00",
    endsAt:   "2026-11-15T01:00:00+11:00",
    timezone: "Australia/Sydney",
    calendarTitle: "Ali's 50th",
    notes: ["Parking on the street", "BYO whatever you drink"],
    rsvpDeadline: "2026-11-01T23:59:59+11:00",
  },

  theme: {
    // Palette influences — every CSS custom property is derived from these.
    palette: {
      ink:        "#14110F", // primary text
      paper:      "#FBF8F3", // page background (light)
      paperDark:  "#12100E",
      accent:     "#C8553D", // burnt terracotta — buttons, focus rings
      accentSoft: "#F2C14E", // warm gold — highlights, confetti
      support:    "#2E4057", // deep slate — headings on dark
      success:    "#3F7D5B",
      danger:     "#A63A2E",
      muted:      "#8A8078",
    },
    radius:   { sm: "8px", md: "16px", lg: "28px", pill: "999px" },
    fonts: {
      display: { family: "Fraunces",    stack: "Georgia, serif",     weightRange: "400 900" },
      body:    { family: "Inter",       stack: "system-ui, sans-serif", weightRange: "300 700" },
    },
    typeScale: { base: "17px", ratio: 1.25 },     // desktop bumps base to 18px
    motion:    { spring: { stiffness: 260, damping: 26 }, pageMs: 420, reduceMotionRespected: true },
    grain:     true,   // subtle film-grain overlay
    darkMode:  "auto", // "auto" | "light" | "dark"
  },

  copy: {
    landingNew:       "You’re invited.",
    landingReturning: "Welcome back, {name}.",
    identityPrompt:   "Is this still you?",
    formIntro:        "Tell me who’s coming.",
    attendingQuestion: "Can you make it?",
    attendingYes:     "Wouldn’t miss it",
    attendingNo:      "Sorry, can’t make it",
    declineThanks:    "Gutted you can’t make it. Have a drink on me anyway.",
    slidesIntro:      "Before the details — fifty years in {count} pictures.",
    detailsIntro:     "See you there.",
    musicianYes:      "Amazing. Bring your instrument.",
  },

  form: {
    maxAdults: 8,
    maxKids: 8,
    dietOptions: [
      { value: "omnivore",   label: "Omnivore",   emoji: "🍖" },
      { value: "vegetarian", label: "Vegetarian", emoji: "🥗" },
      { value: "vegan",      label: "Vegan",      emoji: "🌱" },
    ],
    askMusician: true,
    // What a decliner still gets asked / shown.
    decline: {
      askMessage: true,             // optional "leave a note" box
      showSlides: true,             // decliners still get the slideshow
      showDetails: false,           // …but not the address
    },
  },

  slides: {
    autoAdvanceMs: 5200,     // 0 disables autoplay
    allowSkip: true,
    showProgressBar: true,
    items: [
      { src: "/img/slides/01.jpg", caption: "1976. Already suspicious of cameras.", alt: "Baby photo" },
      { src: "/img/slides/02.jpg", caption: "The mullet years. We don’t talk about these.", alt: "Teenager" },
      // …add or remove freely; the UI adapts to the array length
    ],
  },

  detection: {
    cookieName: "fo_id",
    cookieMaxAgeDays: 400,          // browser cap
    storageKey: "fiveo.visitor.v1",
    autoRecogniseAt: 0.90,          // ≥ this → greet by name
    softMatchAt: 0.45,              // ≥ this → "are you X?"  below → treat as new
    fingerprintTtlDays: 120,
    ipCorroborationOnly: true,      // IP can never establish identity by itself
  },

  admin: {
    username: "ali",
    // Bun-hashed with argon2id. Generate: bun run scripts/hash-admin-password.ts
    passwordHash: "$argon2id$v=19$m=65536,t=2,p=1$…",
    realm: "Five-O Admin",
    dangerZone: {
      allowClearAll: true,          // set false once real RSVPs start arriving
      confirmPhrase: "DELETE EVERYTHING",
      backupBeforeClear: true,
    },
  },

  server: { port: 3000, publicOrigin: "https://fifty.example.com", trustProxy: true },
} as const;
```

Two derived artefacts keep the rest of the app config-free:

1. **`buildCssVariables(CONFIG.theme)`** emits a `:root { --ink: …; --accent: … }` block, injected
   into the HTML `<head>` on every response. Changing a hex value and restarting is the entire
   theming workflow.
2. **`GET /api/config`** returns a whitelisted public subset (`event`, `theme`, `copy`, `form`,
   `slides`) so the client never needs a rebuild to pick up copy changes. `admin`, `detection`
   thresholds and `server` are stripped by an explicit `toPublicConfig()` function — not by
   omission, so a newly added secret can't leak by accident.

Secrets that must not live in git — `ADMIN_PASSWORD_HASH`, `IP_PEPPER`, `COOKIE_SECRET` — are read
from environment variables, with the config file holding only the non-secret defaults.

---

## 4. Returning-visitor detection

This is the highest-risk part of the design, because both failure directions are bad:

- **False positive** (Sam is greeted as Priya) — happens when a weak signal like a shared home IP
  is trusted. Result: Sam edits Priya's RSVP.
- **False negative** (Priya is treated as new) — happens when she opens the link in a different
  browser, or the SMS app's in-app webview sandboxes storage separately from Safari. Result:
  duplicate rows and a wrong headcount.

The design treats these asymmetrically: **no signal that can be shared between two people is ever
allowed to establish identity on its own**, and the user always gets a visible, one-tap correction.

### 4.1 Signals collected

| Signal | How | Uniqueness | Weight | Notes |
| --- | --- | --- | --- | --- |
| **Signed cookie** | `fo_id`, HMAC-SHA256 signed, `HttpOnly`, `Secure`, `SameSite=Lax`, 400 days | Per browser profile | **0.92** | Strongest. Survives everything except a deliberate clear or private mode |
| **`localStorage` token** | Same UUID, written by JS under `fiveo.visitor.v1` | Per origin per profile | **0.88** | Survives some cookie-clearing paths; readable for cross-checking |
| **IndexedDB + Cache Storage mirror** | Same UUID written to two extra stores | Per profile | **+0.04 each** | Cheap redundancy; different browser "clear" actions hit different stores |
| **Device fingerprint** | ThumbmarkJS hash (canvas, fonts, audio, screen, hardware, locale) | ~Device+browser | **0.50** | Never sufficient alone — two identical iPhones on the same iOS version can collide |
| **IP `/24` + UA family** | Server-side, peppered hash | Household / carrier NAT | **0.12** | Corroboration only, hard-capped (§4.3) |
| **Self-identification** | "I've RSVP'd before" → type your name | Human assertion | **1.00** | The always-available fallback, and the fix for cross-device |

All signals resolve to the same `guest_id`; they are stored as rows in `identity_signal` so a single
guest accumulates evidence over visits and across storage clears.

### 4.2 Scoring algorithm

On page load the client gathers its local signals, then posts them:

```
POST /api/identify
{ storageToken?: string, idbToken?: string, cacheToken?: string, fingerprint: string, fpComponents: {...} }
```

The server adds the cookie and the IP/UA hash, then for each candidate guest computes a **noisy-OR**
combination — the right model here because the signals are independent-ish pieces of evidence and
naive addition would let three weak signals outvote one strong one:

```
score(guest) = 1 - Π (1 - wᵢ)   for every signal i that matches this guest
```

Worked examples:

- Cookie only → `1 − 0.08 = 0.92` → **auto-recognise**
- `localStorage` + fingerprint → `1 − (0.12 × 0.50) = 0.94` → **auto-recognise**
- Fingerprint only → `0.50` → **soft match**, ask "Are you Priya?"
- Fingerprint + IP → `1 − (0.50 × 0.88) = 0.56` → still only a **soft match** (IP alone can't push
  it over the line — see the cap below)
- IP only → `0.12` → **treated as new**

### 4.3 Guards against false positives

1. **IP is capped.** `ipCorroborationOnly: true` means the IP signal is discarded entirely unless at
   least one device-local signal already matched the same guest. Twelve friends behind one home
   Wi-Fi never collapse into one identity.
2. **Ambiguity check.** If two or more guests score above `softMatchAt` and are within `0.15` of each
   other, the result is downgraded to `ambiguous` and the client shows a *chooser* ("Which one are
   you?" + "None of these — I'm new"), never an auto-greet.
3. **Fingerprint collision detection.** If one fingerprint hash is already linked to ≥ 2 distinct
   guests, its weight for that hash drops to `0.15` permanently — an empirical signal that this
   device model produces a non-unique thumbmark.
4. **Fingerprint decay.** Fingerprints older than `fingerprintTtlDays` (browser updates change
   canvas output) lose half their weight, then expire.
5. **Never silently write.** Auto-recognition greets and pre-fills, but always renders a persistent
   `Not you?` control in the header of every screen until the guest confirms.

### 4.4 Guards against false negatives

1. **Write-through on every visit.** Any confirmed identification re-writes *all* storage slots, so
   a guest who lost a cookie but kept `localStorage` gets the cookie back.
2. **In-app-browser escape.** SMS links often open in a webview whose storage is isolated. The
   landing screen shows a low-key "Opened this before? Find my RSVP" link that leads to a name
   lookup — the single most reliable cross-device path.
3. **Name lookup with confirmation.** Typing a name does a normalised (lowercase, diacritic-folded,
   whitespace-collapsed) match plus a Levenshtein-≤2 fuzzy pass. Matches are confirmed by showing a
   redacted summary ("Priya · 2 adults · 1 kid · vegetarian — is that yours?") rather than by
   revealing the record outright, so a stranger guessing names learns very little.
4. **Merging.** When a name lookup succeeds on a device that already carries a different anonymous
   `guest_id`, the two are merged: signals are re-pointed at the surviving guest and the empty
   shell row is marked `merged_into`.

### 4.5 Override flow

`Not you?` → confirm dialog → server issues a **fresh** `guest_id`, rotates the cookie and all local
tokens, and records `overridden_from` on the new guest row. The original record is untouched. The
current device's signals are re-pointed to the new guest, and the *old* guest keeps its other
signals — so the real Priya, arriving later on her own phone, is still recognised.

### 4.6 Privacy posture

Raw IPs are never stored — only `HMAC-SHA256(ip_/24, IP_PEPPER)`. Fingerprint components are stored
as a hash plus a small coarse summary (platform, screen bucket) for debugging. A one-line privacy
note on the landing screen says the site remembers your device so you don't re-type your details.
`DELETE /api/me` wipes the guest and its signals.

---

## 5. Data model

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE guest (
  id              TEXT PRIMARY KEY,              -- uuidv7
  name            TEXT NOT NULL,
  name_normalised TEXT NOT NULL,
  attending       INTEGER,                       -- NULL = not answered yet, 1 = yes, 0 = no
  adults          INTEGER NOT NULL DEFAULT 0,
  kids            INTEGER NOT NULL DEFAULT 0,
  is_musician     INTEGER NOT NULL DEFAULT 0,
  diet            TEXT CHECK (diet IN ('omnivore','vegetarian','vegan')),
  message         TEXT,
  slides_seen_at  TEXT,
  merged_into     TEXT REFERENCES guest(id),     -- non-null ⇒ hidden from admin totals
  overridden_from TEXT REFERENCES guest(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  -- A decline can never carry a headcount. Enforced by the database, not just by the form,
  -- so a bad client or a hand-edit can't silently inflate the catering numbers.
  CHECK (attending = 1 OR (adults = 0 AND kids = 0)),
  -- An acceptance must bring at least one person.
  CHECK (attending IS NOT 1 OR adults >= 1)
);
CREATE INDEX idx_guest_name ON guest(name_normalised);
CREATE INDEX idx_guest_attending ON guest(attending) WHERE merged_into IS NULL;

CREATE TABLE identity_signal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id    TEXT NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('cookie','local','idb','cache','fingerprint','ipua')),
  value_hash  TEXT NOT NULL,
  weight      REAL NOT NULL,                     -- mutable: decay & collision penalties
  hits        INTEGER NOT NULL DEFAULT 1,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  UNIQUE (kind, value_hash, guest_id)
);
CREATE INDEX idx_signal_lookup ON identity_signal(kind, value_hash);

CREATE TABLE visit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id     TEXT REFERENCES guest(id) ON DELETE SET NULL,
  outcome      TEXT NOT NULL,                    -- new|auto|soft|ambiguous|override|lookup
  score        REAL,
  matched_kinds TEXT,                            -- json array, for tuning weights later
  ua           TEXT,
  ip_hash      TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE audit (                             -- append-only edit history
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  before_json TEXT, after_json TEXT,
  created_at TEXT NOT NULL
);
```

`visit` is the tuning instrument: after the first dozen guests the host can look at the distribution
of scores and outcomes and adjust weights with evidence rather than guesswork.

---

## 6. Application flow

```
                    ┌──────────────┐
  SMS link ───────► │  / (landing) │
                    └──────┬───────┘
              POST /api/identify (runs on load)
                           │
        ┌──────────────────┼───────────────────┬─────────────────┐
     score ≥ .90       .45–.90            ambiguous          < .45
        │                  │                   │                 │
  "Welcome back,     "Are you Priya?"     chooser list      "You're invited"
   Priya"  + Jump         yes/no                                  │
   to details link        │                   │                   │
        └────────┬────────┴───────────────────┴───────────────────┘
                 ▼
          ┌─────────────┐
          │  /rsvp      │  step 1 — your name
          │             │  step 2 — CAN YOU MAKE IT?   ┌── no ──┐
          │             │  step 3 — adults · kids      │        │
          │             │  step 4 — musician? · diet   │        │
          └──────┬──────┘                              │        │
             yes │                                     ▼        │
                 │                            ┌──────────────┐  │
                 │                            │ decline note │  │
                 │                            │  (optional)  │  │
                 │                            └───────┬──────┘  │
                 ▼ POST /api/rsvp                     ▼          │
          ┌─────────────┐   swipe / tap / auto-advance / skip    │
          │  /slides    │ ◄──────────────────────────────────────┘
          └──────┬──────┘   (decliners see the slides too — config-gated)
                 ▼ POST /api/slides-complete
        attending?  ── no ──►  ┌──────────────────────────────┐
                 │             │ /farewell — thanks + "changed│
                 │ yes         │ your mind?" back to the form │
                 ▼             └──────────────────────────────┘
          ┌─────────────┐   address · map · from–to · add to calendar
          │  /details   │ ◄──── deep link from landing for returning guests
          └──────┬──────┘
                 └──► "Edit my details"  ·  "Watch the slides again"
```

**The attendance question comes before the headcount**, which keeps the decline path to two taps
and means a decliner is never asked how many people they're bringing. Steps 3 and 4 mount and
unmount with a height-animated collapse, so answering "no" visibly removes them rather than
jumping the layout.

Changing the answer is always possible: a returning guest who declined lands on `/farewell` with a
prominent "Actually, I can make it" control that reopens the form with the headcount steps restored.
The landing screen's shortcut for returning guests points at whichever endpoint matches their
answer — `/details` for an acceptance, `/farewell` for a decline — so nobody is dropped onto a page
that contradicts what they told you.
Flipping to "no" zeroes `adults` and `kids` server-side rather than preserving them, so the totals
can never count a decliner's party — the database `CHECK` constraints in §5 back this up.

Client-side routing via the History API keeps it a single page load; each screen is a
`pushState` entry so the phone's back gesture behaves correctly. Screen transitions use
`document.startViewTransition()` where supported, falling back to a Motion spring cross-fade.

Progress is persisted server-side (`slides_seen_at`) so a guest who closes the tab mid-slideshow
resumes where the flow left them rather than restarting.

---

## 7. HTTP API

| Method & path | Purpose | Auth |
| --- | --- | --- |
| `GET /` | HTML shell with inlined CSS variables and critical CSS | — |
| `GET /api/config` | Public config subset | — |
| `POST /api/identify` | Submit local signals, receive identification verdict | — |
| `POST /api/claim` | Confirm a soft/ambiguous match (`{ guestId }`) | — |
| `POST /api/override` | "Not me" → mint a new guest identity | — |
| `POST /api/lookup` | Name-based recovery (rate-limited, returns redacted summary) | — |
| `GET  /api/me` | Current guest record | cookie |
| `POST /api/rsvp` | Create or update RSVP (Zod-validated) | cookie |
| `POST /api/slides-complete` | Mark slideshow seen | cookie |
| `DELETE /api/me` | Erase my record | cookie |
| `GET  /admin` | Admin console UI | Basic |
| `GET  /admin/api/guests` | Both lists (attending / not attending / no answer) + totals | Basic |
| `GET  /admin/export.csv` | CSV download (`?list=attending\|declined\|all`) | Basic |
| `GET  /admin/api/visits` | Detection telemetry, for tuning | Basic |
| `POST /admin/api/guests/:id` | Host-side correction of a record | Basic |
| `POST /admin/api/clear-all` | **Destructive.** Wipe all guest data — see §9.3 | Basic |

Every response sets `Cache-Control: no-store` on API routes; static assets get immutable
content-hashed filenames.

---

## 8. Design system & front-end craft

**Layout.** Mobile (< 768 px) is a single full-height column with a fixed bottom action bar sized for
thumbs — 56 px minimum touch target, safe-area insets respected (`env(safe-area-inset-bottom)`).
Desktop (≥ 768 px) becomes a split canvas: a fixed left panel holding the event identity and a
scrolling right panel holding the active step, capped at 560 px measure. These are two distinct
layouts sharing components, not one responsive squeeze — the slideshow in particular goes
edge-to-edge portrait on mobile and letterboxed 16:9 with side captions on desktop.

**Type.** Two self-hosted variable fonts (WOFF2, `font-display: swap`, preloaded): a high-contrast
display serif for headings and a neutral grotesque for UI. Fluid sizing with `clamp()` driven by the
config's `typeScale`.

**Colour.** Every CSS custom property derives from the nine palette seeds — tints and shades are
computed in `oklch()` so they stay perceptually even, and dark mode is a token remap rather than a
second stylesheet. Contrast is asserted at build time: a small script fails the build if any
text/background pair drops below WCAG AA 4.5:1.

**The attendance choice.** Two large stacked cards rather than a checkbox or a segmented control —
this is the single most important answer in the app and deserves the visual weight. Choosing "yes"
expands the headcount and diet steps beneath it with a height spring; choosing "no" collapses them
and slides in the optional note field. Neither choice is preselected, so an accidental submit can't
record an answer the guest didn't give.

**Motion.** Springs, not linear easings. Page-level cross-fades via View Transitions; form fields
lift on focus; the musician toggle triggers a confetti-of-quavers burst; the slideshow uses a
Ken Burns drift with a caption that rises 12 px on entry. Every animation is wrapped in a
`prefers-reduced-motion` guard driven by `theme.motion.reduceMotionRespected`.

**Slideshow interaction.** Swipe left/right (pointer events with velocity threshold), tap right
third to advance / left third to go back, hold to pause autoplay, an always-visible skip control,
and a segmented progress bar. All images are `srcset`-generated at build time into AVIF + WebP at
three widths; the next two slides preload so advancing never shows a blank frame.

**Accessibility.** Semantic landmarks, visible focus rings in `--accent`, form errors announced via
`aria-live`, slideshow exposed as an `aria-roledescription="carousel"` with real alt text from the
config, and full keyboard operability of the whole flow.

---

## 9. Admin

`GET /admin` behind HTTP Basic auth. The credentials come from `CONFIG.admin`; the password is
stored as an argon2id hash (via `Bun.password`) and compared with `Bun.password.verify`, which is
constant-time. Failed attempts are rate-limited to 5 per IP per 15 minutes with an exponential
backoff, and every attempt is logged.

Basic auth is acceptable here specifically because the whole site is HTTPS-only (HSTS on), the
scope is one host, and the data is a party guest list — not because it's good practice generally.

### 9.1 Headcount summary

A summary strip pinned to the top of the console, and the first thing you see:

```
┌──────────────────────────────────────────────────────────────────────┐
│  COMING          NOT COMING        NO ANSWER YET      RESPONSES       │
│  38 adults        9 households      4 households      51 / 55         │
│  11 kids                                                              │
│  ─────────                                                            │
│  49 heads                                                             │
│                                                                       │
│  Omnivore 27  ·  Vegetarian 8  ·  Vegan 3   │   🎸 Musicians 6        │
└──────────────────────────────────────────────────────────────────────┘
```

Total adults, total kids and total heads are computed **only over `attending = 1` rows with
`merged_into IS NULL`** — declines and superseded duplicates can never inflate catering numbers.
The diet and musician breakdowns follow the same filter. A single SQL aggregate backs the whole
strip, so the numbers are always mutually consistent:

```sql
SELECT
  COUNT(*)                                   AS households,
  COALESCE(SUM(adults), 0)                   AS total_adults,
  COALESCE(SUM(kids),   0)                   AS total_kids,
  COALESCE(SUM(adults + kids), 0)            AS total_heads,
  COALESCE(SUM(is_musician), 0)              AS musicians,
  COALESCE(SUM(diet = 'omnivore'),   0)      AS omnivore,
  COALESCE(SUM(diet = 'vegetarian'), 0)      AS vegetarian,
  COALESCE(SUM(diet = 'vegan'),      0)      AS vegan
FROM guest
WHERE attending = 1 AND merged_into IS NULL;
```

### 9.2 Two separate lists

Below the summary, guests are split into **three tabs** rather than one table with a status column —
you almost always want to read one group at a time, and mixing them makes the catering list
error-prone:

| Tab | Filter | Columns |
| --- | --- | --- |
| **Coming** (default) | `attending = 1` | Name · Adults · Kids · Heads · Musician · Diet · Message · Updated · Detected-as |
| **Not coming** | `attending = 0` | Name · Message · Updated · Detected-as |
| **No answer yet** | `attending IS NULL` | Name · Started · Where they dropped off |

Each tab carries its own row count in the tab label and its own `Export CSV` button, so "give me the
caterer's list" is one click and never includes a decline. Sorting and a text filter are
client-side over the already-loaded JSON. A "show superseded" toggle reveals merged and overridden
rows, hidden by default. The third tab is genuinely useful — it's your chase list for the people
who opened the link but never finished.

### 9.3 Clear all data

A collapsed **Danger zone** at the bottom of the console, gated by `admin.dangerZone.allowClearAll`.
It exists for testing the flow end-to-end before invites go out; the config flag is meant to be
flipped to `false` the day you send the SMS, which removes the button and makes the endpoint return
`403` regardless of what the client sends.

Deleting everything is protected by four independent gates, because a mis-click here is
unrecoverable in a way nothing else in this app is:

1. **Type the phrase.** The button stays disabled until the operator types
   `admin.dangerZone.confirmPhrase` exactly. Not a yes/no dialog — a yes/no dialog is one reflexive
   tap away from disaster.
2. **Echo the count.** The dialog states precisely what will be destroyed, read live from the
   database: *"This deletes 51 guests, 128 identity signals, 340 visits and the full audit log."*
3. **Automatic backup first.** With `backupBeforeClear: true` the server runs `VACUUM INTO
   backups/pre-clear-<timestamp>.sqlite` and **only proceeds if that file exists and is non-zero**.
   The response returns the backup path so you can see where the escape hatch is.
4. **Server-side re-verification.** `POST /admin/api/clear-all` re-checks Basic auth, the config
   flag, and the confirmation phrase in the request body. The client cannot skip any gate.

The wipe itself is a single transaction — `DELETE FROM audit; DELETE FROM visit; DELETE FROM
identity_signal; DELETE FROM guest;` in foreign-key order, then `VACUUM` — so it either fully
succeeds or leaves the database untouched. The clear is itself recorded to a separate append-only
`admin_action` log file on disk (not in the wiped database), with timestamp, IP hash and the
row counts destroyed.

One caveat worth knowing: clearing the server does **not** clear the tokens already stored in
guests' browsers. A device that RSVP'd before a wipe will present a `guest_id` that no longer
exists. The identify endpoint handles this by treating an unknown-but-well-formed token as a new
visitor and silently reissuing — which is the correct behaviour, but it means post-wipe testing on
the same phone won't exercise the returning-visitor path unless you also clear site data. The
danger-zone dialog says so.

---

## 10. Project structure

```
five-o/
├── PLAN.md
├── package.json
├── src/
│   ├── config/
│   │   ├── party.config.ts        ← the one file to edit
│   │   ├── config.types.ts
│   │   ├── public-config.ts       ← toPublicConfig(): strips secrets
│   │   └── css-vars.ts            ← palette → CSS custom properties
│   ├── server/
│   │   ├── index.ts               ← Bun.serve routes
│   │   ├── db.ts                  ← connection, pragmas, migrations
│   │   ├── migrations/001_init.sql
│   │   ├── identity/
│   │   │   ├── score.ts           ← noisy-OR + guards (pure, unit-tested)
│   │   │   ├── signals.ts         ← read/write identity_signal
│   │   │   └── cookie.ts          ← HMAC sign/verify
│   │   ├── routes/{identify,rsvp,slides}.ts
│   │   ├── admin/{auth,queries,export-csv,clear-all}.ts
│   │   ├── schemas.ts             ← Zod, shared with client
│   │   └── ratelimit.ts
│   ├── client/
│   │   ├── main.ts, router.ts, state.ts
│   │   ├── storage.ts             ← cookie/localStorage/IDB/Cache mirror
│   │   ├── fingerprint.ts         ← ThumbmarkJS wrapper with timeout
│   │   └── screens/{landing,rsvp,slides,details,farewell}.ts
│   ├── styles/{tokens,base,mobile,desktop,slides}.css
│   └── admin/index.html
├── public/img/slides/             ← drop images here, list them in config
├── scripts/{hash-admin-password,optimise-images,backup}.ts
└── tests/                         ← bun:test
```

`bun build` produces one server entry plus a hashed client bundle. `bun test` covers the two places
where a bug corrupts data rather than merely looking wrong: the scoring module, with a fixture suite
of realistic signal combinations including the twelve-friends-on-one-Wi-Fi and two-identical-iPhones
cases; and the headcount aggregates, asserting that a yes→no flip zeroes the counts, that declined
and merged rows are excluded from every total, and that the `CHECK` constraints reject a decline
carrying a headcount.

---

## 11. Deployment

1. **Build locally**, ship `dist/` + `public/` to the VPS over rsync (or build on the box).
2. **systemd unit** `five-o.service` running `bun run dist/server.js` as a non-root user, with
   `EnvironmentFile=/etc/five-o.env` holding `IP_PEPPER`, `COOKIE_SECRET`, `ADMIN_PASSWORD_HASH`,
   `Restart=always`, and hardening (`ProtectSystem=strict`, `ReadWritePaths=/var/lib/five-o`).
3. **Caddy** in front:
   ```
   fifty.example.com {
     encode zstd gzip
     reverse_proxy localhost:3000
     header { Strict-Transport-Security "max-age=31536000; includeSubDomains" }
   }
   ```
   Caddy handles the certificate for the custom domain automatically; DNS is a single A record.
4. **Backups.** `scripts/backup.ts` runs `VACUUM INTO` hourly via a systemd timer, keeping 48 rolling
   copies off-volume. The database is one file and the whole guest list fits in a few hundred KB —
   there is no excuse for losing it.
5. **Observability.** Structured JSON logs to journald; a `GET /healthz` returning DB row counts.

**Security headers on every HTML response:** a strict CSP (`default-src 'self'`, no inline script
except a nonce'd bootstrap), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
`Permissions-Policy` denying camera/mic/geolocation.

---

## 12. Build order

| Phase | Deliverable |
| --- | --- |
| 1 | Config module + types + CSS variable generation + HTML shell |
| 2 | SQLite schema, migrations, `db.ts` |
| 3 | Identity scoring module with its test suite — *build and test this before any UI* |
| 4 | `/api/identify`, `/claim`, `/override`, `/lookup` + client storage mirror |
| 5 | RSVP form incl. the attending yes/no branch, validation, persistence |
| 6 | Slideshow with gestures and image pipeline |
| 7 | Details page + farewell page, calendar link, cross-links |
| 8 | Admin auth, summary strip, three tabs, CSV export, danger zone |
| 9 | Design polish: motion, dark mode, reduced-motion, contrast assertions |
| 10 | Deploy: Caddy, systemd, backups, then a real end-to-end test from a phone over SMS |

Phase 3 first is deliberate: the detection logic is the only part where a bug corrupts data rather
than just looking wrong, and it's fully testable without a browser.

---

## 13. Open decisions for the host

- **Per-guest links.** If you're happy to send individually-generated links (`/i/ab12cd`) instead of
  one shared link, detection becomes trivially correct and everything in §4 becomes a fallback
  rather than the primary mechanism. It costs you a mail-merge in your SMS app. Worth considering.
- **RSVP deadline behaviour** — after the deadline, lock edits or just show a warning?
- **Plus-ones by name** — the current model counts adults and kids as numbers. If you want a name
  list for place cards, that's a repeating field rather than a counter.
- **Do decliners see the address?** `form.decline.showDetails` is currently `false` — they get the
  slideshow and a farewell rather than the venue. Flip it if you'd rather everyone can see where it
  is in case plans change.
- **Guest-list denominator.** The "51 / 55" response figure in §9.1 needs a known invite count. Either
  drop it, or add an `invitedCount` number to the config for a rough version.
