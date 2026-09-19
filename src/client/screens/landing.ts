import { claim, lookup, type GuestSummary } from "../api";
import { actionBar, card, ghostButton, primaryButton, screen } from "../components";
import { el, interpolate, mount } from "../dom";
import { destinationAfterRsvp, destinationForGuest, hasRsvped } from "../flow";
import { springIn } from "../motion";
import { navigate } from "../router";
import { buildRsvpForm } from "../rsvp-form";
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
  "";

async function claimIdentity(guestId: string, claimToken: string): Promise<void> {
  const res = await claim(guestId, claimToken, signals());
  if (res.outcome === "auto") {
    setGuest(res.guest);
    setSoftMatch(null);
    setAmbiguous(null);
    render(currentRoot());
  }
}

function detailsLinkLabel(g: GuestSummary): string {
  return g.attending === false ? "See your message" : "See event details";
}

// The landing screen is identity first, then the RSVP: who you are (greeting, or
// a way back to an earlier RSVP), followed by the form and its submit bar.
function identityView(g: GuestSummary | null): { content: HTMLElement[]; footer: HTMLElement } {
  const form = buildRsvpForm({
    onSaved: (saved, first) => navigate(destinationAfterRsvp(saved, first)),
  });

  const lead = g ? interpolate(copy().landingReturning, { name: g.name }) : copy().landingNew;
  const hero = el("div", { class: "hero" }, [
    el("h1", {}, [copy().landingTitle]),
    el("p", { class: "lead" }, [lead]),
    el("p", { class: "muted" }, [config().event.tagline]),
  ]);

  const content: HTMLElement[] = [hero];
  // A guest we don't recognise can look themselves up before filling anything in.
  if (!g) content.push(lookupPanel());
  content.push(el("div", { class: "rsvp-form" }, form.fields));
  // Once an RSVP exists, the venue / farewell page is a link away.
  if (g && hasRsvped(g)) {
    content.push(
      el("div", { class: "stack" }, [ghostButton(detailsLinkLabel(g), () => navigate(destinationForGuest(g)))]),
    );
  }
  content.push(privacyNote());

  return { content, footer: actionBar([form.submit], "compact") };
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
    mount(results, el("p", { class: "muted" }, ["No match found. Just RSVP below."]));
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

  // Unresolved matches take over the screen: identity is settled before the form.
  let scr: HTMLElement;
  if (!g && amb) scr = screen([ambiguousView(amb)]);
  else if (!g && sm) scr = screen([softView(sm)]);
  else {
    const { content, footer } = identityView(g);
    scr = screen(content, footer);
  }

  mount(root, scr);
  const main = root.querySelector(".screen");
  if (main) springIn(main);
}
