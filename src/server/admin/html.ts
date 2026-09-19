import { CONFIG } from "../../config/party.config";
import { liveReloadTag } from "../live-reload";

// The admin console shell: containers the bundled admin client fills in. Inline
// styles are nonce'd to satisfy the admin CSP; the script is external (/admin/app.js).

const ADMIN_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1.5rem; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.4rem; }
  .summary { display: flex; flex-wrap: wrap; gap: 1rem; padding: 1rem; border: 1px solid #8884; border-radius: 12px; margin-bottom: 1.25rem; }
  .stat { display: flex; flex-direction: column; }
  .stat-value { font-size: 1.15rem; font-weight: 700; }
  .stat-label { font-size: 0.8rem; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
  .tab { padding: 0.5rem 1rem; border: 1px solid #8884; background: transparent; border-radius: 999px; cursor: pointer; font: inherit; }
  .tab.active { background: #c8553d; color: white; border-color: #c8553d; }
  .toolbar { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .filter { padding: 0.5rem 0.75rem; border: 1px solid #8884; border-radius: 8px; font: inherit; }
  .btn-csv { padding: 0.5rem 1rem; border: 1px solid #8884; border-radius: 8px; text-decoration: none; color: inherit; }
  table.guests { width: 100%; border-collapse: collapse; }
  table.guests th, table.guests td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #8883; vertical-align: top; }
  table.guests tr.superseded { opacity: 0.5; }
  details.danger { margin-top: 2rem; border: 1px solid #a63a2e; border-radius: 12px; padding: 1rem; }
  details.danger summary { color: #a63a2e; font-weight: 700; cursor: pointer; }
  .btn-danger { padding: 0.5rem 1rem; background: #a63a2e; color: white; border: none; border-radius: 8px; cursor: pointer; }
`;

export function renderAdminShell(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${CONFIG.admin.realm}</title>
  <style nonce="${nonce}">${ADMIN_CSS}</style>
</head>
<body>
  <h1>${CONFIG.admin.realm} — ${CONFIG.event.title}</h1>
  <div id="summary"></div>
  <nav class="tabs" id="tabs"></nav>
  <div id="toolbar"></div>
  <div id="list"></div>
  <div id="danger"></div>
  <script type="module" src="/admin/app.js" nonce="${nonce}"></script>
  ${liveReloadTag()}
</body>
</html>`;
}
