import { card, ghostButton, primaryButton, screen } from "../components";
import { el, mount } from "../dom";
import { springIn } from "../motion";
import { navigate } from "../router";
import { config, copy, setFormIntent } from "../store";

export function render(root: HTMLElement): void {
  const canWatchSlides = config().form.decline.showSlides;

  const actions: HTMLElement[] = [
    primaryButton("Actually, I can make it", () => {
      setFormIntent(true);
      navigate("landing");
    }),
  ];
  if (canWatchSlides) {
    actions.push(ghostButton(copy().slidesCta, () => navigate("slides")));
  }

  const content = [
    card([
      el("h1", {}, [copy().declineThanks]),
      el("p", { class: "muted" }, ["Changed your mind? You can flip your answer any time."]),
      el("div", { class: "stack" }, actions),
    ]),
  ];

  mount(root, screen(content));
  const scr = root.querySelector(".screen");
  if (scr) springIn(scr);
}
