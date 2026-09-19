import { rsvp, type Diet, type GuestSummary } from "./api";
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
      [`${option.emoji} ${option.label}`],
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
    ["🎸 I’ll bring my instrument!"],
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
    el("h3", {}, ["How many are coming?"]),
    stepper("Adults", state.adults, 1, config().form.maxAdults, (v) => (state.adults = v)),
    stepper("Kids", state.kids, 0, config().form.maxKids, (v) => (state.kids = v)),
    el("h3", {}, ["Anything else?"]),
    dietChips(state),
  ];
  if (config().form.askMusician) children.push(musicianToggle(state));
  return el("div", { class: "reveal", attrs: { hidden: "" } }, children);
}

function buildNoSection(state: FormState): HTMLElement {
  const children: (Node | string)[] = [];
  if (config().form.decline.askMessage) {
    const box = el("textarea", {
      class: "input textarea",
      placeholder: "Gimmi some sugar babe! (optional)",
      value: state.message,
      attrs: { "aria-label": "A note to the host", rows: "3", maxlength: "2000" },
    });
    on(box, "input", () => (state.message = box.value));
    children.push(box);
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
}

export function buildRsvpForm({ onSaved }: RsvpFormOptions): RsvpForm {
  const existing = guest();
  const state = initialState(existing);
  setFormIntent(null);

  const nameInput = el("input", {
    class: "input",
    type: "text",
    value: state.name,
    placeholder: "Your real full name",
    attrs: { "aria-label": "Your real full name", autocomplete: "name", required: "true" },
  });
  on(nameInput, "input", () => {
    state.name = nameInput.value;
    updateSubmit();
  });

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
    const ready = state.name.trim().length > 0 && state.attending !== null;
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
    } catch {
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
    el("label", { class: "field" }, [el("span", { class: "field-label" }, ["Your real full name"]), nameInput]),
    el("h2", { class: "attend-question" }, [copy().attendingQuestion]),
    el("div", { class: "choice-grid" }, [yesCard, noCard]),
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
