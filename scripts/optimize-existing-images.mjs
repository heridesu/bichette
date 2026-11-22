#!/usr/bin/env node
// One-time (but safely re-runnable) migration: optimizes every
// not-yet-optimized image already sitting in public/photos/, backs up
// each untouched original to originals/photos/, and rewrites every
// content reference to the new optimized path. Safe to re-run — already
// -optimized files (matching `-<width>.webp`) are skipped every time.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeImage, slugifyBaseName, uniqueBaseName } from '../src/lib/imageOptimize.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PHOTOS_DIR = path.join(ROOT, 'public/photos');
const ORIGINALS_DIR = path.join(ROOT, 'originals/photos');
const ENTRIES_DIR = path.join(ROOT, 'src/content/entries');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.gif', '.tiff', '.bmp']);
const ALREADY_OPTIMIZED = /-(\d+)\.webp$/;

async function main() {
  const allFiles = await fs.readdir(PHOTOS_DIR);
  const legacy = [];
  for (const name of allFiles) {
    const full = path.join(PHOTOS_DIR, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    if (ALREADY_OPTIMIZED.test(name)) continue;
    const ext = path.extname(name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    legacy.push({ name, ext, size: stat.size });
  }

  console.log(`Found ${legacy.length} not-yet-optimized image(s) in public/photos/.\n`);

  await fs.mkdir(ORIGINALS_DIR, { recursive: true });

  const mapping = []; // { oldPath, newPath }
  let totalBefore = 0;
  let totalAfter = 0;
  const failures = [];

  for (const { name, ext, size } of legacy) {
    const srcPath = path.join(PHOTOS_DIR, name);
    const buffer = await fs.readFile(srcPath);
    totalBefore += size;

    try {
      // Back up the untouched original first, under its own exact
      // filename — before anything else touches it.
      await fs.copyFile(srcPath, path.join(ORIGINALS_DIR, name));

      const baseSlug = slugifyBaseName(name);
      const baseName = await uniqueBaseName(baseSlug, PHOTOS_DIR);
      const { defaultPath, aspect, lossless, widths } = await optimizeImage(buffer, baseName, PHOTOS_DIR);

      // Only now, once the optimized versions exist on disk and the
      // original is safely backed up, remove the old raw file from the
      // publicly-served folder.
      await fs.unlink(srcPath);

      const newSize = (await fs.stat(path.join(PHOTOS_DIR, path.basename(defaultPath)))).size;
      totalAfter += newSize;

      mapping.push({ oldPath: `/photos/${name}`, newPath: defaultPath });
      console.log(
        `  ${name} (${(size / 1024).toFixed(0)}KB) -> ${path.basename(defaultPath)} (${(newSize / 1024).toFixed(0)}KB)` +
          ` [${lossless ? 'lossless' : 'quality 82'}, widths: ${widths.join(',')}], aspect ${aspect}`,
      );
    } catch (err) {
      failures.push({ name, error: err.message });
      console.error(`  FAILED: ${name} — ${err.message}`);
    }
  }

  console.log(`\nOptimized ${mapping.length} image(s). ${failures.length} failure(s).`);
  console.log(`Public/photos default-size total: ${(totalBefore / 1024 / 1024).toFixed(1)}MB -> ${(totalAfter / 1024 / 1024).toFixed(1)}MB (largest variant only; smaller variants are additional).`);

  // Rewrite every reference across all entry content — frontmatter
  // `image:`, MDX body <Figure>/<FigureGrid> src attributes, and the
  // `collage:` JSON blob's image tiles. All three are plain substring
  // occurrences of the exact old path, so one global replace per
  // mapping handles all of them uniformly.
  const entryFiles = (await fs.readdir(ENTRIES_DIR)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  let filesChanged = 0;
  let totalReplacements = 0;

  for (const file of entryFiles) {
    const full = path.join(ENTRIES_DIR, file);
    let content = await fs.readFile(full, 'utf-8');
    let fileReplacements = 0;

    for (const { oldPath, newPath } of mapping) {
      if (content.includes(oldPath)) {
        const count = content.split(oldPath).length - 1;
        content = content.split(oldPath).join(newPath);
        fileReplacements += count;
      }
    }

    if (fileReplacements > 0) {
      await fs.writeFile(full, content, 'utf-8');
      filesChanged++;
      totalReplacements += fileReplacements;
      console.log(`  rewrote ${fileReplacements} reference(s) in ${file}`);
    }
  }

  console.log(`\nRewrote ${totalReplacements} reference(s) across ${filesChanged} entry file(s).`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} file(s) failed and were left untouched:`);
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
