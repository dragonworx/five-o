import type { ServerConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// HTTP server. Server-only; never sent to the client.
// ─────────────────────────────────────────────────────────────────────────────

const server: ServerConfig = {
  port: 3000,
  publicOrigin: "https://fifty.example.com",
  trustProxy: true, // client IP comes from proxy headers — keep the port on loopback
};

export default server;
