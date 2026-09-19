import { readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, parse, resolve } from "node:path";

// Every JPEG in public/img/slides is a source. Drop in a full-resolution photo, run
// `bun run slides`, and each JPEG is cover-cropped to 3:4, downsized and encoded as
// an optimised .webp next to it. The JPEGs themselves are never modified. Requires
// ImageMagick 7 (`magick`). Never upscales; a source smaller than the baseline keeps
// its size.
//
// The config keeps pointing at the .jpeg; the server sends the .webp instead to
// browsers that accept it (see `webpSibling` in src/server/index.ts).
//
// Why 896x1195: the slide stage is 3:4 on mobile (~360-400 CSS px wide, so ~2.3x on
// a 3x phone) and 16:9 on desktop (object-fit: cover crops the same image, ~700
// CSS px wide). 896 px is also the native resolution of the original artwork.
//
//   bun run slides            convert every JPEG to WebP
//   bun run slides --check    report only; exit 1 if any WebP is missing or stale
//   bun run slides [--check] <dir>   operate on another folder

const dirArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const SLIDES_DIR = dirArg ? resolve(dirArg) : join(import.meta.dir, "..", "public", "img", "slides");

const BASELINE = { width: 896, height: 1195, quality: 78 } as const;
const SOURCE_EXT = /\.jpe?g$/i;
const WEBP_EXT = ".webp";

function magick(args: string[]): string {
  const proc = Bun.spawnSync(["magick", ...args]);
  if (!proc.success) {
    throw new Error(proc.stderr.toString().trim() || `magick exited with code ${proc.exitCode}`);
  }
  return proc.stdout.toString();
}

function requireMagick(): void {
  try {
    magick(["-version"]);
  } catch {
    console.error("ImageMagick 7 (`magick`) was not found on PATH. Install it with:  brew install imagemagick");
    process.exit(1);
  }
}

// Dimensions after EXIF rotation is applied, which is what the viewer sees.
function uprightSize(file: string): { width: number; height: number } {
  const [w = "0", h = "0"] = magick([`${file}[0]`, "-auto-orient", "-format", "%w|%h", "info:"]).split("|");
  return { width: Number(w), height: Number(h) };
}

/** Centre-crop the JPEG to the baseline aspect ratio, downscale (never up) to fit, write a WebP. */
function convert(src: string, tmp: string): { width: number; height: number } {
  const { width: w, height: h } = uprightSize(src);
  const aspect = BASELINE.width / BASELINE.height;

  let cropW = w;
  let cropH = h;
  if (w / h > aspect) cropW = Math.round(h * aspect);
  else cropH = Math.round(w / aspect);
  const x = Math.floor((w - cropW) / 2);
  const y = Math.floor((h - cropH) / 2);

  const downscale = cropW > BASELINE.width;
  const size = downscale ? { width: BASELINE.width, height: BASELINE.height } : { width: cropW, height: cropH };

  magick([
    `${src}[0]`,
    "-auto-orient",
    "-crop",
    `${cropW}x${cropH}+${x}+${y}`,
    "+repage",
    "-background",
    "white",
    "-alpha",
    "remove",
    "-alpha",
    "off",
    "-colorspace",
    "sRGB",
    ...(downscale ? ["-resize", `${size.width}x${size.height}!`] : []),
    "-strip",
    "-quality",
    String(BASELINE.quality),
    "-define",
    "webp:method=6",
    `WEBP:${tmp}`,
  ]);
  return size;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

requireMagick();

const checkOnly = process.argv.includes("--check");
const all = readdirSync(SLIDES_DIR).filter((f) => !f.startsWith("."));
const sources = all.filter((f) => SOURCE_EXT.test(f)).sort();

if (sources.length === 0) {
  console.log("No JPEGs found in", SLIDES_DIR);
  process.exit(0);
}

console.log(
  `[slides] JPEG → WebP, ${BASELINE.width}×${BASELINE.height} (3:4) q${BASELINE.quality}${checkOnly ? " (check only)" : ""}`,
);

const names = new Set(sources.map((f) => parse(f).name));
for (const name of names) {
  const clashes = sources.filter((f) => parse(f).name === name);
  if (clashes.length > 1) {
    console.error(`[slides] ${clashes.join(" and ")} would both write ${name}${WEBP_EXT}; remove one`);
    process.exit(1);
  }
}

let converted = 0;
let stale = 0;
let failed = 0;

for (const file of sources) {
  const { name } = parse(file);
  const src = join(SLIDES_DIR, file);
  const webp = join(SLIDES_DIR, `${name}${WEBP_EXT}`);
  const webpFile = `${name}${WEBP_EXT}`;

  if (checkOnly) {
    const current = Bun.file(webp);
    if ((await current.exists()) && statSync(webp).mtimeMs >= statSync(src).mtimeMs) {
      console.log(`  ok        ${webpFile}`);
    } else {
      stale += 1;
      console.log(`  needs     ${file} → ${webpFile}`);
    }
    continue;
  }

  const tmp = join(SLIDES_DIR, `.${name}.slides-tmp`);
  try {
    const size = convert(src, tmp);
    renameSync(tmp, webp);
    converted += 1;
    const note = size.width < BASELINE.width ? "  (below baseline, not upscaled)" : "";
    console.log(`  converted ${file} ${kb(statSync(src).size)} → ${webpFile} ${size.width}×${size.height} ${kb(statSync(webp).size)}${note}`);
  } catch (err) {
    failed += 1;
    console.error(`  failed    ${file}: ${message(err)}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

// Drop any WebP whose JPEG is gone so a removed slide can't linger.
let orphans = 0;
for (const file of all.filter((f) => f.endsWith(WEBP_EXT))) {
  if (names.has(parse(file).name)) continue;
  orphans += 1;
  if (checkOnly) console.log(`  orphan    ${file}`);
  else {
    rmSync(join(SLIDES_DIR, file));
    console.log(`  removed   ${file} (no matching JPEG)`);
  }
}

console.log(
  checkOnly
    ? `[slides] ${stale} missing or stale, ${orphans} orphaned`
    : `[slides] ${converted} converted${orphans ? `, ${orphans} orphaned removed` : ""}${failed ? `, ${failed} failed` : ""}`,
);

if (failed > 0 || (checkOnly && (stale > 0 || orphans > 0))) process.exit(1);
