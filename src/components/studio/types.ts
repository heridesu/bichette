export type LinkType = 'entry' | 'collection' | 'url' | 'none' | 'lightbox';

export interface LinkSpec {
  type: LinkType;
  slug?: string;
  href?: string;
}

export interface DesktopTile {
  slug: string;
  left: number;
  top: number;
  width: number;
  height: number;
  z?: number;
  link: LinkSpec;
}

export interface DesktopSection {
  canvasWidth: number;
  canvasHeight: number;
  tiles: DesktopTile[];
}

export interface MobileItem {
  slug: string;
  width: number;
  aspect: string;
  align?: 'start' | 'end' | 'center';
  link: LinkSpec;
}

export type MobileRow = MobileItem[];

export interface MobileSection {
  rows: MobileRow[];
}

export interface Layout {
  desktopSections: DesktopSection[];
  mobileSections: MobileSection[];
}

interface CollageItemBase {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  z?: number;
  href?: string;
  /** A thin black line at the tile's outer edge. */
  border?: boolean;
  /** Border thickness in px. Only meaningful when `border` is true.
   * Omitted means the long-standing default of 2px. */
  borderWidth?: number;
  /** White padding between the content and the tile's edge — a mat/passe-partout. */
  mat?: boolean;
  /** Mat thickness in px at the canvas's own native width (1440 today) —
   * scales with the canvas like everything else. Only meaningful when
   * `mat` is true; omitted means the long-standing default of 14px. */
  matPadding?: number;
  /** Excluded from Shuffle Images (keeps its photo) and Shuffle Layout
   * (keeps its position/size); also resists manual drag/resize in Studio.
   * Never read by the public site — it's an authoring-only concept. */
  locked?: boolean;
}

export interface CollageImageItem extends CollageItemBase {
  kind: 'image';
  src: string;
  alt?: string;
  aspect?: string;
  /** Clicking opens this image full-screen in place (the same lightbox
   * the homepage's "Full image" link type uses) instead of following
   * `href` — the two are mutually exclusive on one tile. */
  lightbox?: boolean;
  /** Focal point (0-100%) for the existing object-fit: cover crop —
   * re-centers which part of the image shows, without touching the
   * original file. Omitted = 50/50, today's exact centered behavior. */
  focalX?: number;
  focalY?: number;
}

export interface CollageVideoItem extends CollageItemBase {
  kind: 'video';
  src: string;
  aspect?: string;
}

export interface CollageYouTubeItem extends CollageItemBase {
  kind: 'youtube';
  url: string;
}

export type TextSize = 'small' | 'body' | 'large' | 'headline';

export interface CollageTextItem extends CollageItemBase {
  kind: 'text';
  text: string;
  /** Omitted = 'body', the long-standing default size. */
  textSize?: TextSize;
  /** Renders the text in all caps with headline-friendly letter-spacing,
   * regardless of how it was actually typed. */
  uppercase?: boolean;
}

export type CollageTile = CollageImageItem | CollageVideoItem | CollageYouTubeItem | CollageTextItem;

export interface TapePiece {
  id: string;
  color: string;
  left: number;
  top: number;
  width: number;
  height?: number;
  rotation: number;
  torn: boolean;
  tornSeed?: number;
  z?: number;
  locked?: boolean;
}

export interface TackPiece {
  id: string;
  left: number;
  top: number;
  z?: number;
  locked?: boolean;
}

export interface CollageSection {
  canvasWidth: number;
  canvasHeight: number;
  tiles: CollageTile[];
  tape: TapePiece[];
  tacks: TackPiece[];
  /** This section's own template family/variant, if any — lets Shuffle
   * Images/Layout and the template-switch dropdown operate on just this
   * one section independently of every other section on the page. */
  templateId?: string;
  templateVariant?: number;
  /** Breaks this section out to the full viewport width instead of
   * sitting inside the page's normal gutter — for edge-to-edge images.
   * Several images/video at or near full size with different `z` inside
   * one full-bleed section is how a "stacked" look is made; no separate
   * mechanism needed for that. */
  fullBleed?: boolean;
}

export interface CollageData {
  sections: CollageSection[];
  /** Which starting template this collage was built from, if any — lets
   * "shuffle within this template" offer other variants of the same
   * family. Freeform/manually-built collages simply omit this. */
  templateId?: string;
  /** Which of that template's variants is currently active, so Shuffle
   * Layout can pick a genuinely different one next time rather than
   * risking a repeat. */
  templateVariant?: number;
}

export type ContactSheetStyle = 'editorial' | 'compact' | 'film';
export type ContactSheetAspect = 'original' | 'square' | 'portrait' | 'landscape';

export interface ContactSheetImage {
  id: string;
  src: string;
  alt?: string;
  caption?: string;
  /** Focal point (0-100%), only meaningful when the sheet's `aspect`
   * forces a crop (i.e. isn't 'original'). */
  focalX?: number;
  focalY?: number;
}

export interface ContactSheetData {
  images: ContactSheetImage[];
  style: ContactSheetStyle;
  /** Omitted = 3. */
  columnsDesktop?: number;
  /** Omitted = 2. */
  columnsMobile?: number;
  /** Gaps in px. Omitted = the current style's own default (editorial 6,
   * compact 2, film 4) — left unset so switching styles keeps following
   * the new style's default instead of a value baked in earlier. */
  gapX?: number;
  gapY?: number;
  /** Omitted = the current style's own default (editorial 'portrait',
   * compact 'square', film 'original') — same reasoning as the gaps. */
  aspect?: ContactSheetAspect;
  /** Omitted = false. */
  showCaptions?: boolean;
  /** Film style only. Omitted = false. */
  showFrameNumbers?: boolean;
}

export interface EntryInfo {
  slug: string;
  title: string | null;
  image: string;
  imageAlt: string;
  aspect: string;
}

export type EntryType = 'photo' | 'note' | 'link' | 'essay' | 'observation' | 'curiosity';

/** A starting-point preset for a Standard page — a typographic/spacing
 * treatment over the same title/figure/body-block markup, not a
 * different content shape. Meaningless (and ignored) on a Collage page. */
export type PageStyle = 'photo-essay' | 'editorial' | 'object-study' | 'single-image';

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}
export interface ImageBlock {
  type: 'image';
  src: string;
  alt?: string;
  caption?: string;
  aspect?: string;
  href?: string;
  /** Percentage width within the body column; omitted/100 = full width. */
  width?: number;
  /** A thin black line at the frame's outer edge. */
  border?: boolean;
  /** Border thickness in px. Only meaningful when `border` is true.
   * Omitted means the long-standing default of 2px. */
  borderWidth?: number;
  /** White padding between the image and the frame's edge — a mat/passe-partout. */
  mat?: boolean;
  /** Focal point (0-100%) for the existing object-fit: cover crop.
   * Omitted = 50/50, today's exact centered behavior. */
  focalX?: number;
  focalY?: number;
}
export interface ImageGridBlock {
  type: 'imagegrid';
  cols: number;
  /** 'contact-sheet' forces uniform square cells, a tighter gap, and no
   * inline captions — a dense archive grid rather than a composed layout. */
  style?: 'grid' | 'contact-sheet';
  images: { src: string; alt?: string; caption?: string; href?: string; lightbox?: boolean; focalX?: number; focalY?: number }[];
}
export interface YouTubeBlock {
  type: 'youtube';
  url: string;
  caption?: string;
}
export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}
export interface QuoteBlock {
  type: 'quote';
  text: string;
}
export interface RawBlock {
  type: 'raw';
  text: string;
}
export interface VideoBlock {
  type: 'video';
  src: string;
  caption?: string;
  aspect?: string;
}

export type Block = ParagraphBlock | ImageBlock | ImageGridBlock | ListBlock | QuoteBlock | RawBlock | VideoBlock | YouTubeBlock;

export interface PageSummary {
  slug: string;
  type: EntryType;
  title: string | null;
  date: string;
  image?: string;
}

export interface PageData {
  slug: string;
  type: EntryType;
  title?: string;
  date: string;
  image?: string;
  imageAlt?: string;
  aspect?: string;
  caption?: string;
  location?: string;
  url?: string;
  source?: string;
  tags?: string[];
  collections?: string[];
  blocks: Block[];
  template?: 'standard' | 'collage' | 'contact-sheet';
  collage?: CollageData;
  contactSheet?: ContactSheetData;
  pageStyle?: PageStyle;
  /** Excluded from the nav's "elsewhere" random-page link — still
   * reachable at its own URL, just not auto-surfaced. */
  hidden?: boolean;
  /** A second, smaller photo — the Single Image style's optional detail shot. */
  detailImage?: string;
  detailImageAlt?: string;
  /** A short italic aside, distinct from the more formal `caption`. */
  note?: string;
}
