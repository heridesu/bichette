// Reusable starting-point layouts for the collage editor, derived from
// three real Paper designs (Bichette — Homepage / Hybrid Entry Blend /
// Scents). Plain data, not hardcoded into any component — applyTemplate()
// below is the only logic, and it's pure (no DOM, no fs), so it works
// identically from Studio's browser code.
import type { Block, CollageData, CollageSection, CollageTile, TackPiece, TapePiece } from '../components/studio/types';

export type SlotWeight = 'anchor' | 'medium' | 'small' | 'tiny' | 'banner';

// Importance order for underflow (fewer images than slots) — the
// lowest-weight slots are dropped first, anchors are kept until last so
// a sparse composition still reads as a deliberate, art-directed choice
// rather than a half-empty template.
const WEIGHT_RANK: Record<SlotWeight, number> = { tiny: 0, small: 1, medium: 2, banner: 3, anchor: 4 };

// How heavily a mismatch at this slot counts in the global optimization
// below — an ill-fitting anchor image is worse than an ill-fitting tiny
// one, so the solver is steered toward giving anchors (and banners) the
// best-fitting images first without needing a separate pass for them.
const IMPORTANCE: Record<SlotWeight, number> = { anchor: 3, banner: 2, medium: 1.4, small: 1, tiny: 0.7 };

export interface TemplateSlot {
  left: number;
  top: number;
  width: number;
  height: number;
  weight: SlotWeight;
  /** 'text' slots are filled with a placeholder CollageTextItem, never an image. */
  kind?: 'image' | 'text';
}

export interface TemplateVariant {
  id: string;
  canvasWidth: number;
  canvasHeight: number;
  slots: TemplateSlot[];
}

export interface CollageTemplate {
  id: string;
  name: string;
  description: string;
  /** Where this template is offered — homepage layouts have no room for
   * free-floating text blocks, so a template with 'text' slots is
   * 'entry'-only. */
  contexts: ('homepage' | 'entry')[];
  variants: TemplateVariant[];
}

// Mirrors a variant's whole composition left-right — a legitimate, safe
// way to get a second genuinely different arrangement out of one curated
// composition (the relative spacing/overlap/scale relationships that
// make it work are preserved exactly; only which side the anchor falls
// on changes), rather than hand-placing a second layout from scratch.
function mirror(variant: TemplateVariant, id: string): TemplateVariant {
  return {
    id,
    canvasWidth: variant.canvasWidth,
    canvasHeight: variant.canvasHeight,
    slots: variant.slots.map((s) => ({ ...s, left: 100 - s.left - s.width })),
  };
}

// Point-reflection (180°) — like mirror(), every pairwise relationship
// (spacing, overlap, relative scale) is preserved exactly, so a valid
// non-overlapping composition stays valid, but the result reads as a
// genuinely different arrangement (what was top-left is now
// bottom-right) rather than a simple left-right flip.
function rotate180(variant: TemplateVariant, id: string): TemplateVariant {
  return {
    id,
    canvasWidth: variant.canvasWidth,
    canvasHeight: variant.canvasHeight,
    slots: variant.slots.map((s) => ({ ...s, left: 100 - s.left - s.width, top: 100 - s.top - s.height })),
  };
}

// A single large anchor would read the same way "Cabinet of
// Curiosities" below does (one dominant corner + scattered small
// pieces) unless the REST of the canvas is genuinely used — so this one
// deliberately spreads real visual weight into all four quadrants (a
// second, smaller focal point opposite the anchor, plus standalone
// pieces in the remaining corners) instead of clustering everything
// around the anchor's own edges. Two pairs intentionally overlap
// slightly (items 2 and 7, tucked against the anchor's and the second
// focal point's corners) for the "casually pinned to a wall" feel.
const wanderingGalleryA: TemplateVariant = {
  id: 'wandering-gallery-a',
  canvasWidth: 1440,
  canvasHeight: 1600,
  slots: [
    { left: 8, top: 8, width: 28, height: 32, weight: 'anchor' },
    { left: 30, top: 32, width: 12, height: 10, weight: 'small' }, // overlaps anchor's lower-right corner
    { left: 58, top: 5, width: 22, height: 20, weight: 'medium' },
    { left: 82, top: 8, width: 12, height: 11, weight: 'small' },
    { left: 44, top: 12, width: 8, height: 7, weight: 'tiny' },
    { left: 60, top: 29, width: 9, height: 8, weight: 'tiny' },
    { left: 68, top: 45, width: 26, height: 30, weight: 'medium' },
    { left: 60, top: 40, width: 11, height: 9, weight: 'small' }, // overlaps the second focal point's corner
    { left: 10, top: 50, width: 20, height: 24, weight: 'medium' },
    { left: 12, top: 80, width: 14, height: 12, weight: 'small' },
    { left: 38, top: 76, width: 28, height: 16, weight: 'medium' },
  ],
};

// An actual two-column magazine spread — one tall anchor photo in the
// left column, a contiguous top-photo / text / photo / text flow down
// the right column, each piece touching the next with only a small,
// consistent gap so nothing reads as a disconnected island floating in
// its own whitespace.
const editorialEntryA: TemplateVariant = {
  id: 'editorial-entry-a',
  canvasWidth: 1440,
  canvasHeight: 1100,
  slots: [
    { left: 6, top: 6, width: 48, height: 70, weight: 'anchor' },
    { left: 6, top: 78, width: 48, height: 8, weight: 'small', kind: 'text' },
    { left: 58, top: 6, width: 36, height: 26, weight: 'medium' },
    { left: 58, top: 34, width: 36, height: 16, weight: 'small', kind: 'text' },
    { left: 58, top: 52, width: 36, height: 20, weight: 'small' },
    { left: 58, top: 74, width: 36, height: 12, weight: 'small', kind: 'text' },
  ],
};

// Two medium (not enormous) anchors anchoring two separate clusters,
// plus two more small loose clusters filling the remaining corners —
// several distinct groupings rather than one dominant column, each
// cluster's pieces close enough together to feel deliberately grouped
// rather than randomly scattered.
const cabinetOfCuriositiesA: TemplateVariant = {
  id: 'cabinet-of-curiosities-a',
  canvasWidth: 1440,
  canvasHeight: 1500,
  slots: [
    // Cluster A — anchor + two small pieces, upper-left
    { left: 6, top: 6, width: 24, height: 24, weight: 'anchor' },
    { left: 30, top: 8, width: 11, height: 9, weight: 'small' },
    { left: 6, top: 32, width: 9, height: 7, weight: 'tiny' },
    { left: 16, top: 32, width: 12, height: 10, weight: 'small' },
    // Cluster B — a standalone small group, upper-right
    { left: 58, top: 6, width: 20, height: 18, weight: 'medium' },
    { left: 80, top: 8, width: 8, height: 6, weight: 'tiny' },
    { left: 80, top: 16, width: 10, height: 11, weight: 'small' },
    // Cluster C — second anchor + its own small pieces, lower-center-right
    { left: 42, top: 46, width: 24, height: 24, weight: 'anchor' },
    { left: 68, top: 48, width: 12, height: 10, weight: 'small' },
    { left: 42, top: 72, width: 8, height: 6, weight: 'tiny' },
    // Cluster D — loose scatter, lower-left
    { left: 6, top: 46, width: 13, height: 12, weight: 'small' },
    { left: 6, top: 60, width: 9, height: 7, weight: 'tiny' },
    // Closing piece, offset rather than a full-width bar
    { left: 20, top: 78, width: 45, height: 15, weight: 'banner' },
  ],
};

export const TEMPLATES: CollageTemplate[] = [
  {
    id: 'wandering-gallery',
    name: 'Wandering Gallery',
    description: 'One dominant image, scattered smaller ones, generous whitespace.',
    contexts: ['homepage', 'entry'],
    variants: [
      wanderingGalleryA,
      mirror(wanderingGalleryA, 'wandering-gallery-b'),
      rotate180(wanderingGalleryA, 'wandering-gallery-c'),
    ],
  },
  {
    id: 'editorial-entry',
    name: 'Editorial Entry',
    description: 'A large image with supporting photos and small text passages.',
    contexts: ['entry'],
    variants: [
      editorialEntryA,
      mirror(editorialEntryA, 'editorial-entry-b'),
      rotate180(editorialEntryA, 'editorial-entry-c'),
    ],
  },
  {
    id: 'cabinet-of-curiosities',
    name: 'Cabinet of Curiosities',
    description: 'A loose, captioned collection — two anchors, many small objects.',
    contexts: ['homepage', 'entry'],
    variants: [
      cabinetOfCuriositiesA,
      mirror(cabinetOfCuriositiesA, 'cabinet-of-curiosities-b'),
      rotate180(cabinetOfCuriositiesA, 'cabinet-of-curiosities-c'),
    ],
  },
];

export function getTemplate(id: string): CollageTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export interface TemplateImageInput {
  src: string;
  alt?: string;
  aspect?: string;
  href?: string;
  /** Carried through template apply/reflow so a photo's own framing
   * choice isn't silently stripped when it moves to a different slot. */
  border?: boolean;
  mat?: boolean;
  matPadding?: number;
  lightbox?: boolean;
}

function parseAspect(aspect: string | undefined): number {
  if (!aspect) return 1;
  const [w, h] = aspect.split('/').map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}

function slotAspect(slot: TemplateSlot, canvasWidth: number, canvasHeight: number): number {
  const wPx = (slot.width / 100) * canvasWidth;
  const hPx = (slot.height / 100) * canvasHeight;
  return wPx / hPx;
}

// Log-ratio distance rather than raw difference: a slot twice as wide as
// its image and a slot twice as *tall* as its image are equally bad
// mismatches, which abs(a - b) doesn't treat symmetrically but
// abs(log(a) - log(b)) does.
function aspectDistance(a: number, b: number): number {
  return Math.abs(Math.log(a) - Math.log(b));
}

// Minimizes total cost for a square cost matrix via the Hungarian
// algorithm (Kuhn–Munkres, O(n^3)) — exact, not a heuristic, which is
// fine since a personal scrapbook page never has more than a handful of
// images. Returns, per row, the column it was assigned to.
function hungarianAssignment(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Infinity;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array(n).fill(0);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) result[p[j] - 1] = j - 1;
  }
  return result;
}

interface PositionedSlot {
  slot: TemplateSlot;
  aspect: number;
  /** How heavily a mismatch here counts — callers compute this however
   * suits them (a template slot's weight tag; a shuffle's own tile area)
   * rather than this module assuming a SlotWeight always applies. */
  importance: number;
  /** Which output section this slot belongs to (0 = primary template, 1 = overflow). */
  section: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The one place image↔slot matching happens, for both "apply a
 * template" and (later) "Shuffle Images" — optimizes the WHOLE
 * collection at once (Hungarian algorithm) rather than greedily filling
 * slots in order, so a single bad early pick can't force a worse one
 * later. `randomness` (0 = fully optimal) lets a caller ask for a
 * genuinely different-but-still-good pairing on repeat calls, which is
 * exactly what Shuffle Images wants — without this being a second,
 * separate matching system.
 */
function assignImagesToSlots(
  slots: PositionedSlot[],
  images: TemplateImageInput[],
  randomness = 0,
): { slot: PositionedSlot; image: TemplateImageInput }[] {
  const cost: number[][] = slots.map((s) => {
    return images.map((img) => {
      const base = aspectDistance(parseAspect(img.aspect), s.aspect) * s.importance;
      const jitter = randomness > 0 ? Math.random() * randomness : 0;
      return base + jitter;
    });
  });

  const assignment = hungarianAssignment(cost);
  return slots.map((slot, i) => ({ slot, image: images[assignment[i]] }));
}

// Nudges a slot's own width/height toward the image's real aspect ratio
// — centered on the slot's own middle, and capped so a severe mismatch
// still just crops a little rather than ballooning one tile across the
// composition. Small, expected gaps (the normal case for a fixed
// template) are left untouched entirely.
const ADAPT_TOLERANCE = 0.08; // ~8% aspect gap or less: leave the slot as-is
const MAX_ADAPT_RATIO = 0.3; // never shrink a slot by more than 30% of its own size

function adaptSlotToImage(slot: TemplateSlot, imageAspect: number, canvasWidth: number, canvasHeight: number): TemplateSlot {
  const widthPx = (slot.width / 100) * canvasWidth;
  const heightPx = (slot.height / 100) * canvasHeight;
  const current = widthPx / heightPx;
  if (aspectDistance(imageAspect, current) < ADAPT_TOLERANCE) return slot;

  if (imageAspect > current) {
    // Image is relatively wider than its slot — shrink the slot's
    // height (crop less off the top/bottom) instead of growing its
    // width into whatever sits beside it.
    const idealHeightPx = widthPx / imageAspect;
    const minHeightPx = heightPx * (1 - MAX_ADAPT_RATIO);
    const newHeightPx = Math.max(idealHeightPx, minHeightPx);
    const newHeight = (newHeightPx / canvasHeight) * 100;
    return { ...slot, height: newHeight, top: slot.top + (slot.height - newHeight) / 2 };
  }
  const idealWidthPx = heightPx * imageAspect;
  const minWidthPx = widthPx * (1 - MAX_ADAPT_RATIO);
  const newWidthPx = Math.max(idealWidthPx, minWidthPx);
  const newWidth = (newWidthPx / canvasWidth) * 100;
  return { ...slot, width: newWidth, left: slot.left + (slot.width - newWidth) / 2 };
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Geometry only (no images yet) for the plain flowing grid that extra,
// over-capacity images land in, appended below the template's own
// content in the SAME section/canvas — a page is always exactly one
// section, so there's never a second, plainer-looking canvas tacked on
// underneath. Deliberately not trying to look as considered as the
// curated template above. `startTopPx`/`canvasWidthPx` are pixels;
// returns the extra height this grid needs (px) and its slots as
// percentages of `finalCanvasHeightPx` (passed in once known).
function overflowCellSlots(
  count: number,
  canvasWidthPx: number,
  startTopPx: number,
): { extraHeightPx: number; build: (finalCanvasHeightPx: number) => TemplateSlot[] } {
  const columns = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const gapPx = 16;
  const cellWPx = (canvasWidthPx - gapPx * (columns + 1)) / columns;
  const cellHPx = cellWPx; // roughly square cells — a neutral default for a mixed-aspect grid
  const extraHeightPx = gapPx + rows * (cellHPx + gapPx);

  const build = (finalCanvasHeightPx: number): TemplateSlot[] =>
    Array.from({ length: count }, (_, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const leftPx = gapPx + col * (cellWPx + gapPx);
      const topPx = startTopPx + gapPx + row * (cellHPx + gapPx);
      return {
        left: (leftPx / canvasWidthPx) * 100,
        top: (topPx / finalCanvasHeightPx) * 100,
        width: (cellWPx / canvasWidthPx) * 100,
        height: (cellHPx / finalCanvasHeightPx) * 100,
        weight: 'small' as SlotWeight,
      };
    });
  return { extraHeightPx, build };
}

function tilesFromPairs(pairs: { slot: PositionedSlot; image: TemplateImageInput }[], sectionIndex: number): CollageTile[] {
  return pairs
    .filter((p) => p.slot.section === sectionIndex)
    .map(({ slot, image }, i) => {
      const adapted = adaptSlotToImage(slot.slot, parseAspect(image.aspect), slot.canvasWidth, slot.canvasHeight);
      return {
        kind: 'image',
        id: genId(),
        src: image.src,
        alt: image.alt,
        aspect: image.aspect,
        href: image.href,
        border: image.border,
        mat: image.mat,
        matPadding: image.matPadding,
        lightbox: image.lightbox,
        left: adapted.left,
        top: adapted.top,
        width: adapted.width,
        height: adapted.height,
        z: i + 1,
      } satisfies CollageTile;
    });
}

/**
 * Builds a CollageSection from a template variant and a flat list of
 * images — the core of "apply a template". Always exactly one section:
 * image↔slot matching is a single global optimization across every
 * image and every slot (primary template slots plus any overflow cells
 * together), so a better-fitting image elsewhere in the collection
 * can't get stuck in the wrong frame just because of upload order. More
 * images than the variant's slots: the extras flow into a plainer grid
 * appended below the template's own content, in the SAME canvas —
 * growing its height rather than starting a second section. Fewer
 * images: the lowest-weight slots are dropped first so the result still
 * reads as intentional rather than sparse-and-empty.
 */
export function applyTemplate(
  template: CollageTemplate,
  variantIndex: number,
  images: TemplateImageInput[],
  randomness = 0,
): CollageSection[] {
  const variant = template.variants[variantIndex] ?? template.variants[0];
  const imageSlots = variant.slots.filter((s) => s.kind !== 'text');
  const textSlots = variant.slots.filter((s) => s.kind === 'text');

  if (images.length === 0) {
    return [{ canvasWidth: variant.canvasWidth, canvasHeight: variant.canvasHeight, tiles: [], tape: [], tacks: [], templateId: template.id, templateVariant: variantIndex }];
  }

  let primarySlots = imageSlots;
  if (images.length < imageSlots.length) {
    primarySlots = [...imageSlots].sort((a, b) => WEIGHT_RANK[b.weight] - WEIGHT_RANK[a.weight]).slice(0, images.length);
  }
  const overflowCount = Math.max(0, images.length - imageSlots.length);
  const overflow = overflowCount > 0 ? overflowCellSlots(overflowCount, variant.canvasWidth, variant.canvasHeight) : null;
  const canvasHeight = overflow ? Math.round(variant.canvasHeight + overflow.extraHeightPx) : variant.canvasHeight;

  // The template's own slots (and text slots) were authored as
  // percentages of `variant.canvasHeight` — rescale to the final,
  // possibly-taller canvas so they keep the exact same pixel position
  // and size whether or not an overflow grid ends up appended below.
  const heightScale = variant.canvasHeight / canvasHeight;
  const rescale = (slot: TemplateSlot): TemplateSlot => ({ ...slot, top: slot.top * heightScale, height: slot.height * heightScale });
  const scaledPrimarySlots = primarySlots.map(rescale);
  const scaledTextSlots = textSlots.map(rescale);

  const positioned: PositionedSlot[] = [
    ...scaledPrimarySlots.map((slot) => ({
      slot,
      aspect: slotAspect(slot, variant.canvasWidth, canvasHeight),
      importance: IMPORTANCE[slot.weight],
      section: 0,
      canvasWidth: variant.canvasWidth,
      canvasHeight,
    })),
    ...(overflow
      ? overflow.build(canvasHeight).map((slot) => ({
          slot,
          aspect: slotAspect(slot, variant.canvasWidth, canvasHeight),
          importance: IMPORTANCE[slot.weight],
          section: 1,
          canvasWidth: variant.canvasWidth,
          canvasHeight,
        }))
      : []),
  ];

  const pairs = assignImagesToSlots(positioned, images, randomness);
  const primaryTiles = tilesFromPairs(pairs, 0);
  const overflowTiles = tilesFromPairs(pairs, 1).map((t, i) => ({ ...t, z: primaryTiles.length + i + 1 }) as CollageTile);
  const tiles = [...primaryTiles, ...overflowTiles];

  scaledTextSlots.forEach((slot, i) => {
    // Empty, not a placeholder string — Studio shows a subtle "Add a
    // caption…" hint for an empty text tile via CSS, and the public site
    // skips rendering one entirely, so an un-filled-in slot never ships
    // live as if it were real content.
    tiles.push({
      kind: 'text',
      id: genId(),
      text: '',
      left: slot.left,
      top: slot.top,
      width: slot.width,
      height: slot.height,
      z: tiles.length + i + 1,
    });
  });

  return [
    {
      canvasWidth: variant.canvasWidth,
      canvasHeight,
      tiles,
      tape: [],
      tacks: [],
      templateId: template.id,
      templateVariant: variantIndex,
    },
  ];
}

/**
 * Redistributes images among their OWN existing frames — positions,
 * sizes, borders, matting, links and alt text never move with anything
 * except the photo they belong to; only which photo fills which frame
 * changes. A locked image keeps its photo and is removed from the pool
 * entirely, so it's never duplicated elsewhere and nothing else can take
 * its spot. Non-image content (text, video, youtube, tape, tacks) is
 * completely untouched. `randomness` > 0 (the normal case here) lets
 * repeat clicks land on a genuinely different combination rather than
 * always the single best-fitting one.
 */
export function shuffleImages(collage: CollageData, randomness = 1.5, onlySectionIndex?: number): CollageData {
  const pool: { sectionIndex: number; tileId: string; image: TemplateImageInput }[] = [];
  const slots: PositionedSlot[] = [];

  collage.sections.forEach((section, sectionIndex) => {
    if (onlySectionIndex !== undefined && sectionIndex !== onlySectionIndex) return;
    section.tiles.forEach((tile) => {
      if (tile.kind !== 'image' || tile.locked) return;
      const dummySlot: TemplateSlot = { left: tile.left, top: tile.top, width: tile.width, height: tile.height, weight: 'medium' };
      slots.push({
        slot: dummySlot,
        aspect: slotAspect(dummySlot, section.canvasWidth, section.canvasHeight),
        // A tile's own area stands in for "importance" here (there's no
        // template weight tag for arbitrary existing frames) — bigger
        // frames are more visually prominent, so they get first claim on
        // the best-fitting photo in the pool.
        importance: (tile.width * tile.height) / 1000,
        section: 0,
        canvasWidth: section.canvasWidth,
        canvasHeight: section.canvasHeight,
      });
      pool.push({
        sectionIndex,
        tileId: tile.id,
        image: {
          src: tile.src,
          alt: tile.alt,
          aspect: tile.aspect,
          href: tile.href,
          border: tile.border,
          mat: tile.mat,
          matPadding: tile.matPadding,
          lightbox: tile.lightbox,
        },
      });
    });
  });

  if (pool.length < 2) return collage; // nothing meaningful to redistribute

  const images = pool.map((p) => p.image);
  let pairs = assignImagesToSlots(slots, images, randomness);

  // Guard against landing back on the exact same arrangement — most
  // likely with very few images — so the button never visibly does
  // nothing when a different, equally valid combination exists.
  const isIdentity = (p: typeof pairs) => p.every((pair, i) => pair.image === images[i]);
  for (let attempt = 0; attempt < 3 && isIdentity(pairs); attempt++) {
    pairs = assignImagesToSlots(slots, images, randomness + attempt + 1);
  }

  const assignment = new Map<string, TemplateImageInput>();
  pairs.forEach((pair, i) => assignment.set(pool[i].tileId, pair.image));

  const sections = collage.sections.map((section) => ({
    ...section,
    tiles: section.tiles.map((tile) => {
      if (tile.kind !== 'image' || tile.locked) return tile;
      const assigned = assignment.get(tile.id);
      if (!assigned) return tile;
      return { ...tile, ...assigned } as CollageTile;
    }),
  }));

  return { ...collage, sections };
}

function rescaleToCanvas<T extends { left: number; top: number; width?: number; height?: number }>(
  item: T,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): T {
  const sx = fromW / toW;
  const sy = fromH / toH;
  return {
    ...item,
    left: item.left * sx,
    top: item.top * sy,
    ...(item.width !== undefined ? { width: item.width * sx } : {}),
    ...(item.height !== undefined ? { height: item.height * sy } : {}),
  };
}

/**
 * Rearranges position and size using a different curated template
 * variant — never arbitrary coordinates. Locked tiles, video/youtube
 * tiles, washi tape and thumbtacks keep their exact current pixel
 * position (rescaled only if the canvas's own height changes, so their
 * real size on screen doesn't shift); unlocked images are reflowed into
 * the new variant's image slots through the same intelligent matching
 * used everywhere else; unlocked text tiles keep their written content
 * but move into the new variant's text slots in order — any text beyond
 * what the new layout has room for is left exactly where it was rather
 * than deleted.
 */
// The actual reshuffle logic — takes whichever sections it's asked to
// (the whole collage, for the global buttons; just one, for a
// section's own independent controls) and always returns a *fresh*
// array of sections built from that input, never touching anything
// outside it. Kept separate from CollageData so "shuffle just this one
// section" and "shuffle the whole page" can share every line of logic.
function shuffleLayoutSections(sections: CollageSection[], template: CollageTemplate, variantIndex: number, randomness: number): CollageSection[] {
  const variant = template.variants[variantIndex] ?? template.variants[0];

  type CarriedTile = { kind: 'tile'; tile: CollageTile; fromW: number; fromH: number };
  type CarriedTape = { kind: 'tape'; piece: TapePiece; fromW: number; fromH: number };
  type CarriedTack = { kind: 'tack'; piece: TackPiece; fromW: number; fromH: number };
  const carried: (CarriedTile | CarriedTape | CarriedTack)[] = [];

  const unlockedImages: CollageTile[] = [];
  const unlockedTexts: { tile: CollageTile; fromW: number; fromH: number }[] = [];

  for (const section of sections) {
    for (const tile of section.tiles) {
      if (tile.kind === 'image' && !tile.locked) {
        unlockedImages.push(tile);
      } else if (tile.kind === 'text' && !tile.locked) {
        unlockedTexts.push({ tile, fromW: section.canvasWidth, fromH: section.canvasHeight });
      } else {
        // Locked image/text, or any video/youtube tile — video/youtube
        // are always carried untouched, per "keep video... intact".
        carried.push({ kind: 'tile', tile, fromW: section.canvasWidth, fromH: section.canvasHeight });
      }
    }
    for (const piece of section.tape) carried.push({ kind: 'tape', piece, fromW: section.canvasWidth, fromH: section.canvasHeight });
    for (const piece of section.tacks) carried.push({ kind: 'tack', piece, fromW: section.canvasWidth, fromH: section.canvasHeight });
  }

  const images: TemplateImageInput[] = unlockedImages.map((tile) => {
    const img = tile as CollageTile & { kind: 'image' };
    return {
      src: img.src,
      alt: img.alt,
      aspect: img.aspect,
      href: img.href,
      border: img.border,
      mat: img.mat,
      matPadding: img.matPadding,
      lightbox: img.lightbox,
    };
  });

  const built =
    images.length > 0
      ? applyTemplate(template, variantIndex, images, randomness)
      : [{ canvasWidth: variant.canvasWidth, canvasHeight: variant.canvasHeight, tiles: [] as CollageTile[], tape: [], tacks: [] }];

  const primary = built[0];
  const extraSections = built.slice(1);

  // Fit real, existing text content into the new template's own text
  // slots (applyTemplate already built empty placeholder tiles there,
  // purely for their position) — anything beyond what the new layout
  // holds stays exactly where it already was, carried unchanged.
  const textSlotTiles = primary.tiles.filter((t) => t.kind === 'text');
  const nonTextPrimaryTiles = primary.tiles.filter((t) => t.kind !== 'text');
  const filledTextTiles: CollageTile[] = [];
  textSlotTiles.forEach((slotTile, i) => {
    const real = unlockedTexts[i];
    if (real) {
      filledTextTiles.push({ ...real.tile, left: slotTile.left, top: slotTile.top, width: slotTile.width, height: slotTile.height, z: slotTile.z } as CollageTile);
    }
    // else: an empty template text slot with no real content to fill it — drop the slot, never fabricate text.
  });
  for (let i = textSlotTiles.length; i < unlockedTexts.length; i++) {
    carried.push({ kind: 'tile', tile: unlockedTexts[i].tile, fromW: unlockedTexts[i].fromW, fromH: unlockedTexts[i].fromH });
  }

  const rescaledTiles = carried
    .filter((c): c is CarriedTile => c.kind === 'tile')
    .map((c) => rescaleToCanvas(c.tile, c.fromW, c.fromH, variant.canvasWidth, variant.canvasHeight) as CollageTile);
  const rescaledTape = carried
    .filter((c): c is CarriedTape => c.kind === 'tape')
    .map((c) => rescaleToCanvas(c.piece, c.fromW, c.fromH, variant.canvasWidth, variant.canvasHeight) as TapePiece);
  const rescaledTacks = carried
    .filter((c): c is CarriedTack => c.kind === 'tack')
    .map((c) => rescaleToCanvas(c.piece, c.fromW, c.fromH, variant.canvasWidth, variant.canvasHeight) as TackPiece);

  const finalPrimary: CollageSection = {
    canvasWidth: variant.canvasWidth,
    canvasHeight: variant.canvasHeight,
    tiles: [...nonTextPrimaryTiles, ...filledTextTiles, ...rescaledTiles],
    tape: rescaledTape,
    tacks: rescaledTacks,
    templateId: template.id,
    templateVariant: variantIndex,
  };

  return [finalPrimary, ...extraSections];
}

/**
 * Rearranges position and size across the WHOLE collage (every section
 * collapsed into the chosen template's own structure) using a different
 * curated template variant — never arbitrary coordinates. See
 * `shuffleLayoutSections` above for exactly what moves and what's
 * carried over untouched.
 */
export function shuffleLayout(collage: CollageData, template: CollageTemplate, variantIndex: number, randomness = 0.6): CollageData {
  return {
    sections: shuffleLayoutSections(collage.sections, template, variantIndex, randomness),
    templateId: template.id,
    templateVariant: variantIndex,
  };
}

/**
 * The same reshuffle, scoped to just one section — every other section
 * on the page is left completely untouched. If the section's own image
 * count exceeds the chosen template's slots, the overflow becomes a new
 * section inserted right after it (so later sections keep their place).
 */
export function shuffleLayoutSection(
  collage: CollageData,
  sectionIndex: number,
  template: CollageTemplate,
  variantIndex: number,
  randomness = 0.6,
): CollageData {
  const target = collage.sections[sectionIndex];
  if (!target) return collage;
  const built = shuffleLayoutSections([target], template, variantIndex, randomness);
  const sections = [...collage.sections.slice(0, sectionIndex), ...built, ...collage.sections.slice(sectionIndex + 1)];
  return { ...collage, sections };
}

/**
 * Picks what "Shuffle Layout" should try next: a different variant of
 * the collage's own template family if it has one (never repeating the
 * variant it's already on), or — for a freeform collage with no family —
 * any entry-valid template, so the button always does something useful
 * on the very first click.
 */
export function pickNextVariant(from: { templateId?: string; templateVariant?: number }): { template: CollageTemplate; variantIndex: number } {
  if (from.templateId) {
    const template = getTemplate(from.templateId);
    if (template) {
      if (template.variants.length <= 1) return { template, variantIndex: 0 };
      const current = from.templateVariant ?? 0;
      const options = template.variants.map((_, i) => i).filter((i) => i !== current);
      return { template, variantIndex: options[Math.floor(Math.random() * options.length)] };
    }
  }
  const entryTemplates = TEMPLATES.filter((t) => t.contexts.includes('entry'));
  const template = entryTemplates[Math.floor(Math.random() * entryTemplates.length)];
  return { template, variantIndex: Math.floor(Math.random() * template.variants.length) };
}

/**
 * Switching a page from Standard to Collage used to start from a blank
 * (or templated) canvas, silently leaving the page's existing lead
 * image and body content behind. This instead carries everything over
 * as real, editable tiles in one simple top-to-bottom stack — not a
 * curated composition (there's no "weight" or intent to read from plain
 * sequential blocks), just a faithful, lossless transfer. The result is
 * an ordinary collage the user can then reposition by hand, or hand to
 * Shuffle Layout once it has more than one photo to work with.
 */
export function convertPageToCollage(page: {
  image?: string;
  imageAlt?: string;
  aspect?: string;
  blocks: Block[];
}): CollageData {
  const canvasWidth = 1440;
  const itemWidthPct = 86; // leaves a small margin on both sides, like the article column it's replacing
  const leftPct = (100 - itemWidthPct) / 2;
  const gapPx = 32;

  // Plain `Omit` on a union type collapses it to the shared fields only
  // (losing `src`/`text`/`url`, which only exist on some variants) — the
  // distributive form applies the omit to each member separately first.
  type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
  type PlacedItem = { tile: DistributiveOmit<CollageTile, 'top' | 'height'>; heightPx: number };
  const items: PlacedItem[] = [];

  function pushText(text: string) {
    if (!text.trim()) return;
    // A rough but serviceable height estimate from how much text there
    // is — long passages get more room than a one-line caption, without
    // needing to actually measure rendered text here.
    const heightPx = Math.max(100, Math.min(500, 60 + text.length * 0.5));
    items.push({
      tile: { kind: 'text', id: genId(), text, left: leftPct, width: itemWidthPct },
      heightPx,
    });
  }

  function pushImage(src: string, opts: { alt?: string; aspect?: string; href?: string; border?: boolean; mat?: boolean; caption?: string } = {}) {
    const widthPx = (itemWidthPct / 100) * canvasWidth;
    const aspect = parseAspect(opts.aspect);
    const heightPx = widthPx / aspect;
    items.push({
      tile: {
        kind: 'image',
        id: genId(),
        src,
        alt: opts.alt,
        aspect: opts.aspect,
        href: opts.href,
        border: opts.border,
        mat: opts.mat,
        left: leftPct,
        width: itemWidthPct,
      },
      heightPx,
    });
    if (opts.caption) pushText(opts.caption);
  }

  if (page.image) pushImage(page.image, { alt: page.imageAlt, aspect: page.aspect });

  for (const block of page.blocks) {
    if (block.type === 'paragraph' || block.type === 'quote' || block.type === 'raw') {
      pushText(block.text);
    } else if (block.type === 'list') {
      const prefix = (i: number) => (block.ordered ? `${i + 1}. ` : '• ');
      pushText(block.items.map((item, i) => prefix(i) + item).join('\n'));
    } else if (block.type === 'image') {
      if (block.src) pushImage(block.src, block);
    } else if (block.type === 'imagegrid') {
      for (const img of block.images) {
        if (img.src) pushImage(img.src, { alt: img.alt, href: img.href, caption: img.caption });
      }
    } else if (block.type === 'video') {
      if (block.src) {
        const aspect = parseAspect(block.aspect);
        const widthPx = (itemWidthPct / 100) * canvasWidth;
        items.push({
          tile: { kind: 'video', id: genId(), src: block.src, aspect: block.aspect, left: leftPct, width: itemWidthPct },
          heightPx: widthPx / aspect,
        });
        if (block.caption) pushText(block.caption);
      }
    } else if (block.type === 'youtube') {
      if (block.url) {
        const widthPx = (itemWidthPct / 100) * canvasWidth;
        items.push({
          tile: { kind: 'youtube', id: genId(), url: block.url, left: leftPct, width: itemWidthPct },
          heightPx: widthPx / (16 / 9),
        });
        if (block.caption) pushText(block.caption);
      }
    }
  }

  if (items.length === 0) {
    return { sections: [{ canvasWidth, canvasHeight: 900, tiles: [], tape: [], tacks: [] }] };
  }

  const totalHeightPx = items.reduce((sum, item) => sum + item.heightPx, 0) + gapPx * (items.length + 1);
  let cursorPx = gapPx;
  const tiles: CollageTile[] = items.map((item, i) => {
    const top = (cursorPx / totalHeightPx) * 100;
    const height = (item.heightPx / totalHeightPx) * 100;
    cursorPx += item.heightPx + gapPx;
    return { ...item.tile, top, height, z: i + 1 } as CollageTile;
  });

  return {
    sections: [{ canvasWidth, canvasHeight: Math.round(totalHeightPx), tiles, tape: [], tacks: [] }],
  };
}

// Weight is normally a hand-chosen design intent (see the curated
// templates above) — for a composition built by hand there's no such
// label, so this infers one from a tile's area relative to the single
// largest tile in the section. Coarse, but good enough to steer "fill
// this with new photos" toward giving the biggest frame the best fit.
function inferWeight(area: number, maxArea: number): SlotWeight {
  const ratio = maxArea > 0 ? area / maxArea : 1;
  if (ratio > 0.8) return 'anchor';
  if (ratio > 0.4) return 'medium';
  if (ratio > 0.15) return 'small';
  return 'tiny';
}

/**
 * Captures a section's current arrangement — image and text tile
 * shapes and positions only, never the photos or captions themselves —
 * as a reusable template variant. Video/YouTube tiles, tape and tacks
 * aren't representable as template slots (a template only ever defines
 * image/text slots), so they're left out; applying the resulting
 * template won't recreate them.
 */
export function sectionToTemplateVariant(section: CollageSection, id: string): TemplateVariant {
  const slotTiles = section.tiles.filter((t) => t.kind === 'image' || t.kind === 'text');
  const maxArea = Math.max(0, ...slotTiles.map((t) => t.width * t.height));
  const slots: TemplateSlot[] = slotTiles.map((t) => ({
    left: t.left,
    top: t.top,
    width: t.width,
    height: t.height,
    weight: inferWeight(t.width * t.height, maxArea),
    kind: t.kind === 'text' ? 'text' : 'image',
  }));
  return { id, canvasWidth: section.canvasWidth, canvasHeight: section.canvasHeight, slots };
}

/** How many image/text slots `sectionToTemplateVariant` would actually capture — used to warn before saving if video/tape/tacks would be left out. */
export function countOmittedOnSave(section: CollageSection): number {
  const videoOrYoutube = section.tiles.filter((t) => t.kind === 'video' || t.kind === 'youtube').length;
  return videoOrYoutube + section.tape.length + section.tacks.length;
}
