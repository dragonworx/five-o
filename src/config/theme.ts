import type { ThemeConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Look and feel: palette, radii, fonts, type scale, motion, dark mode.
// After changing a colour, run `bun run check:contrast` to confirm text stays
// readable (WCAG AA).
// ─────────────────────────────────────────────────────────────────────────────

const theme: ThemeConfig = {
  // "Commodore 64" — the boot-screen blue canvas with a light-blue frame, in the
  // machine's own 16-colour palette (Pepto's measured values), set entirely in
  // the C64 character-set typeface.
  palette: {
    ink: "#352879", // C64 blue — text on the bright yellow/green surfaces
    paper: "#FFFFFF", // C64 white — primary text on the blue screen
    paperDark: "#352879", // C64 blue — the screen
    accent: "#B8C76F", // C64 yellow — buttons, links, focus rings
    accentSoft: "#9AD284", // C64 light green — toggle highlights, confetti
    support: "#6C5EB5", // C64 light blue — the border/frame and rules
    success: "#9AD284", // C64 light green
    danger: "#FF7777", // C64 light red (the brighter VICE value; Pepto's is too dark on blue)
    muted: "#959595", // C64 light grey
  },
  // The C64 is all hard pixel edges: no rounding anywhere.
  radius: { sm: "0px", md: "0px", lg: "0px", pill: "0px" },
  fonts: {
    display: {
      family: "Commodore 64",
      stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      weightRange: "400",
      src: "/fonts/commodore_64/Commodore-64-v6.3.TTF",
    },
    body: {
      family: "Commodore 64",
      stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      weightRange: "400",
      src: "/fonts/commodore_64/Commodore-64-v6.3.TTF",
    },
  },
  // 16px keeps the 8×8 glyph grid on whole device pixels at 1x/2x/3x.
  typeScale: { base: "16px", ratio: 1.25 },
  motion: { spring: { stiffness: 300, damping: 24 }, pageMs: 320, reduceMotionRespected: true },
  grain: false,
  darkMode: "dark",
};

export default theme;
