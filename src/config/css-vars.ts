import type { ThemeConfig } from "./config.types";

// Emits the `:root { … }` custom-property block from the theme seeds.
// Injected into every HTML response so a hex change + restart is the whole
// theming workflow. Nothing else in the app hard-codes a colour.

function paletteVars(theme: ThemeConfig): string[] {
  const p = theme.palette;
  return [
    `--ink: ${p.ink};`,
    `--paper: ${p.paper};`,
    `--paper-dark: ${p.paperDark};`,
    `--accent: ${p.accent};`,
    `--accent-soft: ${p.accentSoft};`,
    `--support: ${p.support};`,
    `--success: ${p.success};`,
    `--danger: ${p.danger};`,
    `--muted: ${p.muted};`,
  ];
}

function radiusVars(theme: ThemeConfig): string[] {
  const r = theme.radius;
  return [
    `--radius-sm: ${r.sm};`,
    `--radius-md: ${r.md};`,
    `--radius-lg: ${r.lg};`,
    `--radius-pill: ${r.pill};`,
  ];
}

function fontVars(theme: ThemeConfig): string[] {
  const f = theme.fonts;
  return [
    `--font-display: "${f.display.family}", ${f.display.stack};`,
    `--font-display-weight: ${f.display.weightRange};`,
    `--font-body: "${f.body.family}", ${f.body.stack};`,
    `--font-body-weight: ${f.body.weightRange};`,
  ];
}

function scaleAndMotionVars(theme: ThemeConfig): string[] {
  const t = theme.typeScale;
  const m = theme.motion;
  return [
    `--type-base: ${t.base};`,
    `--type-ratio: ${t.ratio};`,
    `--spring-stiffness: ${m.spring.stiffness};`,
    `--spring-damping: ${m.spring.damping};`,
    `--page-ms: ${m.pageMs}ms;`,
  ];
}

export function buildCssVariables(theme: ThemeConfig): string {
  const vars = [
    ...paletteVars(theme),
    ...radiusVars(theme),
    ...fontVars(theme),
    ...scaleAndMotionVars(theme),
  ];
  return `:root {\n  ${vars.join("\n  ")}\n}`;
}
