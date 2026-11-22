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

export interface EntryInfo {
  slug: string;
  title: string | null;
  image: string;
  imageAlt: string;
  aspect: string;
}

export type EntryType = 'photo' | 'note' | 'link' | 'essay' | 'observation' | 'curiosity';

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
}
export interface ImageGridBlock {
  type: 'imagegrid';
  cols: number;
  images: { src: string; alt?: string; caption?: string; href?: string }[];
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
}
