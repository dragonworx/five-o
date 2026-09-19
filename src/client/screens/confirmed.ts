import { card, ghostButton, screen, slidesButton } from "../components";
import { el, mount } from "../dom";
import { springIn } from "../motion";
import { navigate } from "../router";
import { copy, guest } from "../store";

// The attending counterpart of the farewell screen: where a guest who can come lands
// after saving their RSVP. The venue and the slideshow are one tap away.
export function render(root: HTMLElement): void {
  // Direct visits by anyone who hasn't said yes go to where they belong.
  if (guest()?.attending !== true) {
    navigate("landing", { replace: true });
    return;
  }

  const content = [
    card([
      el("h1", {}, [copy().rsvpUpdated]),
      el("div", { class: "stack" }, [
        ghostButton("See event details 📣", () => navigate("details")),
        slidesButton(copy().slidesCta, () => navigate("slides")),
      ]),
    ]),
  ];

  mount(root, screen(content));
  const scr = root.querySelector(".screen");
  if (scr) springIn(scr);
}
