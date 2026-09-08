import { CONFIG } from "../src/config/party.config";

// WCAG AA contrast assertion. Fails (exit 1) if a primary text/background pair
// drops below 4.5:1, so a palette edit that breaks readability is caught before
// deploy. Secondary pairs are reported as warnings — the semantic tokens in
// tokens.css darken muted/button colours further at render time.

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const p = CONFIG.theme.palette;
const WHITE = "#FFFFFF";

interface Pair {
  name: string;
  fg: string;
  bg: string;
  hard: boolean;
}

const pairs: Pair[] = [
  { name: "body text on paper (light)", fg: p.ink, bg: p.paper, hard: true },
  { name: "body text on paper (dark)", fg: p.paper, bg: p.paperDark, hard: true },
  { name: "toggle-on label (ink on gold)", fg: p.ink, bg: p.accentSoft, hard: true },
  { name: "primary button label (white on accent)", fg: WHITE, bg: p.accent, hard: false },
  { name: "muted text on paper", fg: p.muted, bg: p.paper, hard: false },
];

let failures = 0;
for (const pair of pairs) {
  const ratio = contrast(pair.fg, pair.bg);
  const pass = ratio >= 4.5;
  let status = "WARN";
  if (pass) status = "PASS";
  else if (pair.hard) status = "FAIL";
  console.log(`${status}  ${ratio.toFixed(2)}:1  ${pair.name}`);
  if (!pass && pair.hard) failures += 1;
}

if (failures > 0) {
  console.error(`\n${failures} primary contrast pair(s) below WCAG AA 4.5:1.`);
  process.exit(1);
}
console.log("\nAll primary text pairs meet WCAG AA.");
