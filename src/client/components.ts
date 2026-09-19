import { override } from "./api";
import { el, on } from "./dom";
import { navigate } from "./router";
import { rotateVisitorToken } from "./storage";
import { config, setGuest, setOverriddenFrom, setSignals, setSoftMatch, signals } from "./store";

// Shared building blocks used across screens.

async function handleNotYou(): Promise<void> {
  const ok = window.confirm("Start fresh as a different guest? Your previous RSVP stays saved.");
  if (!ok) return;
  const res = await override(signals());
  setOverriddenFrom(res.previousGuestId);
  const tokens = await rotateVisitorToken();
  setSignals({ ...tokens, fingerprint: signals().fingerprint });
  setGuest(null);
  setSoftMatch(null);
  navigate("landing", { replace: true });
}

export function notYouLink(): HTMLButtonElement {
  const notYou = el("button", { class: "link not-you", type: "button" }, ["Not you?"]);
  on(notYou, "click", () => void handleNotYou());
  return notYou;
}

export function header(): HTMLElement {
  const brand = el("div", { class: "brand" }, [config().event.title]);
  return el("header", { class: "app-header" }, [brand]);
}

export function card(children: (Node | string)[], className = ""): HTMLElement {
  return el("section", { class: `card ${className}`.trim() }, children);
}

export function primaryButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", { class: "btn btn-primary", type: "button" }, [label]);
  on(btn, "click", onClick);
  return btn;
}

export function ghostButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", { class: "btn btn-ghost", type: "button" }, [label]);
  on(btn, "click", onClick);
  return btn;
}

// Fixed bottom action bar (mobile) / inline (desktop), safe-area aware.
export function actionBar(children: (Node | string)[], className = ""): HTMLElement {
  return el("div", { class: `action-bar ${className}`.trim() }, children);
}

// Compose a screen: persistent header + a scrolling content column.
export function screen(content: (Node | string)[], footer?: HTMLElement): HTMLElement {
  const main = el("main", { class: "screen", attrs: { role: "main" } }, content);
  const children: (Node | string)[] = [header(), main];
  if (footer) children.push(footer);
  return el("div", { class: "app-shell" }, children);
}
