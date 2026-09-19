import type { CopyConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Screen text. "{name}" and "{count}" are placeholders filled in by the client;
// keep them in the strings that use them.
// ─────────────────────────────────────────────────────────────────────────────

const copy: CopyConfig = {
  landingTitle: "Ali’s Big Five O",
  landingNew: "You’re invited.",
  landingReturning: "Welcome back, {name}.",
  identityPrompt: "Is this still you?",
  attendingQuestion: "Can you make it?",
  attendingYes: "Wouldn’t miss it! 🥳",
  attendingNo: "Sorry, can’t make it 🥲",
  declineThanks: "Gutted you can’t make it. Have a drink on me anyway.",
  slidesCta: "Remember the good old days!",
  slidesIntro: "Fifty years in {count} pictures.",
  detailsIntro: "See you there, {name}!",
  musicianYes: "Amazing. Bring your instrument.",
};

export default copy;
