import type { ThemeConfig } from "./config.types";

// ─────────────────────────────────────────────────────────────────────────────
// Look and feel: palette, radii, fonts, type scale, motion, dark mode.
// After changing a colour, run `bun run check:contrast` to confirm text stays
// readable (WCAG AA).
// ─────────────────────────────────────────────────────────────────────────────

const theme: ThemeConfig = {
  // "Terminal noir" — a dark, near-black canvas with a single hot-pink accent
  // and an electric-lime highlight, set entirely in a monospace typeface.
  palette: {
    ink: "#07080B", // dark text — used on bright accent/lime surfaces
    paper: "#E7EBF2", // primary text on the dark canvas (soft off-white)
    paperDark: "#0A0B0F", // page background — near-black
    accent: "#FF4D8D", // hot pink — buttons, links, focus rings
    accentSoft: "#C8FF5B", // electric lime — selected/toggle highlights, confetti
    support: "#8B5CF6", // violet — subtle background glow
    success: "#34D399",
    danger: "#FB6D77",
    muted: "#8A93A6", // cool grey — muted/secondary text
  },
  radius: { sm: "6px", md: "10px", lg: "14px", pill: "999px" },
  fonts: {
    // Monospace everywhere. A coding font if the guest has one, otherwise the
    // platform's system monospace — no web font is downloaded.
    display: {
      family: "JetBrains Mono",
      stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      weightRange: "400 700",
    },
    body: {
      family: "JetBrains Mono",
      stack: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      weightRange: "400 700",
    },
  },
  typeScale: { base: "14px", ratio: 1.2 },
  motion: { spring: { stiffness: 300, damping: 24 }, pageMs: 320, reduceMotionRespected: true },
  grain: true,
  darkMode: "dark",
};

export default theme;
