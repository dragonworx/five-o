import { watch } from "node:fs";

// Dev-only live reload (`bun run dev:watch`). Off unless LIVE_RELOAD=1, and never
// in production. Three parts:
//   - a watcher on the source folders `bun --watch` can't see (client, admin,
//     styles are not in the server's import graph),
//   - a Server-Sent Events channel that tells open tabs what changed,
//   - a tiny script, served to the page, that reloads or swaps the stylesheet.
// Server-side edits still restart the process (`bun --watch`); the page notices
// the dropped connection and reloads once the new process is back.

export const LIVE_RELOAD = process.env.NODE_ENV !== "production" && process.env.LIVE_RELOAD === "1";

const EVENTS_PATH = "/__dev/events";
const SCRIPT_PATH = "/__dev/live.js";
const DEBOUNCE_MS = 50;
const HEARTBEAT_MS = 15_000;

export type LiveEvent = { type: "reload" } | { type: "css"; version: string };

export interface WatchTarget {
  dirs: string[];
  rebuild: () => Promise<LiveEvent> | LiveEvent;
}

// The script tag for the HTML shells; empty outside live-reload mode.
export function liveReloadTag(): string {
  return LIVE_RELOAD ? `<script src="${SCRIPT_PATH}"></script>` : "";
}

const CLIENT_SCRIPT = `(() => {
  let wasDown = false;
  const source = new EventSource("${EVENTS_PATH}");
  source.onerror = () => { wasDown = true; };
  source.onopen = () => { if (wasDown) location.reload(); };
  source.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type !== "css") return location.reload();
    for (const old of document.querySelectorAll('link[rel="stylesheet"][href^="/app.css"]')) {
      const next = old.cloneNode();
      next.href = "/app.css?v=" + msg.version;
      next.onload = () => old.remove();
      old.after(next);
    }
  };
})();
`;

const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function send(chunk: string): void {
  const bytes = encoder.encode(chunk);
  for (const client of clients) {
    try {
      client.enqueue(bytes);
    } catch {
      clients.delete(client); // the tab went away without a clean close
    }
  }
}

function broadcast(event: LiveEvent): void {
  send(`data: ${JSON.stringify(event)}\n\n`);
}

interface TimeoutCapable {
  timeout(req: Request, seconds: number): void;
}

function eventsResponse(req: Request, server: TimeoutCapable): Response {
  server.timeout(req, 0); // the stream is meant to sit idle
  let client: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = controller;
      clients.add(controller);
      // A short retry makes the tab rejoin quickly while the server restarts.
      controller.enqueue(encoder.encode("retry: 300\n\n: connected\n\n"));
    },
    cancel() {
      if (client) clients.delete(client);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
  });
}

// Handles the two dev endpoints; null for anything else (or outside live reload).
export function handleLiveReload(req: Request, pathname: string, server: TimeoutCapable): Response | null {
  if (!LIVE_RELOAD) return null;
  if (pathname === EVENTS_PATH) return eventsResponse(req, server);
  if (pathname === SCRIPT_PATH) {
    return new Response(CLIENT_SCRIPT, {
      headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return null;
}

// Rebuild and notify tabs whenever anything under a target's folders changes.
export function watchSources(targets: WatchTarget[]): void {
  if (!LIVE_RELOAD) return;
  for (const { dirs, rebuild } of targets) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => broadcast(await rebuild()), DEBOUNCE_MS);
    };
    for (const dir of dirs) watch(dir, { recursive: true }, onChange);
  }
  setInterval(() => send(": ping\n\n"), HEARTBEAT_MS).unref();
  console.log("Live reload on: client, admin and stylesheet edits refresh open tabs.");
}
