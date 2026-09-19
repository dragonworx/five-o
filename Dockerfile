# syntax=docker/dockerfile:1.7

# Five-O runs TypeScript directly under Bun (no compile step), so this is a
# single-stage image. We deliberately COPY in a pre-installed node_modules
# and pre-built client bundle rather than running an installer/bundler in
# the build container, because:
#
#   * Bun's installer has known issues honouring HTTP(S)_PROXY in some setups
#     on this host (see the portal project's Dockerfile for the same note).
#   * npm inside a build container can't reach a proxy bound to the host's
#     localhost without extra Docker networking gymnastics.
#
# Running install/build on the host once keeps the image build deterministic,
# fast, and proxy-friendly.
#
# Build recipe:
#   npm install --omit=dev --no-audit --no-fund   # one-time, on the host
#   bun run build:client                          # one-time, on the host
#   docker build -t five-o .

FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json ./
COPY node_modules ./node_modules
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# Container-friendly defaults. Override via `-e` / compose `environment:`.
ENV NODE_ENV=production \
    DB_PATH=/data/five-o.sqlite \
    BACKUPS_DIR=/data/backups

RUN mkdir -p /data && chown -R bun:bun /app /data

USER bun
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:3000/healthz" >/dev/null || exit 1

CMD ["bun", "run", "src/server/index.ts"]
