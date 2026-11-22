// Plain .mjs (not .ts) so this one module can be imported identically
// from an Astro API route (via Vite) and from the standalone migration
// script (via plain `node`), with no build step in either case.
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

// Four breakpoints covering phone through the site's own widest
// container (--max-width: 1400px) plus headroom for retina displays.
// Every one of these is ALWAYS generated for ALWAYS every image — for
// an original narrower than a given breakpoint, that breakpoint's file
// is just a duplicate of the next-smaller one (Sharp never upscales).
// Guaranteeing all four always exist means no caller — Astro component
// or Studio's browser-side React code — ever needs to check the
// filesystem to build a srcset; it's pure string substitution.
export const IMAGE_WIDTHS = [480, 960, 1440, 1920];

function isLossless(meta) {
  // PNG or an alpha channel almost always means a graphic, screenshot,
  // or scan — fine text and hard edges visibly degrade under lossy
  // compression, so those get lossless WebP instead of quality-82.
  // Ordinary camera photos (no alpha, not PNG) use lossy WebP.
  return meta.format === 'png' || !!meta.hasAlpha;
}

/**
 * @param {Buffer} buffer - raw original file bytes, untouched by this call
 * @param {string} baseName - slugified, no extension, already unique in outDir
 * @param {string} outDir - absolute directory to write the generated files into
 * @returns {Promise<{ defaultPath: string, aspect: string, lossless: boolean, widths: number[] }>}
 */
export async function optimizeImage(buffer, baseName, outDir) {
  // .rotate() with no args auto-orients from EXIF — read metadata from
  // THIS (rotated) pipeline specifically, since a 90/270 correction
  // swaps width/height versus the raw file's own stored dimensions.
  const meta = await sharp(buffer, { failOn: 'none' }).rotate().metadata();
  const srcWidth = meta.width;
  const srcHeight = meta.height;
  const lossless = isLossless(meta);

  await fs.mkdir(outDir, { recursive: true });

  // Every width is always written — for a source narrower than a given
  // breakpoint, `withoutEnlargement` clamps the resize to the source's
  // own size instead of upscaling, so that breakpoint's file just ends
  // up identical to the next-smaller one. That's a deliberate trade-off:
  // a handful of tiny duplicate files for small images, in exchange for
  // every caller (Astro components, Studio's browser code) being able
  // to assume every width always exists, with zero filesystem checks —
  // skipping widths here would make that assumption false and produce
  // 404s wherever a srcset was built from it.
  const written = [];
  for (const w of IMAGE_WIDTHS) {
    const fileName = `${baseName}-${w}.webp`;
    const pipeline = sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: w, withoutEnlargement: true });
    await (lossless ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality: 82 })).toFile(path.join(outDir, fileName));
    written.push({ width: w, fileName });
  }

  const largest = written[written.length - 1];
  return {
    defaultPath: `/photos/${largest.fileName}`,
    aspect: `${srcWidth}/${srcHeight}`,
    lossless,
    widths: written.map((w) => w.width),
  };
}

export function slugifyBaseName(name) {
  return (
    name
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

/** Finds a baseName not already used by any `${candidate}-${width}.webp` in dir. */
export async function uniqueBaseName(baseSlug, outDir) {
  let candidate = baseSlug;
  let counter = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const probe = path.join(outDir, `${candidate}-${IMAGE_WIDTHS[0]}.webp`);
    const exists = await fs
      .access(probe)
      .then(() => true)
      .catch(() => false);
    if (!exists) return candidate;
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
}
