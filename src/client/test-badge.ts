import { el } from "./dom";

// Small floating "TEST MODE" label. Shown only once the server confirms it is
// using the throwaway database (api.ts), never merely because ?test=1 is in the
// URL, so it can be trusted as proof that nothing is being saved.

export function showTestBadge(): void {
  if (document.querySelector(".test-badge")) return;
  document.body.append(
    el("div", { class: "test-badge", attrs: { "aria-hidden": "true" } }, ["Test mode ▫️ not saved"]),
  );
}
