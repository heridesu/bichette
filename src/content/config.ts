import { defineCollection, z } from 'astro:content';

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
  }),
});

export const collections = { entries };
