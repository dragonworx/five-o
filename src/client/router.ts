import { transitionTo } from "./motion";

// Minimal History-API router. Each screen is a render function; navigating pushes
// a history entry so the phone back-gesture steps back through the flow.

export type ScreenName = "landing" | "slides" | "details" | "farewell";

type Renderer = (root: HTMLElement) => void;

const screens = new Map<ScreenName, Renderer>();
let root: HTMLElement | null = null;

export function registerScreen(name: ScreenName, render: Renderer): void {
  screens.set(name, render);
}

function renderScreen(name: ScreenName): void {
  const render = screens.get(name);
  if (!render || !root) return;
  transitionTo(() => render(root as HTMLElement));
}

export function navigate(name: ScreenName, opts: { replace?: boolean } = {}): void {
  const url = `#/${name}`;
  if (opts.replace) history.replaceState({ screen: name }, "", url);
  else history.pushState({ screen: name }, "", url);
  renderScreen(name);
}

function currentScreenFromHash(): ScreenName {
  const hash = window.location.hash.replace(/^#\//, "");
  if (screens.has(hash as ScreenName)) return hash as ScreenName;
  return "landing";
}

export function startRouter(mountPoint: HTMLElement, initial: ScreenName): void {
  root = mountPoint;
  window.addEventListener("popstate", (ev) => {
    const state = ev.state as { screen?: ScreenName } | null;
    const name = state?.screen ?? currentScreenFromHash();
    renderScreen(name);
  });
  history.replaceState({ screen: initial }, "", `#/${initial}`);
  renderScreen(initial);
}
