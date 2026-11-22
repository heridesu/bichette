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
  /** White padding between the content and the tile's edge — a mat/passe-partout. */
  mat?: boolean;
}

export interface CollageImageItem extends CollageItemBase {
  kind: 'image';
  src: string;
  alt?: string;
  aspect?: string;
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

export interface CollageTextItem extends CollageItemBase {
  kind: 'text';
  text: string;
}

export type CollageTile = CollageImageItem | CollageVideoItem | CollageYouTubeItem | CollageTextItem;

export interface TapePiece {
  id: string;
  color: string;
  left: number;
  top: number;
  width: number;
  rotation: number;
  torn: boolean;
  tornSeed?: number;
  z?: number;
}

export interface TackPiece {
  id: string;
  left: number;
  top: number;
  z?: number;
}

export interface CollageSection {
  canvasWidth: number;
  canvasHeight: number;
  tiles: CollageTile[];
  tape: TapePiece[];
  tacks: TackPiece[];
}

export interface CollageData {
  sections: CollageSection[];
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
  /** A thin black line at the frame's outer edge. */
  border?: boolean;
  /** White padding between the image and the frame's edge — a mat/passe-partout. */
  mat?: boolean;
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
  template?: 'standard' | 'collage';
  collage?: CollageData;
}
