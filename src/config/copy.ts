import type { CopyConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Screen text. "{name}" and "{count}" are placeholders filled in by the client;
// keep them in the strings that use them.
// ─────────────────────────────────────────────────────────────────────────────

const copy: CopyConfig = {
  landingTitle: "Ali’s Big Five 0!",
  landingNew: "Hope to see you!",
  landingReturning: "Welcome back {name}!",
  identityPrompt: "Is this still you?",
  nameTaken: "That name is already on the guest list.",
  attendingQuestion: "Can you make it?",
  attendingYes: "Yarp! 🥳",
  attendingNo: "Narp 🥲",
  declineThanks: "All good my friend, catch you soon!",
  slidesCta: "Slide Show",
  slidesIntro: "{count} totally factual events.",
  detailsTitle: "Details",
  detailsRsvpCta: "RSVP now",
  musicianYes: "Amazing. Bring your instrument.",
};

export default copy;
