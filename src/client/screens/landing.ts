import { claim, lookup, type GuestSummary } from "../api";
import { actionBar, card, ghostButton, notYouLink, primaryButton, screen } from "../components";
import { el, interpolate, mount, on } from "../dom";
import { canPreviewDetails, destinationAfterRsvp, destinationForGuest } from "../flow";
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

// The landing screen is identity first, then the RSVP: who you are (greeting, or
// a way back to an earlier RSVP), followed by the form and its submit bar.
function identityView(g: GuestSummary | null): { content: HTMLElement[]; footer: HTMLElement } {
  // A guest we don't recognise can look themselves up, right under the yarp / narp buttons.
  const form = buildRsvpForm({
    onSaved: (saved, first) => navigate(destinationAfterRsvp(saved, first)),
    belowChoice: g ? undefined : lookupPanel(),
  });

  const lead = g ? interpolate(copy().landingReturning, { name: g.name }) : copy().landingNew;
  const hero = el("div", { class: "hero" }, [
    el("h1", {}, [copy().landingTitle]),
    el("p", { class: "lead" }, [lead]),
    ...(g ? [el("p", { class: "not-you-row" }, [notYouLink()])] : []),
    el("p", { class: "muted" }, [config().event.tagline]),
  ]);

  const content: HTMLElement[] = [hero];
  // Anyone who hasn't answered yet can look at the venue before deciding.
  if (canPreviewDetails(g)) content.push(previewDetailsLink());
  content.push(el("div", { class: "rsvp-form" }, form.fields));
  // Once they've accepted, the venue page is a link away. Decliners get no extra link.
  if (g?.attending === true) {
    content.push(
      el("div", { class: "stack" }, [ghostButton("See event details", () => navigate(destinationForGuest(g)))]),
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
    placeholder: "Your full name",
    attrs: { "aria-label": "Your full name", autocomplete: "name" },
  });
  const results = el("div", { class: "lookup-results", attrs: { "aria-live": "polite" } });
  const details = el("details", { class: "lookup" }, [
    el("summary", {}, ["I RSVP'd before and want to make a change"]),
    el("div", { class: "lookup-body" }, [
      input,
      primaryButton("Find me", () => void runLookup(input.value, results)),
      results,
    ]),
  ]);
  return details;
}

function previewDetailsLink(): HTMLElement {
  const link = el("button", { class: "lookup-link", type: "button" }, ["Event Details"]);
  on(link, "click", () => navigate("details"));
  return el("div", { class: "lookup-link-row" }, [link]);
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
