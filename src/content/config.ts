import { defineCollection, z } from 'astro:content';

// A collage-template page is a freeform canvas — the same drag-and-drop
// idea as the homepage, but scoped to one page's own content rather than
// referencing other entries by slug. It supports the same content kinds
// a Standard page's blocks do (image, video, YouTube, text), just freely
// positioned instead of stacked in a column. Tape/tacks are purely
// decorative scrapbook elements layered on top; `tornSeed` is generated
// once when a torn piece is created and then persisted, so the jagged
// edge it produces is stable (same piece always tears the same way)
// instead of reshuffling on every render.
const collageItemBase = {
  id: z.string(),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
  z: z.number().optional(),
  // A plain URL or an internal path like /entries/some-page — same
  // free-form model Figure/FigureGrid's own `href` already uses.
  href: z.string().optional(),
  // Same thin-border / white-mat framing options as a Standard page's
  // own Image block (see src/components/Figure.astro).
  border: z.boolean().optional(),
  mat: z.boolean().optional(),
};

const collageTile = z.discriminatedUnion('kind', [
  z.object({ ...collageItemBase, kind: z.literal('image'), src: z.string(), alt: z.string().optional(), aspect: z.string().optional() }),
  z.object({ ...collageItemBase, kind: z.literal('video'), src: z.string(), aspect: z.string().optional() }),
  z.object({ ...collageItemBase, kind: z.literal('youtube'), url: z.string() }),
  z.object({ ...collageItemBase, kind: z.literal('text'), text: z.string() }),
]);

const tapePiece = z.object({
  id: z.string(),
  color: z.string(),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  // Thickness, set once when the piece is created and never touched by
  // resizing — real tape has a fixed thickness regardless of how much of
  // it you tear off, so stretching a piece only ever changes `width`
  // (length), never `height`. Optional for pieces saved before this
  // existed, which fall back to deriving it from width (their old look).
  height: z.number().optional(),
  rotation: z.number(),
  torn: z.boolean(),
  tornSeed: z.number().optional(),
  z: z.number().optional(),
});

const tackPiece = z.object({
  id: z.string(),
  left: z.number(),
  top: z.number(),
  z: z.number().optional(),
});

// Independent work areas stacked vertically down the page — the same
// idea as the homepage's own desktopSections. A section's canvasHeight
// is freely resizable in Studio (CollageEditor rescales every tile/tape/
// tack's stored top & height by the old/new ratio when it changes, so
// existing content keeps its exact pixel position instead of stretching)
// — "Add section" is for a deliberate hard break between groups, not the
// only way to get more room.
const collageSection = z.object({
  canvasWidth: z.number(),
  canvasHeight: z.number(),
  tiles: z.array(collageTile),
  tape: z.array(tapePiece),
  tacks: z.array(tackPiece),
});

const collageData = z.object({
  sections: z.array(collageSection),
});

// A single "entries" collection holds every kind of thing that goes on the
// site — a photograph, a short note, a link to something found elsewhere,
// a longer essay, an observation, a curiosity. `type` decides which small
// component renders it; everything else about the entry is just data.
const entries = defineCollection({
  type: 'content',
  schema: z.object({
    type: z.enum(['photo', 'note', 'link', 'essay', 'observation', 'curiosity']),
    title: z.string().optional(),
    date: z.date(),

    // Images are optional and can be any proportion — nothing here forces
    // a crop or a fixed shape. `aspect` is a CSS aspect-ratio value
    // ("4/5", "16/9", "1/1"...) used only to reserve space before the
    // image loads; the image itself is never forced into it.
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    aspect: z.string().optional(),

    caption: z.string().optional(),
    location: z.string().optional(),

    // For "link" entries: where it points and who/what it's from.
    url: z.string().url().optional(),
    source: z.string().optional(),

    tags: z.array(z.string()).optional(),

    // Manual pin to the top of the index, used sparingly.
    featured: z.boolean().optional(),

    // Opt an entry into the homepage collage, and suggest roughly how much
    // room it should take relative to everything else there. The homepage
    // never shows captions regardless of this — it's a wall of images, not
    // a feed — so this only affects size and presence, not rendering.
    homepage: z.boolean().optional(),
    homepageSize: z.enum(['sm', 'md', 'lg', 'wide', 'tall']).optional(),

    // Named archives this entry belongs to (e.g. "scents"). An entry can
    // belong to any number, or none.
    collections: z.array(z.string()).optional(),

    // Whether this entry's image should be clickable where it appears as
    // a thumbnail (e.g. the homepage). Defaults to true — set false for a
    // purely visual moment with nowhere to go. This is a presentation
    // choice about a given appearance, not a statement about the content
    // itself; the entry still gets its own full page either way.
    linked: z.boolean().optional(),

    // 'standard' (default) renders the usual title/body/blocks article.
    // 'collage' replaces that with a freeform drag-and-drop canvas — see
    // `collageData` above.
    template: z.enum(['standard', 'collage']).optional(),
    collage: collageData.optional(),
  }),
});

export const collections = { entries };
