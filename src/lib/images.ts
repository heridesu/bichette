// Builds a responsive srcset from the stored "default" path alone, by
// string substitution — no filesystem access needed. This works because
// the upload pipeline (src/lib/imageOptimize.mjs) guarantees all four
// width variants always exist for every optimized image, so there's
// nothing to check for; it's also why this same function is safe to
// call from Studio's browser-side React code, not just Astro components
// at build time.
export const IMAGE_WIDTHS = [480, 960, 1440, 1920] as const;

const DEFAULT_PATTERN = /-(\d+)\.webp$/;

function basePath(src: string): string | null {
  const m = DEFAULT_PATTERN.exec(src);
  return m ? src.slice(0, m.index) : null;
}

/** Is this one of our own optimized images (has the `-<width>.webp` suffix)? */
export function isOptimizedImage(src: string): boolean {
  return DEFAULT_PATTERN.test(src);
}

/**
 * The `srcset` attribute value for an optimized image's stored default
 * path. Returns undefined for anything else (an external URL, or a
 * legacy path that was never optimized) so callers can omit the
 * attribute entirely rather than emit a broken one.
 */
export function responsiveSrcSet(defaultSrc: string): string | undefined {
  const base = basePath(defaultSrc);
  if (!base) return undefined;
  return IMAGE_WIDTHS.map((w) => `${base}-${w}.webp ${w}w`).join(', ');
}

/** The smallest generated width — for small, fixed-size UI thumbnails. */
export function thumbSrc(defaultSrc: string): string {
  const base = basePath(defaultSrc);
  if (!base) return defaultSrc;
  return `${base}-${IMAGE_WIDTHS[0]}.webp`;
}

/** A mid-size width — for Studio's editing canvas, where tiles render larger than a thumbnail but rarely need full resolution. */
export function midSrc(defaultSrc: string): string {
  const base = basePath(defaultSrc);
  if (!base) return defaultSrc;
  return `${base}-${IMAGE_WIDTHS[1]}.webp`;
}
