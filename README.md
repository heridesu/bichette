# bichette

A personal archive — photographs, visual inspiration, favorite things,
objects, places, observations, essays, and curiosities — with no imposed
theme. Image-led and a little unusual on purpose.

## Running it locally

Requires [Node.js](https://nodejs.org) (18+) and npm.

```bash
cd bichette
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:4321`).

`npm run build` produces a static build in `dist/`. `npm run preview` serves
that build locally.

## How content works

Every entry is a file in [`src/content/entries/`](src/content/entries/) —
Markdown (`.md`) or MDX (`.mdx`) with frontmatter. Layout code never edits
these files; it asks Astro's content collection for the list and renders
whatever comes back, so adding, removing, or reordering entries never
touches a component.

Entries don't use rigid, type-specific templates. A `type` (`photo`, `note`,
`link`, `essay`, `observation`, `curiosity`) is still required, mostly to
label the entry and choose its eyebrow — but every entry gets the **same**
flexible detail page at `/entries/<slug>`, which adapts to whatever fields
are actually present: a lead image if there's an `image`, a title if there's
a `title`, then the Markdown/MDX body, then an optional outbound link and
tags. The full field list is in [`src/content/config.ts`](src/content/config.ts).

Presentation fields (all optional, all additive):

- **`homepage: true`** — opt this entry into the homepage image collage.
  **`homepageSize`** (`sm` / `md` / `lg` / `wide` / `tall`) is a loose size
  hint, not a pixel position — the grid's auto-placement does the actual
  arranging, so this is the only thing you ever set to compose the homepage.
- **`linked: false`** — on the homepage, don't make this tile clickable.
  Defaults to `true`. This is a presentation choice about *that appearance*,
  not a property of the entry — the entry still has its own full page
  either way, and the same image could be clickable somewhere else.
- **`collections: [scents]`** — add this entry to one or more named archive
  pages at `/collections/<name>` (see `src/pages/collections/[slug].astro`).
  An entry can belong to any number, or none.

### Adding an entry

Create a file in `src/content/entries/`, e.g. `src/content/entries/19-my-new-photo.md`:

```markdown
---
type: photo
title: "Some title"
date: 2026-12-01
image: /sample/01.svg
aspect: "4/5"
caption: "Optional caption."
tags: [optional, tags]
homepage: true
homepageSize: md
---
```

It gets its own page at `/entries/19-my-new-photo` automatically. Add
`homepage: true` to also show it in the homepage collage, or
`collections: [some-name]` to add it to an archive page.

### Varied compositions within a single page

An entry isn't limited to one image + one paragraph. Use `.mdx` instead of
`.md` and import the layout components already used in
[`18-a-shop-that-no-longer-exists.mdx`](src/content/entries/18-a-shop-that-no-longer-exists.mdx):

```mdx
---
type: essay
title: "..."
date: 2026-12-01
---

import Figure from '../../components/Figure.astro';
import FigureGrid from '../../components/FigureGrid.astro';

Some prose.

<FigureGrid cols={3}>
  <Figure src="/photos/a.jpg" caption="..." />
  <Figure src="/photos/b.jpg" caption="..." />
  <Figure src="/photos/c.jpg" caption="..." />
</FigureGrid>

More prose, another single <Figure />, a list — whatever the piece needs.
```

`Figure` and `FigureGrid` ([`src/components/`](src/components/)) are the
only two layout primitives so far; add more the same way as new
compositions come up.

### Using your own images

Drop real images into `public/` (e.g. `public/photos/`) and point `image`
(or a `<Figure src="...">`) at that path. The seven files in
`public/sample/` are flat-color placeholders — delete them once you don't
need them.

## Layout notes

- **Homepage** (`src/pages/index.astro`) — a CSS grid collage of every
  `homepage: true` entry's image, sized by `homepageSize` with
  `grid-auto-flow: dense` so items pack asymmetrically without manual
  coordinates. No captions here by design; it's a wall of images. Column
  count steps up from 2 → 4 → 6 as the viewport widens, and tile sizes
  still vary at every step rather than flattening to uniform cards.
- **Entry pages** (`src/pages/entries/[slug].astro`) — one template for
  every entry, generated automatically for all of them.
- **Collection pages** (`src/pages/collections/[slug].astro`) — one per
  distinct name used in any entry's `collections` list (currently just
  `scents`, as a working example). Reuses the original homepage's CSS
  multi-column layout, since that's a better fit for a scannable list than
  for an art-directed collage.
- **"elsewhere ↗"** in the nav (`src/components/Nav.astro`) jumps to a
  random entry. It's a client-side pick from a list of every entry's URL
  baked in at build time — no server needed.
- Typography and nav (`src/styles/global.css`, `src/components/Nav.astro`)
  are intentionally minimal: white background, plain sans body text, a
  serif for titles, blue underlined links. Expect this to keep evolving.
- `src/components/Entry.astro`, `PhotoBlock.astro`, `LinkBlock.astro`,
  `TextBlock.astro`, and `EssayBlock.astro` are the original per-type
  cards from the first prototype. Nothing currently renders them — the
  homepage and entry/collection pages were rebuilt around the more
  flexible approach above — so they're left in place rather than deleted,
  in case a future index/listing view wants per-type cards again.

## Not included (by design, for now)

- No CMS or admin UI — entries are just Markdown/MDX files.
- No hosting/deploy setup.
- No `/about` page yet (linked from nav as inactive).
- No mobile Paper mockups yet — the responsive/mobile layout above is a
  reasonable first pass, not a final design.
