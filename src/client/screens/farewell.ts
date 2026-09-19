import { card, ghostButton, primaryButton, screen, slidesButton } from "../components";
import { el, mount } from "../dom";
import { attendingCanSeeDetails } from "../flow";
import { springIn } from "../motion";
import { navigate } from "../router";
import { config, copy, guest, setFormIntent } from "../store";

// Where a guest who can't come lands after saving their RSVP (see confirmed.ts for
// those who can). The event details and the slideshow are offered only if the host
// allows decliners to see them, plus a way to change their mind.
export function render(root: HTMLElement): void {
  const g = guest();
  if (g?.attending === true) {
    navigate("confirmed", { replace: true });
    return;
  }

  const actions: HTMLElement[] = [
    primaryButton("Wait, I can make it!", () => {
      setFormIntent(true);
      navigate("landing");
    }),
  ];
  if (g && attendingCanSeeDetails(g)) {
    actions.push(ghostButton("See event details 📣", () => navigate("details")));
  }
  if (config().form.decline.showSlides) {
    actions.push(slidesButton(copy().slidesCta, () => navigate("slides")));
  }

  const content = [
    card([
      el("h1", {}, [copy().declineThanks]),
      el("p", { class: "muted" }, ["Changed your mind? You can come back to this site and flip your answer any time."]),
      el("div", { class: "stack" }, actions),
    ]),
  ];

  mount(root, screen(content));
  const scr = root.querySelector(".screen");
  if (scr) springIn(scr);
}
