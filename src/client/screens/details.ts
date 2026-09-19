import { formatEventWhen } from "../calendar";
import { card, ghostButton, screen, slidesButton } from "../components";
import { el, mount } from "../dom";
import { attendingCanSeeDetails, canPreviewDetails } from "../flow";
import { springIn } from "../motion";
import { navigate } from "../router";
import { config, copy, guest } from "../store";

function addressBlock(): HTMLElement {
  const event = config().event;
  const lines = event.addressLines.map((line) => el("span", { class: "addr-line" }, [line]));
  return el("address", { class: "venue" }, [
    el("strong", {}, [event.venueName]),
    el("div", { class: "addr" }, lines),
  ]);
}

function whenBlock(): HTMLElement {
  const { day, time } = formatEventWhen(config().event);
  return el("div", { class: "when" }, [
    el("div", { class: "when-day" }, [day]),
    el("div", { class: "when-time" }, [time]),
  ]);
}

function notesBlock(): HTMLElement | null {
  const notes = config().event.notes;
  if (notes.length === 0) return null;
  return el("ul", { class: "notes" }, notes.map((n) => el("li", {}, [n])));
}

export function render(root: HTMLElement): void {
  const g = guest();
  // Guests who haven't answered yet may preview the details, with a way back to the form.
  const preview = canPreviewDetails(g);
  if (g && !attendingCanSeeDetails(g)) {
    navigate("farewell", { replace: true });
    return;
  }

  const event = config().event;
  const mapLink = el(
    "a",
    { class: "map-link", href: event.mapsUrl, attrs: { target: "_blank", rel: "noopener" } },
    ["Open in maps"],
  );

  const children: (Node | string)[] = [
    el("h1", {}, [copy().detailsTitle]),
    // el("p", { class: "lead" }, [event.title]),
    card([whenBlock(), addressBlock(), mapLink]),
  ];

  const notes = notesBlock();
  if (notes) children.push(card([notes]));

  // Before an RSVP the hero button is the way back to the form; afterwards it plays the
  // slideshow.
  children.push(
    el("div", { class: "stack cross-links" }, [
      ...(preview ? [] : [ghostButton("Edit my RSVP", () => navigate("landing"))]),
      preview
        ? slidesButton(copy().detailsRsvpCta, () => navigate("landing"), false)
        : slidesButton(copy().slidesCta, () => navigate("slides")),
    ]),
  );

  mount(root, screen(children));
  const scr = root.querySelector(".screen");
  if (scr) springIn(scr);
}
