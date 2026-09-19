import type { FormConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// RSVP form: headcount caps, diet choices, and what decliners get to see.
// The caps are enforced server-side in routes/rsvp.ts.
// ─────────────────────────────────────────────────────────────────────────────

const form: FormConfig = {
  maxAdults: 8,
  maxKids: 8,
  dietOptions: [
    { value: "omnivore", label: "Omnivore", emoji: "🍖" },
    { value: "vegetarian", label: "Vego", emoji: "🥗" },
    { value: "vegan", label: "Vegan", emoji: "🌱" },
  ],
  askMusician: true,
  decline: {
    askMessage: true, // optional "leave a note" box
    showSlides: true, // decliners still get the slideshow
    showDetails: false, // …but not the address
  },
};

export default form;
