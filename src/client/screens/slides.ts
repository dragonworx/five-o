import { slidesComplete } from "../api";
import { screen } from "../components";
import { el, interpolate, mount, on } from "../dom";
import { destinationForGuest } from "../flow";
import { flashChars, revealFromCentre, springIn } from "../motion";
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

// Listeners are bound with `signal`, so aborting it unbinds them and the hold
// timer is cleared by `cleanup` when the screen is torn down.
function wireGestures(stage: HTMLElement, h: GestureHandlers, signal: AbortSignal): () => void {
  let startX = 0;
  let startT = 0;
  let holdTimer = 0;
  let heldLong = false;
  let pressed = false; // a press that began on the stage and has not ended yet

  const clearHold = (): void => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
    }
  };
  // The press ended without a gesture (cancelled, or the pointer left the stage
  // before release): resume autoplay, which the pointerdown had paused.
  const abandon = (): void => {
    if (!pressed) return;
    pressed = false;
    clearHold();
    h.pauseEnd();
  };

  on(
    stage,
    "pointerdown",
    (ev) => {
      pressed = true;
      heldLong = false;
      startX = ev.clientX;
      startT = performance.now();
      h.pauseStart();
      clearHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        heldLong = true;
      }, HOLD_MS);
    },
    { signal },
  );

  on(
    stage,
    "pointerup",
    (ev) => {
      // Ignore a release whose press did not start here (e.g. dragged in from elsewhere).
      if (!pressed) return;
      pressed = false;
      clearHold();
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
    },
    { signal },
  );

  on(stage, "pointercancel", abandon, { signal });
  on(stage, "pointerleave", abandon, { signal });

  return clearHold;
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

  const prevBtn = controlButton("‹", "Previous slide");
  const playBtn = controlButton("⏸", "Pause");
  const nextBtn = controlButton("›", "Next slide");

  // Previous has nowhere to go on the first slide, so it fades (aria-disabled, not
  // `disabled`, so a focused button keeps focus). Next stays live on the last slide
  // because it leaves the show, and is labelled for what it now does.
  const syncControls = (): void => {
    prevBtn.setAttribute("aria-disabled", String(index === 0));
    nextBtn.setAttribute("aria-label", index === items.length - 1 ? "Finish slideshow" : "Next slide");
  };

  const show = (i: number): void => {
    const item = items[i];
    if (!item || finished) return;
    index = i;
    img.src = item.src;
    img.alt = item.alt;
    caption.textContent = item.caption;
    updateProgress(bar, i);
    syncControls();
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
    if (finished) return;
    if (index > 0) show(index - 1);
    else restartAuto(); // a press on the stage paused autoplay; a no-op back must resume it
  };

  const listeners = new AbortController();
  const { signal } = listeners;
  const stopGestures = wireGestures(figure, { next, prev, pauseStart: clearAuto, pauseEnd: restartAuto }, signal);

  const togglePause = (): void => {
    paused = !paused;
    playBtn.textContent = paused ? "▶" : "⏸";
    playBtn.setAttribute("aria-label", paused ? "Play" : "Pause");
    restartAuto();
  };
  on(prevBtn, "click", () => prev(), { signal });
  on(nextBtn, "click", () => next(), { signal });
  on(playBtn, "click", togglePause, { signal });

  const top = el("div", { class: "slides-top", attrs: { "aria-hidden": "true" } });
  const intro = el("p", { class: "slides-intro" }, [interpolate(copy().slidesIntro, { count: items.length })]);
  const controls = el("div", { class: "slides-controls" }, [prevBtn, playBtn, nextBtn]);
  const content: (Node | string)[] = [top, intro];
  if (config().slides.showProgressBar) content.push(bar);
  content.push(figure, controls);

  mount(root, screen(content));
  updateProgress(bar, 0);
  syncControls();

  // The title is shown alone in the centre first; the slideshow starts as it
  // glides up to its place and the rest fades in.
  const begin = (): void => {
    img.classList.add("kenburns");
    preload(items, 0);
    restartAuto();
  };
  const rest = [top, ...(config().slides.showProgressBar ? [bar] : []), figure, controls];
  revealFromCentre(intro, rest, INTRO_HOLD_MS, INTRO_MOVE_MS, begin);
  flashChars(intro, INTRO_HOLD_MS); // a white head scans the title while it is centred

  // Called by the router when this screen is replaced (including via back).
  return () => {
    finished = true;
    clearAuto();
    stopGestures();
    listeners.abort();
  };
}
