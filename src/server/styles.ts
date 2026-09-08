import { readFileSync } from "node:fs";
import { join } from "node:path";

// Concatenate the stylesheets in cascade order and serve them as one /app.css.
// Read once at boot (bun --watch re-reads on any imported-module change).

const STYLES_DIR = join(import.meta.dir, "..", "styles");
const ORDER = ["tokens.css", "base.css", "mobile.css", "desktop.css", "slides.css"];

export const APP_CSS: string = ORDER.map((file) =>
  readFileSync(join(STYLES_DIR, file), "utf8"),
).join("\n");
