import { NAME_TAKEN } from "../shared/error-codes";
import { ApiError, isNameAvailable, rsvp, type Diet, type GuestSummary } from "./api";
import { MESSAGE_MAX_LENGTH } from "../shared/limits";
import { primaryButton } from "./components";
import { el, on } from "./dom";
import { hasRsvped } from "./flow";
import { collapse, confettiBurst } from "./motion";
import { config, copy, formIntent, guest, overriddenFrom, setFormIntent, setGuest, setOverriddenFrom, signals } from "./store";

interface FormState {
  name: string;
  attending: boolean | null;
  adults: number;
  kids: number;
  isMusician: boolean;
  diet: Diet | null;
  message: string;
}

function initialState(g: GuestSummary | null): FormState {
  const intent = formIntent();
  return {
    name: g?.name ?? "",
    attending: intent ?? g?.attending ?? null,
    adults: g && g.adults > 0 ? g.adults : 1,
    kids: g?.kids ?? 0,
    isMusician: g?.isMusician ?? false,
    diet: g?.diet ?? "omnivore",
    message: g?.message ?? "",
  };
}

function stepper(label: string, value: number, min: number, max: number, onChange: (v: number) => void): HTMLElement {
  const out = el("output", { class: "stepper-value" }, [String(value)]);
  let current = value;
  const set = (v: number): void => {
    current = Math.max(min, Math.min(max, v));
    out.textContent = String(current);
    onChange(current);
  };
  const minus = el("button", { class: "btn btn-round", type: "button", attrs: { "aria-label": `Fewer ${label}` } }, ["−"]);
  const plus = el("button", { class: "btn btn-round", type: "button", attrs: { "aria-label": `More ${label}` } }, ["+"]);
  on(minus, "click", () => set(current - 1));
  on(plus, "click", () => set(current + 1));
  return el("div", { class: "stepper" }, [
    el("span", { class: "stepper-label" }, [label]),
    el("div", { class: "stepper-controls" }, [minus, out, plus]),
  ]);
}

function dietChips(state: FormState): HTMLElement {
  const group = el("div", { class: "chips", attrs: { role: "radiogroup", "aria-label": "Dietary preference" } });
  for (const option of config().form.dietOptions) {
    const chip = el(
      "button",
      { class: "chip", type: "button", attrs: { role: "radio", "aria-checked": String(state.diet === option.value) } },
      [`${option.label}`],
    );
    on(chip, "click", () => {
      state.diet = option.value;
      for (const c of group.querySelectorAll(".chip")) c.setAttribute("aria-checked", "false");
      chip.setAttribute("aria-checked", "true");
    });
    group.append(chip);
  }
  return group;
}

function musicianToggle(state: FormState): HTMLElement {
  const btn = el(
    "button",
    { class: "toggle", type: "button", attrs: { role: "switch", "aria-checked": String(state.isMusician) } },
    ["🎸 I’ll bring instrument!"],
  );
  on(btn, "click", () => {
    state.isMusician = !state.isMusician;
    btn.setAttribute("aria-checked", String(state.isMusician));
    btn.classList.toggle("on", state.isMusician);
    if (state.isMusician) confettiBurst(btn);
  });
  if (state.isMusician) btn.classList.add("on");
  return btn;
}

function buildYesSection(state: FormState): HTMLElement {
  const children: (Node | string)[] = [
    // el("h3", {}, ["How many are coming?"]),
    stepper("Adults", state.adults, 1, config().form.maxAdults, (v) => (state.adults = v)),
    stepper("Kids", state.kids, 0, config().form.maxKids, (v) => (state.kids = v)),
    // el("h3", {}, ["Anything else?"]),
    dietChips(state),
  ];
  if (config().form.askMusician) children.push(musicianToggle(state));
  return el("div", { class: "reveal", attrs: { hidden: "" } }, children);
}

type CountTier = "ok" | "warm" | "hot" | "full";

function countTier(used: number, max: number): CountTier {
  if (used >= max) return "full";
  if (used >= max * 0.9) return "hot";
  if (used >= max * 0.75) return "warm";
  return "ok";
}

const COUNT_TIER_HINT: Record<CountTier, string> = {
  ok: "",
  warm: "getting sweet",
  hot: "nearly full",
  full: "sugar overload!",
};

/**
 * A live "used / max" readout with a fill bar under a textarea. The colour and a
 * one-word hint escalate as the limit nears; the number bumps on each keystroke.
 * Screen readers hear only tier changes (not every keystroke) via a polite status.
 */
function charCounter(box: HTMLTextAreaElement, max: number): { node: HTMLElement; update: () => void } {
  const used = el("span", { class: "char-used" });
  const hint = el("span", { class: "char-hint", attrs: { "aria-hidden": "true" } });
  const fill = el("span", { class: "char-fill" });
  const status = el("span", { class: "sr-only", attrs: { role: "status" } });
  const node = el("div", { class: "char-count", attrs: { id: "message-count" } }, [
    el("span", { class: "char-bar", attrs: { "aria-hidden": "true" } }, [fill]),
    el("span", { class: "char-meta", attrs: { "aria-hidden": "true" } }, [
      el("span", { class: "char-candy" }, ["🍬"]),
      used,
      ` / ${max}`,
      hint,
    ]),
    status,
  ]);

  let lastTier: CountTier | null = null;
  const update = (): void => {
    const length = box.value.length;
    const tier = countTier(length, max);
    used.textContent = String(length);
    hint.textContent = COUNT_TIER_HINT[tier] ? ` · ${COUNT_TIER_HINT[tier]}` : "";
    fill.style.transform = `scaleX(${Math.min(1, length / max)})`;
    node.dataset.tier = tier;
    if (tier !== lastTier) {
      status.textContent = tier === "ok" ? "" : `${Math.max(0, max - length)} characters left`;
      lastTier = tier;
    }
    // Restart the bump animation on every change.
    used.classList.remove("bump");
    void used.offsetWidth;
    used.classList.add("bump");
  };
  update();
  return { node, update };
}

function buildNoSection(state: FormState): HTMLElement {
  const children: (Node | string)[] = [];
  if (config().form.decline.askMessage) {
    const box = el("textarea", {
      class: "input textarea",
      placeholder: "Gimmi some sugar babe!",
      value: state.message,
      attrs: {
        "aria-label": "A note to the host",
        "aria-describedby": "message-count",
        rows: "10",
        maxlength: String(MESSAGE_MAX_LENGTH),
      },
    });
    const counter = charCounter(box, MESSAGE_MAX_LENGTH);
    on(box, "input", () => {
      state.message = box.value;
      counter.update();
    });
    children.push(box, counter.node);
  }
  return el("div", { class: "reveal", attrs: { hidden: "" } }, children);
}

export interface RsvpForm {
  /** The form body: name, attendance, and the yes/no follow-ups. */
  fields: HTMLElement[];
  /** The submit button, so the caller can place it in an action bar. */
  submit: HTMLButtonElement;
}

interface RsvpFormOptions {
  /** Called once the RSVP is saved. `first` is true when this guest had not answered before. */
  onSaved: (saved: GuestSummary, first: boolean) => void;
  /** Optional element placed directly under the yes/no buttons. */
  belowChoice?: HTMLElement;
}

export function buildRsvpForm({ onSaved, belowChoice }: RsvpFormOptions): RsvpForm {
  const existing = guest();
  const state = initialState(existing);
  setFormIntent(null);

  const nameInput = el("input", {
    class: "input",
    type: "text",
    value: state.name,
    placeholder: "Your full name",
    attrs: {
      "aria-label": "Your full name",
      autocomplete: "name",
      required: "true",
      "aria-describedby": "name-error",
    },
  });
  // Full names are unique per guest: a taken name shows a warning and blocks submit.
  const nameWarning = el("p", { class: "field-error", attrs: { id: "name-error", role: "alert" } });
  let nameTaken = false;
  let nameCheckTimer: number | undefined;
  let nameCheckSeq = 0;

  function setNameTaken(taken: boolean): void {
    nameTaken = taken;
    nameWarning.textContent = taken ? copy().nameTaken : "";
    if (taken) nameInput.setAttribute("aria-invalid", "true");
    else nameInput.removeAttribute("aria-invalid");
    updateSubmit();
  }

  // Debounced while typing, immediate on blur. Only the latest request may update
  // the warning. A failed check is ignored: the server re-validates on submit.
  function checkName(delayMs: number): void {
    window.clearTimeout(nameCheckTimer);
    const name = state.name.trim();
    const seq = ++nameCheckSeq;
    if (!name) {
      setNameTaken(false);
      return;
    }
    nameCheckTimer = window.setTimeout(() => {
      isNameAvailable(name).then(
        (available) => {
          if (seq === nameCheckSeq) setNameTaken(!available);
        },
        () => undefined,
      );
    }, delayMs);
  }

  on(nameInput, "input", () => {
    state.name = nameInput.value;
    updateSubmit();
    checkName(400);
  });
  on(nameInput, "blur", () => checkName(0));

  const yesSection = buildYesSection(state);
  const noSection = buildNoSection(state);
  const error = el("p", { class: "form-error", attrs: { role: "alert", "aria-live": "assertive" } });

  const yesCard = choiceCard(copy().attendingYes, "yes");
  const noCard = choiceCard(copy().attendingNo, "no");

  const answered = existing !== null && hasRsvped(existing);
  const submit = primaryButton(answered ? "Update RSVP" : "Send RSVP", () => void doSubmit());

  const chooseAttending = (value: boolean): void => {
    state.attending = value;
    yesCard.setAttribute("aria-pressed", String(value));
    noCard.setAttribute("aria-pressed", String(!value));
    yesCard.classList.toggle("selected", value);
    noCard.classList.toggle("selected", !value);
    collapse(yesSection, value);
    collapse(noSection, !value);
    updateSubmit();
  };
  on(yesCard, "click", () => chooseAttending(true));
  on(noCard, "click", () => chooseAttending(false));

  function updateSubmit(): void {
    const ready = state.name.trim().length > 0 && state.attending !== null && !nameTaken;
    submit.disabled = !ready;
  }

  async function doSubmit(): Promise<void> {
    if (state.attending === null || !state.name.trim()) return;
    if (state.attending && state.adults < 1) {
      error.textContent = "An acceptance needs at least one adult.";
      return;
    }
    error.textContent = "";
    submit.disabled = true;
    try {
      const res = await rsvp({
        ...signals(),
        name: state.name.trim(),
        attending: state.attending,
        adults: state.attending ? state.adults : 0,
        kids: state.attending ? state.kids : 0,
        isMusician: state.attending ? state.isMusician : false,
        diet: state.attending && state.diet ? state.diet : undefined,
        message: state.message.trim() || undefined,
        overriddenFrom: overriddenFrom() ?? undefined,
      });
      setGuest(res.guest);
      setOverriddenFrom(null);
      onSaved(res.guest, !answered);
    } catch (err) {
      if (err instanceof ApiError && err.code === NAME_TAKEN) {
        setNameTaken(true); // also disables submit until the name changes
        nameInput.focus();
        return;
      }
      error.textContent = "Something went wrong. Please try again.";
      submit.disabled = false;
    }
  }

  updateSubmit();
  if (state.attending !== null) {
    yesSection.hidden = !state.attending;
    noSection.hidden = state.attending;
    yesCard.classList.toggle("selected", state.attending);
    noCard.classList.toggle("selected", !state.attending);
    yesCard.setAttribute("aria-pressed", String(state.attending));
    noCard.setAttribute("aria-pressed", String(!state.attending));
  }

  const fields = [
    // A recognised guest keeps the name they RSVP'd under: only new guests get to type one.
    ...(existing ? [] : [el("label", { class: "field" }, [nameInput]), nameWarning]),
    el("h2", { class: "attend-question" }, [copy().attendingQuestion]),
    el("div", { class: "choice-grid" }, [yesCard, noCard]),
    ...(belowChoice ? [belowChoice] : []),
    yesSection,
    noSection,
    error,
  ];
  return { fields, submit };
}

function choiceCard(label: string, kind: "yes" | "no"): HTMLButtonElement {
  return el(
    "button",
    { class: `choice-card choice-${kind}`, type: "button", attrs: { "aria-pressed": "false" } },
    [el("span", { class: "choice-label" }, [label])],
  );
}
