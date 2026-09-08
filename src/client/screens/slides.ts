import { slidesComplete } from "../api";
import { ghostButton, screen } from "../components";
import { el, interpolate, mount, on } from "../dom";
import { destinationForGuest } from "../flow";
import { springIn } from "../motion";
import { navigate } from "../router";
import { config, copy, guest } from "../store";

const SWIPE_MIN_PX = 45;
const SWIPE_MIN_VELOCITY = 0.25; // px/ms
const HOLD_MS = 350;

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

// After the slideshow the guest lands on the RSVP form; a returning guest who
// already answered skips straight to their destination.
function routeAfterSlides(): void {
  const g = guest();
  navigate(g && g.attending !== null ? destinationForGuest(g) : "rsvp");
}

async function completeSlides(): Promise<void> {
  try {
    await slidesComplete();
  } catch {
    /* no session — still leave the slideshow */
  }
  routeAfterSlides();
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

export function render(root: HTMLElement): void {
  const items = config().slides.items;
  const first = items[0];
  if (!first) {
    void completeSlides();
    return;
  }

  let index = 0;
  let autoTimer = 0;
  let paused = false;

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
    if (paused) return;
    const ms = config().slides.autoAdvanceMs;
    if (ms > 0) autoTimer = window.setTimeout(() => next(), ms);
  };

  const show = (i: number): void => {
    const item = items[i];
    if (!item) return;
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
    if (index >= items.length - 1) void completeSlides();
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

  const topBar = el("div", { class: "slides-top" }, []);
  if (config().slides.allowSkip) {
    const skip = ghostButton(copy().skipToRsvp, routeAfterSlides);
    skip.classList.add("slides-skip");
    topBar.append(skip);
  }

  const content: (Node | string)[] = [
    topBar,
    el("p", { class: "slides-intro" }, [interpolate(copy().slidesIntro, { count: items.length })]),
  ];
  if (config().slides.showProgressBar) content.push(bar);
  content.push(figure, el("div", { class: "slides-controls" }, [prevBtn, playBtn, nextBtn]));

  mount(root, screen(content));
  updateProgress(bar, 0);
  img.classList.add("kenburns");
  preload(items, 0);
  restartAuto();
  const scr = root.querySelector(".screen");
  if (scr) springIn(scr);
}
