import { CONFIG } from "../config/party.config";
import { buildCssVariables } from "../config/css-vars";

// The HTML shell: inlined CSS variables (from the config) + critical base CSS +
// a nonce'd module bootstrap. Kept deliberately tiny; the client renders the
// screens. `nonce` ties the inline <style> to the response CSP.

// No web fonts are downloaded: the theme is set in the platform's monospace
// typeface (see the mono stack in party.config.ts). Dark is the default so the
// near-black canvas paints immediately, before the client script runs.
const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-body);
  font-weight: 400;
  color: var(--paper);
  background: var(--paper-dark);
  font-size: var(--type-base);
  line-height: 1.55;
  min-height: 100dvh;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
  margin: 0 0 0.5em;
}
a { color: var(--accent); }
#app { max-width: 760px; margin: 0 auto; padding: clamp(0.75rem, 4vw, 2rem); }
:root[data-theme="light"] body { color: var(--ink); background: var(--paper); }
`;

export function renderShell(nonce: string): string {
  const cssVars = buildCssVariables(CONFIG.theme);
  const title = CONFIG.event.title;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(title)}</title>
  <style nonce="${nonce}">
${cssVars}
${BASE_CSS}
  </style>
  <link rel="stylesheet" href="/app.css" />
</head>
<body>
  <main id="app" aria-live="polite">
    <noscript>This RSVP needs JavaScript enabled.</noscript>
  </main>
  <script type="module" src="/client.js" nonce="${nonce}"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
