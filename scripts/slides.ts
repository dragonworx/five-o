import { existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, parse, resolve } from "node:path";

// Normalise every image in public/img/slides to one baseline so slides load fast
// and look consistent. Drop in a full-resolution photo, run `bun run slides`, and
// it is cover-cropped to 3:4 and downsized in place. Images that already conform
// are left untouched (no re-encode, so no generation loss). Requires ImageMagick 7
// (`magick`). Never upscales; a source smaller than the baseline keeps its size.
//
// Each JPEG also gets a WebP sibling (~30% smaller). The config keeps pointing at
// the .jpeg; the server sends the .webp instead to browsers that accept it.
//
// Why 896x1195: the slide stage is 3:4 on mobile (~360-400 CSS px wide, so ~2.3x on
// a 3x phone) and 16:9 on desktop (object-fit: cover crops the same image, ~700
// CSS px wide). 896 px is also the native resolution of the original artwork.
//
//   bun run slides            convert everything that doesn't conform
//   bun run slides --check    report only; exit 1 if anything would change
//   bun run slides [--check] <dir>   operate on another folder

const dirArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const SLIDES_DIR = dirArg ? resolve(dirArg) : join(import.meta.dir, "..", "public", "img", "slides");

const BASELINE = { width: 896, height: 1195, quality: 78 } as const;
const OUTPUT_EXT = ".jpeg";
const WEBP_EXT = ".webp";
const INPUT_EXT = /\.(jpe?g|png|heic|heif|tiff?)$/i;
const SUBSAMPLING_420 = "2x2,1x1,1x1";
const UPRIGHT = new Set(["Undefined", "TopLeft"]);

interface Probe {
  format: string;
  width: number;
  height: number;
  quality: number;
  interlace: string;
  sampling: string;
  orientation: string;
}

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

function probe(file: string): Probe {
  const fmt = "%m|%w|%h|%Q|%[interlace]|%[jpeg:sampling-factor]|%[orientation]";
  const [format = "", w = "0", h = "0", q = "0", interlace = "", sampling = "", orientation = ""] = magick([
    "identify",
    "-format",
    fmt,
    `${file}[0]`,
  ]).split("|");
  return {
    format,
    width: Number(w),
    height: Number(h),
    quality: Number(q),
    interlace,
    sampling,
    orientation: orientation.trim(),
  };
}

// Dimensions after EXIF rotation is applied, which is what the viewer sees.
function uprightSize(file: string): { width: number; height: number } {
  const [w = "0", h = "0"] = magick([`${file}[0]`, "-auto-orient", "-format", "%w|%h", "info:"]).split("|");
  return { width: Number(w), height: Number(h) };
}

/** Why an image doesn't meet the baseline; empty means it already conforms. */
function violations(p: Probe, ext: string): string[] {
  const out: string[] = [];
  if (ext !== OUTPUT_EXT) out.push(`${ext} → ${OUTPUT_EXT}`);
  if (p.format !== "JPEG") out.push(`format ${p.format}`);
  if (p.width > BASELINE.width || p.height > BASELINE.height) out.push(`${p.width}×${p.height} too large`);
  if (Math.abs(p.height - Math.round((p.width * BASELINE.height) / BASELINE.width)) > 1) out.push("not 3:4");
  if (p.quality > BASELINE.quality) out.push(`q${p.quality}`);
  if (p.interlace !== "JPEG") out.push("not progressive");
  if (p.sampling !== SUBSAMPLING_420) out.push("not 4:2:0");
  if (!UPRIGHT.has(p.orientation)) out.push("EXIF rotation");
  return out;
}

/** Centre-crop to the baseline aspect ratio, then downscale (never up) to fit. */
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
    "-sampling-factor",
    "4:2:0",
    "-interlace",
    "JPEG",
    "-quality",
    String(BASELINE.quality),
    `JPEG:${tmp}`,
  ]);
  return size;
}

/** Encode the WebP sibling from the normalised JPEG (same quality setting). */
function writeWebp(jpeg: string, webp: string, tmp: string): void {
  magick([jpeg, "-quality", String(BASELINE.quality), "-define", "webp:method=6", `WEBP:${tmp}`]);
  renameSync(tmp, webp);
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

requireMagick();

const checkOnly = process.argv.includes("--check");
const files = readdirSync(SLIDES_DIR)
  .filter((f) => !f.startsWith(".") && INPUT_EXT.test(f))
  .sort();

if (files.length === 0) {
  console.log("No images found in", SLIDES_DIR);
  process.exit(0);
}

console.log(
  `[slides] baseline ${BASELINE.width}×${BASELINE.height} (3:4) JPEG q${BASELINE.quality}${checkOnly ? " (check only)" : ""}`,
);

let converted = 0;
let untouched = 0;
let failed = 0;

for (const file of files) {
  const { name, ext } = parse(file);
  const src = join(SLIDES_DIR, file);
  const outName = `${name}${OUTPUT_EXT}`;
  const dest = join(SLIDES_DIR, outName);

  try {
    const before = probe(src);
    const reasons = violations(before, ext);
    if (reasons.length === 0) {
      untouched += 1;
      console.log(`  ok        ${file}  ${before.width}×${before.height}, ${kb(statSync(src).size)}`);
      continue;
    }

    if (files.some((f) => f !== file && f.toLowerCase() === outName.toLowerCase())) {
      throw new Error(`${outName} already exists; rename or remove one of them`);
    }

    const label = file === outName ? file : `${file} → ${outName}`;
    if (checkOnly) {
      converted += 1;
      console.log(`  needs     ${label}  (${reasons.join(", ")})`);
      continue;
    }

    const tmp = join(SLIDES_DIR, `.${name}.slides-tmp`);
    const beforeBytes = statSync(src).size;
    try {
      const size = convert(src, tmp);
      if (src !== dest) rmSync(src);
      renameSync(tmp, dest);
      converted += 1;
      const note = size.width < BASELINE.width ? "  (below baseline, not upscaled)" : "";
      console.log(
        `  converted ${label}  ${before.width}×${before.height} ${kb(beforeBytes)} → ${size.width}×${size.height} ${kb(statSync(dest).size)}${note}`,
      );
    } finally {
      rmSync(tmp, { force: true });
    }
  } catch (err) {
    failed += 1;
    console.error(`  failed    ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const verb = checkOnly ? "need converting" : "converted";
console.log(`[slides] ${converted} ${verb}, ${untouched} already conform${failed ? `, ${failed} failed` : ""}`);

// WebP siblings: (re)build any that are missing or older than their JPEG, and
// drop any whose JPEG is gone so a removed slide can't linger.
let webpNeeded = 0;
const jpegNames = new Set<string>();
for (const file of readdirSync(SLIDES_DIR).filter((f) => !f.startsWith(".") && f.endsWith(OUTPUT_EXT)).sort()) {
  const { name } = parse(file);
  jpegNames.add(name);
  const jpeg = join(SLIDES_DIR, file);
  const webp = join(SLIDES_DIR, `${name}${WEBP_EXT}`);
  if (existsSync(webp) && statSync(webp).mtimeMs >= statSync(jpeg).mtimeMs) continue;
  webpNeeded += 1;
  if (checkOnly) {
    console.log(`  needs     ${name}${WEBP_EXT}`);
    continue;
  }
  const tmp = join(SLIDES_DIR, `.${name}.webp-tmp`);
  try {
    writeWebp(jpeg, webp, tmp);
    console.log(`  webp      ${name}${WEBP_EXT}  ${kb(statSync(jpeg).size)} → ${kb(statSync(webp).size)}`);
  } catch (err) {
    failed += 1;
    console.error(`  failed    ${name}${WEBP_EXT}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}
for (const file of readdirSync(SLIDES_DIR).filter((f) => f.endsWith(WEBP_EXT))) {
  if (jpegNames.has(parse(file).name)) continue;
  webpNeeded += 1;
  if (checkOnly) console.log(`  orphan    ${file}`);
  else {
    rmSync(join(SLIDES_DIR, file));
    console.log(`  removed   ${file} (no matching JPEG)`);
  }
}
console.log(`[slides] webp: ${webpNeeded} ${checkOnly ? "out of date" : "updated"}`);

if (failed > 0 || (checkOnly && (converted > 0 || webpNeeded > 0))) process.exit(1);
