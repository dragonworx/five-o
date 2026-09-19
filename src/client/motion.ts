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
// no PRNG needed for a cosmetic effect.
export function confettiBurst(origin: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const rect = origin.getBoundingClientRect();
  const notes = ["♪", "♫", "♬", "♩"];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI - Math.PI / 2;
    const spread = 120 + (i % 4) * 30;
    const dx = Math.cos(angle) * spread;
    const dy = -130 - (i % 5) * 26;
    const note = document.createElement("span");
    note.textContent = notes[i % notes.length] ?? "♪";
    note.className = "confetti-note";
    note.style.left = `${rect.left + rect.width / 2}px`;
    note.style.top = `${rect.top}px`;
    document.body.append(note);
    note
      .animate(
        { transform: [`translate(0,0) rotate(0deg)`, `translate(${dx}px,${dy}px) rotate(${dx}deg)`], opacity: [1, 0] },
        { duration: 1000, easing: EASE_OUT, fill: "forwards" },
      )
      .finished.then(() => note.remove(), () => note.remove());
  }
}
