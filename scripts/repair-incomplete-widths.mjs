#!/usr/bin/env node
// One-time repair for images optimized by an earlier, buggy version of
// optimizeImage() that SKIPPED width variants larger than the source
// instead of writing a clamped duplicate — leaving some images missing
// one or more of the 4 standard widths (a gap that produced 404s
// wherever a srcset referenced the missing size). Finds every optimized
// image with fewer than 4 width files, matches it back to its backed-up
// original in originals/photos/, and fills in exactly the missing
// widths — leaving already-complete images and existing filenames
// untouched.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { IMAGE_WIDTHS, slugifyBaseName } from '../src/lib/imageOptimize.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PHOTOS_DIR = path.join(ROOT, 'public/photos');
const ORIGINALS_DIR = path.join(ROOT, 'originals/photos');

function isLossless(meta) {
  return meta.format === 'png' || !!meta.hasAlpha;
}

async function main() {
  const publicFiles = await fs.readdir(PHOTOS_DIR);
  const groups = {};
  for (const f of publicFiles) {
    const m = /^(.*)-(\d+)\.webp$/.exec(f);
    if (!m) continue;
    const [, base, w] = m;
    (groups[base] ||= new Set()).add(Number(w));
  }

  const incomplete = Object.entries(groups)
    .map(([base, widths]) => ({ base, missing: IMAGE_WIDTHS.filter((w) => !widths.has(w)) }))
    .filter((g) => g.missing.length > 0);

  console.log(`${incomplete.length} image(s) missing one or more width variants.\n`);

  const originalFiles = await fs.readdir(ORIGINALS_DIR);
  const slugToOriginal = new Map();
  for (const name of originalFiles) {
    slugToOriginal.set(slugifyBaseName(name), name);
  }

  let repaired = 0;
  let unmatched = 0;

  for (const { base, missing } of incomplete) {
    const originalName = slugToOriginal.get(base);
    if (!originalName) {
      console.log(`  NO MATCH for "${base}" (missing ${missing.join(',')}) — skipped, left as-is`);
      unmatched++;
      continue;
    }

    const buffer = await fs.readFile(path.join(ORIGINALS_DIR, originalName));
    const meta = await sharp(buffer, { failOn: 'none' }).rotate().metadata();
    const lossless = isLossless(meta);

    for (const w of missing) {
      const fileName = `${base}-${w}.webp`;
      const pipeline = sharp(buffer, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true });
      await (lossless ? pipeline.webp({ lossless: true }) : pipeline.webp({ quality: 82 })).toFile(path.join(PHOTOS_DIR, fileName));
    }
    console.log(`  ${originalName} -> filled in ${base}-{${missing.join(',')}}.webp`);
    repaired++;
  }

  console.log(`\nRepaired ${repaired} image(s). ${unmatched} unmatched (left untouched).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
