// Motion helpers on the native Web Animations API (element.animate), so no
// animation library ships in the bundle. Everything here is a no-op under
// prefers-reduced-motion, and page transitions use the View Transitions API
// where available, falling back to a short cross-fade.

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface MaybeViewTransition {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
}

export function transitionTo(render: () => void): void {
  if (prefersReducedMotion()) {
    render();
    return;
  }
  const doc = document as unknown as MaybeViewTransition;
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(render);
    return;
  }
  render();
  const app = document.getElementById("app");
  if (app) {
    app.animate(
      { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0)"] },
      { duration: 320, easing: EASE_OUT },
    );
  }
}

/** `delay` is in seconds. The node stays hidden until its delay has elapsed. */
export function springIn(node: Element, delay = 0): void {
  if (prefersReducedMotion()) return;
  node.animate(
    { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] },
    { duration: 420, delay: delay * 1000, easing: EASE_OUT, fill: "backwards" },
  );
}

/**
 * Holds `title` in the centre of the viewport for `holdMs` while `rest` stays
 * hidden, then glides it to its layout position and fades `rest` in. `onReveal`
 * fires as that move begins (immediately under reduced motion, which skips the
 * whole sequence). It is skipped if the title has left the DOM by then.
 */
export function revealFromCentre(
  title: HTMLElement,
  rest: readonly HTMLElement[],
  holdMs: number,
  moveMs: number,
  onReveal: () => void,
): void {
  if (prefersReducedMotion()) {
    onReveal();
    return;
  }
  const box = title.getBoundingClientRect();
  const centred = `translate(${window.innerWidth / 2 - (box.left + box.width / 2)}px, ${
    window.innerHeight / 2 - (box.top + box.height / 2)
  }px)`;
  const total = holdMs + moveMs;
  for (const node of rest) node.style.visibility = "hidden";

  const glide = title.animate(
    [
      { transform: centred, offset: 0 },
      { transform: centred, offset: holdMs / total, easing: EASE_OUT },
      { transform: "translate(0, 0)", offset: 1 },
    ],
    { duration: total, fill: "both" },
  );
  glide.finished.then(() => glide.cancel(), () => {});

  window.setTimeout(() => {
    if (!title.isConnected) return;
    for (const node of rest) {
      node.style.visibility = "";
      node.animate({ opacity: [0, 1] }, { duration: moveMs, easing: EASE_OUT, fill: "backwards" });
    }
    onReveal();
  }, holdMs);
}

const FLASH_RADIUS = 3; // characters on each side of the head that pick up some white

/**
 * Sweeps a white "head" through the characters of `node`'s text over
 * `durationMs`, one character at a time (skipping whitespace). The head is
 * fully white and its neighbours fade back to the natural text colour, so it
 * reads like a cursor scanning the line. The original text is restored when it
 * finishes, and it stops early if the node leaves the DOM. A no-op under
 * prefers-reduced-motion.
 */
export function flashChars(node: HTMLElement, durationMs: number): void {
  if (prefersReducedMotion()) return;
  const text = node.textContent ?? "";
  const chars = Array.from(text);
  const glyphs: number[] = []; // indices into `chars` that the head can land on
  chars.forEach((ch, i) => {
    if (ch.trim() !== "") glyphs.push(i);
  });
  if (glyphs.length === 0) return;

  const spans = chars.map((ch) => {
    const span = document.createElement("span");
    span.textContent = ch;
    return span;
  });
  node.replaceChildren(...spans);

  const paint = (head: number): void => {
    spans.forEach((span, i) => {
      const strength = Math.max(0, 1 - Math.abs(i - head) / (FLASH_RADIUS + 1));
      span.style.color =
        strength > 0
          ? `color-mix(in oklab, var(--paper) ${Math.round(strength * 100)}%, var(--text-muted))`
          : "";
    });
  };

  const start = performance.now();
  let lastGlyph = -1;
  const frame = (now: number): void => {
    const progress = (now - start) / durationMs;
    if (!node.isConnected || progress >= 1) {
      if (node.isConnected) node.textContent = text;
      return;
    }
    const glyph = Math.min(glyphs.length - 1, Math.floor(progress * glyphs.length));
    if (glyph !== lastGlyph) {
      lastGlyph = glyph;
      paint(glyphs[glyph] ?? 0);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Height-animated expand/collapse for the headcount/diet steps.
export function collapse(node: HTMLElement, open: boolean): void {
  if (prefersReducedMotion()) {
    node.style.height = open ? "auto" : "0px";
    node.style.overflow = open ? "" : "hidden";
    node.hidden = !open;
    return;
  }
  node.hidden = false;
  node.style.overflow = "hidden";
  const from = `${node.getBoundingClientRect().height}px`;
  const to = `${open ? node.scrollHeight : 0}px`;
  node.style.height = to; // the end state, which the animation reveals
  node.animate({ height: [from, to] }, { duration: 340, easing: EASE_OUT });
  if (open) {
    window.setTimeout(() => {
      node.style.height = "auto";
      node.style.overflow = "";
    }, 340);
  } else {
    window.setTimeout(() => {
      node.hidden = true;
    }, 340);
  }
}

// Quaver burst when the musician toggle is switched on. Deterministic spread —
// no PRNG needed for a cosmetic effect. Notes fan out symmetrically above the
// toggle, in the brightest palette colours, at three sizes for depth.
const NOTE_GLYPHS = ["♪", "♫", "♬", "♩"];
const NOTE_COLOURS = ["var(--text)", "var(--accent)", "var(--success)"];
const NOTE_SIZES_PX = [44, 58, 72];

export function confettiBurst(origin: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const rect = origin.getBoundingClientRect();
  const count = 24;
  const fan = (Math.PI * 2) / 3; // 120° cone, centred straight up
  for (let i = 0; i < count; i++) {
    const angle = (i / (count - 1) - 0.5) * fan;
    const reach = 190 + (i % 4) * 45;
    const dx = Math.sin(angle) * reach;
    const dy = -Math.cos(angle) * reach - (i % 5) * 20;
    const size = NOTE_SIZES_PX[i % NOTE_SIZES_PX.length] ?? 44;
    const note = document.createElement("span");
    note.textContent = NOTE_GLYPHS[i % NOTE_GLYPHS.length] ?? "♪";
    note.className = "confetti-note";
    note.style.left = `${rect.left + rect.width / 2}px`;
    note.style.top = `${rect.top + rect.height / 2}px`;
    note.style.fontSize = `${size}px`;
    note.style.color = NOTE_COLOURS[i % NOTE_COLOURS.length] ?? "var(--text)";
    document.body.append(note);
    const spin = (i % 2 === 0 ? 1 : -1) * (25 + (i % 3) * 20);
    note
      .animate(
        [
          { transform: "translate(-50%,-50%) scale(0.4) rotate(0deg)", opacity: 1, offset: 0 },
          { transform: `translate(calc(-50% + ${dx * 0.55}px),calc(-50% + ${dy * 0.55}px)) scale(1.25) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.4 },
          { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1) rotate(${spin}deg)`, opacity: 0, offset: 1 },
        ],
        { duration: 1500, delay: (i % 6) * 25, easing: EASE_OUT, fill: "both" },
      )
      .finished.then(() => note.remove(), () => note.remove());
  }
  origin.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.08)", offset: 0.3 }, { transform: "scale(1)" }],
    { duration: 380, easing: EASE_OUT },
  );
}
