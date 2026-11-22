// Shared between the public site (src/pages/entries/[slug].astro, built
// at compile time) and Bichette Studio's collage editor — pure logic, no
// DOM or Node APIs, so it works in both places unmodified.

export interface WashiColor {
  id: string;
  label: string;
  hex: string;
}

export const WASHI_COLORS: WashiColor[] = [
  { id: 'neon-pink', label: 'Neon pink', hex: '#ff2d8a' },
  { id: 'dusty-rose', label: 'Dusty rose', hex: '#f2b6b6' },
  { id: 'mustard', label: 'Mustard', hex: '#e8c547' },
  { id: 'sage', label: 'Sage green', hex: '#8ba888' },
  { id: 'sky-blue', label: 'Sky blue', hex: '#8fb8d9' },
  { id: 'lavender', label: 'Lavender', hex: '#b9a6d4' },
  { id: 'black', label: 'Black', hex: '#2b2b2b' },
  { id: 'kraft', label: 'Kraft', hex: '#c9a876' },
];

export const TACK_SRC = '/decorations/tack-silver.png';

// Default stacking order: tiles sit lowest, tape above them, tacks on
// top of that — unchanged from before per-item z-index existed, so old
// saved pieces (no `z` field) keep rendering exactly as they did. A new
// piece always goes on top of everything via nextZ().
const DEFAULT_Z = { tile: 1, tape: 50, tack: 60 } as const;

interface ZItem {
  z?: number;
}

export function itemZ(kind: keyof typeof DEFAULT_Z, item: ZItem): number {
  return item.z ?? DEFAULT_Z[kind];
}

// Scoped to one section — stacking order only ever matters within a
// single canvas, never across separate sections.
export function nextZ(section: { tiles: ZItem[]; tape: ZItem[]; tacks: ZItem[] }): number {
  const all = [
    ...section.tiles.map((t) => itemZ('tile', t)),
    ...section.tape.map((t) => itemZ('tape', t)),
    ...section.tacks.map((t) => itemZ('tack', t)),
  ];
  return (all.length ? Math.max(...all) : 0) + 1;
}

// Same extraction rules as src/components/YouTube.astro — any common
// URL form (watch, youtu.be, shorts) or a bare ID.
export function youtubeEmbedId(input: string): string {
  const trimmed = input.trim();
  const patterns = [
    /youtu\.be\/([^?&/]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&/]+)/,
    /youtube\.com\/shorts\/([^?&/]+)/,
  ];
  for (const re of patterns) {
    const m = re.exec(trimmed);
    if (m) return m[1];
  }
  return trimmed;
}

// Deterministic PRNG (mulberry32) — the same seed always produces the
// same tear, so a piece's randomly-generated edge is persisted once (via
// `tornSeed`) and then renders identically in Studio and on the live
// site, rather than reshuffling on every render.
function mulberry32(seed: number) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cutClipPath(): string {
  return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
}

// Real washi tape pieces are small, so a torn end is mostly straight
// with just a little irregularity — not a jagged zigzag. Top and bottom
// (the tape's factory-cut long edges) always stay perfectly straight;
// only the two short ends get disturbed, by a small amount (1-6%).
export function tornClipPath(seed: number): string {
  const rand = mulberry32(seed);
  const steps = 3 + Math.floor(rand() * 2); // 3-4 points per edge
  const amp = () => 1 + rand() * 5;

  const right: string[] = [];
  const left: string[] = [];
  for (let i = 1; i <= steps; i++) {
    const y = (i / (steps + 1)) * 100;
    right.push(`${(100 - amp()).toFixed(1)}% ${y.toFixed(1)}%`);
    left.push(`${amp().toFixed(1)}% ${(100 - y).toFixed(1)}%`);
  }

  return `polygon(0% 0%, 100% 0%, ${right.join(', ')}, 100% 100%, 0% 100%, ${left.join(', ')})`;
}

export function tapeClipPath(torn: boolean, seed: number | undefined): string {
  if (!torn) return cutClipPath();
  return tornClipPath(seed ?? 1);
}
