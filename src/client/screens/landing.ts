import { claim, lookup, type GuestSummary } from "../api";
import { card, ghostButton, primaryButton, screen } from "../components";
import { el, interpolate, mount } from "../dom";
import { destinationForGuest, hasRsvped } from "../flow";
import { springIn } from "../motion";
import { navigate } from "../router";
import {
  ambiguous,
  config,
  copy,
  guest,
  setAmbiguous,
  setGuest,
  setSoftMatch,
  signals,
  softMatch,
  type AmbiguousState,
  type SoftMatchState,
} from "../store";

const PRIVACY_NOTE =
  "This site remembers your device so you don’t have to re-type your details. Nothing is shared.";

async function claimIdentity(guestId: string, claimToken: string): Promise<void> {
  const res = await claim(guestId, claimToken, signals());
  if (res.outcome === "auto") {
    setGuest(res.guest);
    setSoftMatch(null);
    setAmbiguous(null);
    render(currentRoot());
  }
}

function recognisedView(g: GuestSummary): HTMLElement {
  const greeting = interpolate(copy().landingReturning, { name: g.name });
  const actions: HTMLElement[] = [primaryButton(copy().slidesCta, () => navigate("slides"))];
  // The details link only appears once an RSVP has been given, now or previously.
  if (hasRsvped(g)) {
    actions.push(ghostButton(detailsLinkLabel(g), () => navigate(destinationForGuest(g))));
  }
  actions.push(ghostButton(hasRsvped(g) ? "Edit my RSVP" : "RSVP now", () => navigate("rsvp")));
  return card([
    el("h1", {}, [copy().landingTitle]),
    el("p", { class: "lead" }, [greeting]),
    el("p", { class: "muted" }, [config().event.tagline]),
    el("div", { class: "stack" }, actions),
    privacyNote(),
  ]);
}

function detailsLinkLabel(g: GuestSummary): string {
  return g.attending === false ? "See your message" : "See event details";
}

function softView(sm: SoftMatchState): HTMLElement {
  return card([
    el("h1", {}, [copy().identityPrompt]),
    el("p", { class: "lead" }, [`Are you ${sm.name}?`]),
    el("div", { class: "stack" }, [
      primaryButton(`Yes, I’m ${sm.name}`, () => void claimIdentity(sm.guestId, sm.claimToken)),
      ghostButton("No, I’m someone else", () => {
        setSoftMatch(null);
        render(currentRoot());
      }),
    ]),
    privacyNote(),
  ]);
}

function ambiguousView(amb: AmbiguousState): HTMLElement {
  const options = amb.candidates.map((c) =>
    ghostButton(c.name, () => void claimIdentity(c.guestId, amb.claimToken)),
  );
  return card([
    el("h1", {}, ["Which one are you?"]),
    el("p", { class: "muted" }, ["We found a few possible matches on this device."]),
    el("div", { class: "stack" }, [
      ...options,
      primaryButton("None of these — I’m new", () => {
        setAmbiguous(null);
        render(currentRoot());
      }),
    ]),
    privacyNote(),
  ]);
}

function newView(): HTMLElement {
  return card([
    el("h1", {}, [copy().landingTitle]),
    el("p", { class: "lead" }, [copy().landingNew]),
    el("p", { class: "muted" }, [config().event.tagline]),
    el("div", { class: "stack" }, [primaryButton(copy().slidesCta, () => navigate("slides"))]),
    lookupPanel(),
    privacyNote(),
  ]);
}

// Cross-device recovery: the single most reliable path when the SMS webview
// sandboxes storage away from the guest's normal browser.
function lookupPanel(): HTMLElement {
  const input = el("input", {
    class: "input",
    type: "text",
    placeholder: "Your name",
    attrs: { "aria-label": "Your name", autocomplete: "name" },
  });
  const results = el("div", { class: "lookup-results", attrs: { "aria-live": "polite" } });
  const details = el("details", { class: "lookup" }, [
    el("summary", {}, ["Opened this before? Find my RSVP"]),
    el("div", { class: "lookup-body" }, [
      input,
      primaryButton("Find me", () => void runLookup(input.value, results)),
      results,
    ]),
  ]);
  return details;
}

async function runLookup(name: string, results: HTMLElement): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const res = await lookup(trimmed);
  if (res.outcome === "new" || res.matches.length === 0 || !res.claimToken) {
    mount(results, el("p", { class: "muted" }, ["No match found. You can RSVP as new above."]));
    return;
  }
  const token = res.claimToken;
  const buttons = res.matches.map((m) =>
    ghostButton(m.label, () => void claimIdentity(m.guestId, token)),
  );
  mount(results, el("div", { class: "stack" }, [
    el("p", { class: "muted" }, ["Is one of these you?"]),
    ...buttons,
  ]));
}

function privacyNote(): HTMLElement {
  return el("p", { class: "privacy-note" }, [PRIVACY_NOTE]);
}

let rootRef: HTMLElement | null = null;
function currentRoot(): HTMLElement {
  if (!rootRef) throw new Error("landing not mounted");
  return rootRef;
}

export function render(root: HTMLElement): void {
  rootRef = root;
  const g = guest();
  const amb = ambiguous();
  const sm = softMatch();
  let view: HTMLElement;
  if (g) view = recognisedView(g);
  else if (amb) view = ambiguousView(amb);
  else if (sm) view = softView(sm);
  else view = newView();

  mount(root, screen([view]));
  const scr = root.querySelector(".screen");
  if (scr) springIn(scr);
}
