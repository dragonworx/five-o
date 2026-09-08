import { readdirSync } from "node:fs";
import { join, parse } from "node:path";

// Generate AVIF + WebP at three widths for each slide image, for use with
// <picture>/srcset. Optional build step — the app serves the original JPEGs if
// this hasn't been run. Requires `sharp` (bun add -d sharp).

const SLIDES_DIR = join(import.meta.dir, "..", "public", "img", "slides");
const WIDTHS = [640, 1080, 1600];
const FORMATS = ["avif", "webp"] as const;

// Non-literal specifier so tsc doesn't require sharp's types to be installed.
const specifier = "sharp";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharp: any = null;
try {
  sharp = (await import(specifier)).default;
} catch {
  console.error("sharp is not installed. Run:  bun add -d sharp\nSkipping image optimisation.");
  process.exit(0);
}

const sources = readdirSync(SLIDES_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
if (sources.length === 0) {
  console.log("No source images found in", SLIDES_DIR);
  process.exit(0);
}

let written = 0;
for (const file of sources) {
  const { name } = parse(file);
  const input = join(SLIDES_DIR, file);
  for (const width of WIDTHS) {
    for (const format of FORMATS) {
      const output = join(SLIDES_DIR, `${name}-${width}.${format}`);
      await sharp(input).resize({ width, withoutEnlargement: true })[format]({ quality: 72 }).toFile(output);
      written += 1;
    }
  }
}

console.log(`[optimise-images] wrote ${written} variants for ${sources.length} images`);
