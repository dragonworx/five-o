import { slidesComplete } from "../api";
import { screen } from "../components";
import { el, interpolate, mount, on } from "../dom";
import { destinationForGuest } from "../flow";
import { revealFromCentre, springIn } from "../motion";
import { navigate } from "../router";
import { config, copy, guest } from "../store";

const SWIPE_MIN_PX = 45;
const SWIPE_MIN_VELOCITY = 0.25; // px/ms
const HOLD_MS = 350;
const INTRO_HOLD_MS = 3000; // title alone, centred on screen
const INTRO_MOVE_MS = 900; // glide up to its place while the slides fade in

function preload(items: readonly { src: string }[], from: number): void {
  for (const i of [from + 1, from + 2]) {
    const item = items[i];
    if (item) {
      const img = new Image();
      img.src = item.src;
    }
  }
}

function progressBar(count: number): HTMLElement {
  const bar = el("div", { class: "slides-progress", attrs: { role: "presentation" } });
  for (let i = 0; i < count; i++) bar.append(el("span", { class: "seg" }));
  return bar;
}

function updateProgress(bar: HTMLElement, index: number): void {
  bar.querySelectorAll(".seg").forEach((seg, i) => {
    seg.classList.toggle("filled", i <= index);
  });
}

function controlButton(glyph: string, label: string): HTMLButtonElement {
  return el("button", { class: "btn btn-round slides-btn", type: "button", attrs: { "aria-label": label } }, [glyph]);
}

// The slideshow leads to the final screen (details for guests who are coming).
// Someone who reached it without a saved RSVP goes back to the landing screen.
// The finished slideshow replaces its own history entry, so back never re-enters
// it and the show can be replayed from details any number of times.
function leaveSlides(): void {
  // Idempotent on the server; not awaited so a slow network never delays the exit.
  slidesComplete().catch(() => {
    /* no session — still leave the slideshow */
  });
  const g = guest();
  navigate(g ? destinationForGuest(g) : "landing", { replace: true });
}

interface GestureHandlers {
  next: () => void;
  prev: () => void;
  pauseStart: () => void;
  pauseEnd: () => void;
}

function wireGestures(stage: HTMLElement, h: GestureHandlers): void {
  let startX = 0;
  let startT = 0;
  let holdTimer = 0;

  on(stage, "pointerdown", (ev) => {
    startX = ev.clientX;
    startT = performance.now();
    h.pauseStart();
    holdTimer = window.setTimeout(() => (holdTimer = -1), HOLD_MS);
  });

  on(stage, "pointerup", (ev) => {
    const heldLong = holdTimer === -1;
    if (holdTimer > 0) clearTimeout(holdTimer);
    const dx = ev.clientX - startX;
    const dt = Math.max(1, performance.now() - startT);
    const velocity = Math.abs(dx) / dt;

    if (Math.abs(dx) > SWIPE_MIN_PX && velocity > SWIPE_MIN_VELOCITY) {
      if (dx < 0) h.next();
      else h.prev();
      return;
    }
    if (heldLong) {
      h.pauseEnd();
      return;
    }
    // Tap zones: left third back, otherwise advance.
    const third = stage.clientWidth / 3;
    if (ev.clientX - stage.getBoundingClientRect().left < third) h.prev();
    else h.next();
  });

  on(stage, "pointercancel", () => h.pauseEnd());
}

export function render(root: HTMLElement): (() => void) | void {
  const items = config().slides.items;
  const first = items[0];
  if (!first) {
    leaveSlides();
    return;
  }

  // All per-run state lives in this closure, so every visit starts from slide 1, unpaused.
  let index = 0;
  let autoTimer = 0;
  let paused = false;
  let finished = false; // completed or navigated away: late taps and timers are ignored

  const img = el("img", { class: "slide-img", src: first.src, alt: first.alt, attrs: { draggable: "false" } });
  const caption = el("figcaption", { class: "slide-caption" }, [first.caption]);
  const figure = el(
    "figure",
    { class: "slide-stage", attrs: { "aria-roledescription": "carousel", "aria-label": "Fifty years in pictures" } },
    [img, caption],
  );
  const bar = progressBar(items.length);

  const clearAuto = (): void => {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
  };
  const restartAuto = (): void => {
    clearAuto();
    if (paused || finished) return;
    const ms = config().slides.autoAdvanceMs;
    if (ms > 0) autoTimer = window.setTimeout(() => next(), ms);
  };
  const finish = (): void => {
    if (finished) return;
    finished = true;
    clearAuto();
    leaveSlides();
  };

  const show = (i: number): void => {
    const item = items[i];
    if (!item || finished) return;
    index = i;
    img.src = item.src;
    img.alt = item.alt;
    caption.textContent = item.caption;
    updateProgress(bar, i);
    springIn(caption);
    img.classList.remove("kenburns");
    img.getBoundingClientRect(); // force reflow to restart the Ken Burns animation
    img.classList.add("kenburns");
    preload(items, i);
    restartAuto();
  };

  const next = (): void => {
    if (finished) return;
    if (index >= items.length - 1) finish();
    else show(index + 1);
  };
  const prev = (): void => {
    if (index > 0) show(index - 1);
  };

  wireGestures(figure, { next, prev, pauseStart: clearAuto, pauseEnd: restartAuto });

  const prevBtn = controlButton("‹", "Previous slide");
  const playBtn = controlButton("⏸", "Pause");
  const nextBtn = controlButton("›", "Next slide");
  const togglePause = (): void => {
    paused = !paused;
    playBtn.textContent = paused ? "▶" : "⏸";
    playBtn.setAttribute("aria-label", paused ? "Play" : "Pause");
    restartAuto();
  };
  on(prevBtn, "click", prev);
  on(nextBtn, "click", next);
  on(playBtn, "click", togglePause);

  const top = el("div", { class: "slides-top", attrs: { "aria-hidden": "true" } });
  const intro = el("p", { class: "slides-intro" }, [interpolate(copy().slidesIntro, { count: items.length })]);
  const controls = el("div", { class: "slides-controls" }, [prevBtn, playBtn, nextBtn]);
  const content: (Node | string)[] = [top, intro];
  if (config().slides.showProgressBar) content.push(bar);
  content.push(figure, controls);

  mount(root, screen(content));
  updateProgress(bar, 0);

  // The title is shown alone in the centre first; the slideshow starts as it
  // glides up to its place and the rest fades in.
  const begin = (): void => {
    img.classList.add("kenburns");
    preload(items, 0);
    restartAuto();
  };
  const rest = [top, ...(config().slides.showProgressBar ? [bar] : []), figure, controls];
  revealFromCentre(intro, rest, INTRO_HOLD_MS, INTRO_MOVE_MS, begin);

  // Called by the router when this screen is replaced (including via back).
  return () => {
    finished = true;
    clearAuto();
  };
}
