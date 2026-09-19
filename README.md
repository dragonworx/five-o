# Five-O

50th birthday RSVP app. Bun + `bun:sqlite`, no framework. Private project.

The server bundles the client and admin JS itself at boot, so there is no separate build step.

## Dev vs production

|  | Dev (local) | Production (Docker) |
| --- | --- | --- |
| Run | `bun run dev` | `bun run docker:refresh` |
| Prereqs | Bun | Docker, Bun + npm (to install deps on the host) |
| `.env` | not needed | **required** |
| `IP_PEPPER`, `COOKIE_SECRET` | insecure built-in defaults (warns) | **required**, server refuses to start without them |
| `ADMIN_PASSWORD_HASH` | optional; without it admin login won't work (config has a placeholder hash) | **required** to use `/admin` |
| DB / backups | `./data/five-o.sqlite`, `./backups` | `./data` on host, mounted at `/data` |
| Reload | `--watch` restarts on any change | rebuild image (or `docker:watch`, below) |
| URL | http://localhost:3000 | http://127.0.0.1:3000, front with Caddy |

Health check: `/healthz`. Admin: `/admin`.

## Dev

```sh
bun install
bun run dev
```

To test admin locally, pass a hash in the shell (single quotes, it contains `$`):

```sh
ADMIN_PASSWORD_HASH='<hash>' bun run dev
```

Get a hash with `bun run hash-admin-password`.

### Test mode

Open the app with `?test=1` (e.g. `http://localhost:3000/?test=1`) and the whole flow works, but nothing is written to the SQLite file. The client tags its API calls and the server runs them against an in-memory database that lives until the server restarts, so you can RSVP, reload and be recognised, then start clean. A small "Test mode · not saved" label confirms it is active. It works in any environment (no flag), so keep `?test=1` out of real invitation links. The admin console always shows the real database.

## Production (Docker)

The image copies in a host-installed `node_modules` rather than installing inside the container (see the `Dockerfile` header for why).

```sh
# 1. deps, on the host (re-run when package.json changes)
npm install --omit=dev --no-audit --no-fund

# 2. secrets
cp .env.example .env    # then edit, see below

# 3. build + start
bun run docker:refresh  # = docker compose build && up -d
```

### `.env`

Loaded by compose at runtime (gitignored, never baked into the image).

| Var | Notes |
| --- | --- |
| `IP_PEPPER`, `COOKIE_SECRET` | `openssl rand -hex 32` each |
| `ADMIN_PASSWORD_HASH` | from `bun run hash-admin-password`. **Escape every `$` as `$$`** or compose mangles it. |
| `DB_PATH`, `BACKUPS_DIR` | **Delete these two lines from the copied `.env.example`.** Its `/var/lib/five-o/...` paths are for systemd and would override the image's `/data/...` defaults, putting the DB outside the volume. |
| `NODE_ENV` | already `production` in the image; leave it |

If `.env` is missing the container starts, then crashes on the missing secrets (`docker logs five-o`). After editing `.env`, run `docker compose up -d` to recreate the container; `restart` won't pick it up.

### Changing content

`bun run docker:refresh` is all you need after editing content. Do **not** run `build:client`: the server bundles the client and admin at boot, and `build:client` only writes to the gitignored `public/dist/`, which nothing serves.

The image copies in `src/`, `public/` and `scripts/` at build time, so these all need a refresh:

| What | Where |
| --- | --- |
| Event details, copy, form, theme | `src/config/*.ts` (one file per section; `party.config.ts` only assembles them) |
| Slide captions and order | `src/config/slides.ts` |
| Slide images | `public/img/slides/` |
| CSS | `src/styles/*.css` |

None of it is env-driven. The RSVP database is in the `/data` volume, so a refresh leaves it untouched.

`server.trustProxy` is `true`, so the client IP comes from proxy headers. Keep the port bound to loopback (as compose does) and put Caddy in front (`deploy/Caddyfile`, replace `fifty.example.com`).

### Docker dev loop

`bun run docker:watch` bind-mounts `src/` and `public/` and runs `bun --hot`, so you can skip the image rebuild while editing content. It reloads server modules only: the client bundle and the CSS are built once at boot, so restart the container (`docker compose restart five-o`) after changing those. It still uses `.env`, so production rules apply.

Other scripts: `docker:up`, `docker:down`, `docker:build`.

## Data and backups

SQLite lives in `./data/five-o.sqlite` (gitignored). Migrations run on boot.

Manual backup (`VACUUM INTO`, keeps newest 48):

```sh
docker exec five-o bun run scripts/backup.ts
```

Only the systemd deploy has hourly automation (`deploy/five-o-backup.{service,timer}`). For Docker, cron the command above.

## Without Docker in production

`deploy/five-o.service` (systemd, env from `/etc/five-o.env`, i.e. `.env.example` as-is) plus `deploy/Caddyfile`.

## Checks

```sh
bun test
bun run typecheck
bun run check:contrast
```
