# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Five-O is a 50th-birthday RSVP app: Bun + `bun:sqlite`, no framework, no client build step. Deploy/env details live in `README.md`.

## Commands

```sh
bun install
bun run dev                  # bun --watch src/server/index.ts → http://localhost:3000
bun test                     # all tests
bun test tests/score.test.ts # one file
bun test -t "decline"        # tests matching a name
bun run typecheck            # tsc --noEmit (covers src, scripts, tests)
bun run check:contrast       # WCAG AA check of the palette in party.config.ts; exits 1 on failure
bun run slides               # ImageMagick: normalise public/img/slides to 896×1195 q78 (--check = report only)
bun run hash-admin-password  # argon2id hash for ADMIN_PASSWORD_HASH
bun run docker:refresh       # production: docker compose build && up -d
bun run docker:watch         # docker dev loop (bind-mounts src/ and public/, still needs .env)
```

- Dev needs no `.env`: missing `IP_PEPPER` / `COOKIE_SECRET` fall back to insecure defaults with a warning. With `NODE_ENV=production` (the Docker image) `src/server/env.ts` throws instead.
- To test `/admin` locally: `ADMIN_PASSWORD_HASH='<hash>' bun run dev` (single quotes; the hash contains `$`). In a compose `.env`, every `$` must be escaped as `$$`.
- `bun --watch` does not reload on CSS edits (`src/server/styles.ts` reads the `.css` files once at boot). Restart the dev server after changing `src/styles/*`.
- `bun run build:client` writes to the gitignored `public/dist/`, which nothing serves in normal operation. The server bundles the client and admin at boot (`Bun.build` in `src/server/index.ts` and `src/server/admin/index.ts`), so it is not needed. The Dockerfile header comment saying otherwise is stale.
- `tsconfig` is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type`).

## Architecture

**Single config as source of truth.** `src/config/party.config.ts` assembles `CONFIG` from one file per section (`event`, `theme`, `copy`, `form`, `slides`, `detection`, `admin`, `server`, all typed by `config.types.ts`). Edit the section files, not the assembler. Nothing else should hard-code copy, colours, images or addresses. The config is read at boot on the server, so edits need a restart (and an image rebuild in Docker).
- `public-config.ts` builds the client-visible subset (`/api/config`) by explicit whitelist. `admin`, `detection` and `server` must never be added to it.
- `css-vars.ts` turns the theme into `:root` CSS custom properties inlined into the HTML shell (`server/html.ts`), which is served with a per-request CSP nonce.

**Server** (`src/server/index.ts`): one `Bun.serve`. It serves the shell at `/`, the in-memory client bundle at `/client.js`, the concatenated CSS at `/app.css`, `/api/config`, `/healthz`, then falls back to `/admin*` → `admin/`, `/api/*` → `routes/api.ts` (a method+path table), else static files from `public/`. The SQLite connection (`db.ts`) opens and runs the forward-only `migrations/*.sql` at import time, so importing `db.ts` has side effects.

**Client** (`src/client`): vanilla TS SPA with a small hash router (`#/landing|slides|details|farewell`). `main.ts` boots by fetching config, collecting device signals, calling `/api/identify`, and storing the outcome in `store.ts`. The journey is landing (identity + RSVP form, `rsvp-form.ts`) → slides → details. Screen order and gating live in `flow.ts` (a first RSVP goes through the slides, an edit skips them, only guests who have answered get the details link, and decliners only see the venue if `form.decline.showDetails` is set). `src/admin` is a separate bundle for the admin console.

**Guest identity (the non-obvious part).** There are no logins. Returning guests are recognised by combining several signals, so a guest can RSVP once and be greeted by name later, even after clearing one store.
- The client mirrors one visitor UUID across localStorage, IndexedDB and Cache Storage (`client/storage.ts`), adds a ThumbmarkJS fingerprint, and the server also uses a signed cookie and a hashed IP /24 + UA family (`server/identity/signals.ts`, `hash.ts`). Raw IPs and tokens are stored only as peppered hashes.
- `identity/score.ts` is a **pure** module with no I/O, and it is unit-tested. Signals are combined by noisy-OR, not addition. Only device-local signals can establish identity; the shared `ipua` signal is corroboration-only (`ipCorroborationOnly`). Outcomes are `new | auto | soft | ambiguous` against `detection.autoRecogniseAt` (0.9) and `softMatchAt` (0.45), and contenders within `AMBIGUITY_DELTA` are downgraded to ambiguous. Base weights and decay/collision penalties are in `identity/weights.ts`; the weights are stored per row in `identity_signal` so they can mutate.
- `soft` and `ambiguous` outcomes return a short-lived HMAC `claimToken` (`identity/claim.ts`) listing the guest ids the device may claim. `/api/claim` only accepts ids from that token. `/api/lookup` (fuzzy name match via `text.ts`) and `/api/override` ("that's not me") follow the same pattern. Duplicates are merged with `guests.markMerged`, and `resolveGuest` follows `merged_into`.
- On every successful recognition the server writes the signals back onto the guest (`writeThrough`) so the mirrors self-heal.

**Data integrity is enforced in the database.** `001_init.sql` has CHECK constraints: a decline has zero headcount, and an acceptance has ≥ 1 adult. `routes/rsvp.ts` also validates against the `form.*` limits in config. Admin totals exclude rows where `merged_into` is set. The RSVP is an upsert keyed on the cookie's guest, so a returning guest updates instead of duplicating.

**Admin** (`src/server/admin`): HTTP Basic auth (argon2id hash from `ENV.adminPasswordHash`, per-IP failure backoff), read-only queries, CSV export, a manual "correction" tool, and a guarded clear-all (`admin.dangerZone`).

**Tests** (`tests/`): `score.test.ts` covers the pure scoring model. `db.test.ts` sets `DB_PATH` to a temp file *before* dynamically importing `db.ts`, and new DB tests should follow that pattern.

## Data and scripts

SQLite is at `./data/five-o.sqlite` in dev and `/data` in Docker (gitignored). `scripts/backup.ts` does `VACUUM INTO` and keeps the newest 48. In Docker, run `docker exec five-o bun run scripts/backup.ts`, since only the systemd deploy has hourly automation. `scripts/optimise-images.ts` is optional and needs `sharp`.
