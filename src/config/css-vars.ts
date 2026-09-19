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

const FONT_FORMATS: Record<string, { css: string; mime: string }> = {
  woff2: { css: "woff2", mime: "font/woff2" },
  woff: { css: "woff", mime: "font/woff" },
  ttf: { css: "truetype", mime: "font/ttf" },
  otf: { css: "opentype", mime: "font/otf" },
};

export interface FontFile {
  family: string;
  weightRange: string;
  src: string;
  mime: string;
  format: string;
}

// The distinct self-hosted font files the theme asks for (display and body often
// share one). Fonts without a `src` are system stacks and need no @font-face.
export function fontFiles(theme: ThemeConfig): FontFile[] {
  const files = new Map<string, FontFile>();
  for (const spec of [theme.fonts.display, theme.fonts.body]) {
    if (!spec.src || files.has(spec.src)) continue;
    const ext = spec.src.slice(spec.src.lastIndexOf(".") + 1).toLowerCase();
    const fmt = FONT_FORMATS[ext];
    if (!fmt) throw new Error(`Unsupported font file type ".${ext}" for ${spec.src}`);
    files.set(spec.src, {
      family: spec.family,
      weightRange: spec.weightRange,
      src: spec.src,
      mime: fmt.mime,
      format: fmt.css,
    });
  }
  return [...files.values()];
}

export function buildFontFaces(theme: ThemeConfig): string {
  return fontFiles(theme)
    .map(
      (f) => `@font-face {
  font-family: "${f.family}";
  src: url("${f.src}") format("${f.format}");
  font-weight: ${f.weightRange};
  font-style: normal;
  font-display: swap;
}`,
    )
    .join("\n");
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
