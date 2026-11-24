import { useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import type { CollageData, CollageSection, CollageTile, TackPiece, TapePiece, TextSize } from './types';
import { TAPE_ASPECT, WASHI_COLORS, itemZ, nextZ, tapeClipPath, tapeHeightPercent, youtubeEmbedId } from '../../lib/decorations';
import { midSrc } from '../../lib/images';
import {
  TEMPLATES,
  countOmittedOnSave,
  getTemplate,
  pickNextVariant,
  sectionToTemplateVariant,
  shuffleImages,
  shuffleLayout,
  shuffleLayoutSection,
  type CollageTemplate,
} from '../../lib/collageTemplates';
import { useUndoableState } from './useUndoableState';
import FocalPointPicker from './FocalPointPicker';

const CANVAS_PX = 860;
const MOBILE_PREVIEW_PX = 375;
const POSITIONAL_KEYS = ['left', 'top', 'width', 'height'];

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

type Selected = { section: number; kind: 'tile' | 'tape' | 'tack'; id: string } | null;

interface Props {
  collage: CollageData;
  onChange: (collage: CollageData) => void;
  onUpload: (file: File) => Promise<{ src: string; aspect?: string; kind: 'image' | 'video' }>;
  customTemplates?: CollageTemplate[];
  onSaveTemplate?: (template: CollageTemplate) => void;
  /** Hides every editing control and disables drag/resize, so the canvas
   * reads close to how the live site will actually render it. */
  previewMode?: boolean;
  /** Only meaningful with previewMode — narrows the canvas to a phone-
   * width simulation of the same composition (collage pages have no
   * separate mobile layout of their own today). */
  previewWidth?: 'desktop' | 'mobile';
}

export default function CollageEditor({
  collage,
  onChange,
  onUpload,
  customTemplates = [],
  onSaveTemplate,
  previewMode = false,
  previewWidth = 'desktop',
}: Props) {
  const [selected, setSelected] = useState<Selected>(null);
  // Which section (if any) is showing its "name this template" prompt.
  const [savingTemplateSection, setSavingTemplateSection] = useState<number | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  // Which section (if any) is showing its "remove this and everything in
  // it?" prompt — removing a section is a single click when it's already
  // empty, but anything with real content needs this one extra step
  // first, same as the page-level "Delete page" confirmation below.
  const [confirmingRemoveSection, setConfirmingRemoveSection] = useState<number | null>(null);
  const [showCheckerboard, setShowCheckerboard] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // The collage is a controlled prop AND has its own in-session undo
  // history — this reconciles the two. `undoable.value` is what actually
  // renders; every internal edit goes through `undoable.set`, which (via
  // the effect below) echoes straight back up through `onChange` so the
  // parent's save/dirty flow keeps working exactly as before. An
  // incoming `collage` prop that ISN'T just our own last edit bouncing
  // back down — a different page opened, a template applied from outside,
  // "Revert to Saved" — is a genuinely new editing session, so it resets
  // the whole undo stack instead of being pushed as one more step in it.
  const undoable = useUndoableState<CollageData>(collage);
  const lastExternalRef = useRef(collage);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (collage !== lastExternalRef.current) {
      lastExternalRef.current = collage;
      undoable.reset(collage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collage]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    lastExternalRef.current = undoable.value;
    onChange(undoable.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoable.value]);

  const data = undoable.value;
  const setCollage = undoable.set;

  // Several flows (upload-then-patch, bring-forward-then-...) call
  // setCollage and then, after an `await`, need to read the result of
  // that very update — but a plain closure variable is frozen at
  // whatever it was when this render's closures were created, so a
  // second read after an await is stale (the update from the first call
  // never shows up in this closure). A ref that's reassigned every
  // render always points at the latest value, sidestepping that
  // entirely.
  const collageRef = useRef(data);
  collageRef.current = data;

  // Cmd/Ctrl+Z / Shift+Z — guarded so it never fires while the user is
  // typing somewhere (a caption, a link field) and never fires from a
  // different, currently-hidden Studio tab (Desktop/Mobile/Pages all
  // stay mounted at once; only `offsetParent` tells visible from hidden).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || active?.isContentEditable) return;
      if (!rootRef.current || rootRef.current.offsetParent === null) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) undoable.redo();
      else undoable.undo();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoable.undo, undoable.redo]);

  // Always a functional update (never a precomputed value from
  // `collageRef.current`) — several calls can land in the same React
  // batch (e.g. a multi-file upload's forEach, which fires every
  // addTile synchronously before any of their uploads resolve), and only
  // the functional form lets each one build on the previous one's result
  // instead of every call overwriting the others from the same stale
  // snapshot.
  function patchSection(sectionIndex: number, updater: (section: CollageSection) => CollageSection) {
    setCollage((current) => ({ ...current, sections: current.sections.map((s, i) => (i === sectionIndex ? updater(s) : s)) }));
  }

  function patchTile(sectionIndex: number, id: string, patch: Partial<CollageTile>) {
    const section = collageRef.current.sections[sectionIndex];
    const current = section.tiles.find((t) => t.id === id);
    if (!current) return;
    // react-rnd fires a drag/resize-stop event on a plain click (zero
    // movement) as well as a real drag — ignore anything that isn't an
    // actual change, so selecting a tile never counts as an edit. Any
    // non-positional field (src, url, text, z, href…) always counts.
    const EPSILON = 0.05;
    const changedPosition = POSITIONAL_KEYS.some((key) => {
      if (!(key in patch)) return false;
      const a = (patch as any)[key] as number | undefined;
      const b = (current as any)[key] as number | undefined;
      return a !== undefined && b !== undefined && Math.abs(a - b) > EPSILON;
    });
    const changedOther = Object.keys(patch).some((k) => !POSITIONAL_KEYS.includes(k));
    if (!changedPosition && !changedOther) return;
    patchSection(sectionIndex, (s) => ({
      ...s,
      tiles: s.tiles.map((t) => (t.id === id ? ({ ...t, ...patch } as CollageTile) : t)),
    }));
  }

  // Lines a dragged/resized tile up with the canvas's own edges/center
  // and with every other tile's edges/center in the same section — "snap
  // to grid" in the sense people actually mean it (straight lines against
  // neighboring images), not a fixed numeric grid. Only nudges a position
  // that's already within SNAP_PX of a candidate; everything else is left
  // exactly where the user put it.
  const SNAP_PX = 8;
  function snapAxis(value: number, size: number, candidates: number[]): number {
    const edges = [value, value + size / 2, value + size];
    let best: number | null = null;
    let bestDelta = Infinity;
    for (const edge of edges) {
      for (const c of candidates) {
        const delta = c - edge;
        if (Math.abs(delta) <= SNAP_PX && Math.abs(delta) < bestDelta) {
          bestDelta = Math.abs(delta);
          best = value + delta;
        }
      }
    }
    return best ?? value;
  }
  function snapTilePosition(sectionIndex: number, excludeId: string, x: number, y: number, w: number, h: number, heightPx: number) {
    if (!snapEnabled) return { x, y };
    const section = collageRef.current.sections[sectionIndex];
    const candidatesX = [0, CANVAS_PX / 2, CANVAS_PX];
    const candidatesY = [0, heightPx / 2, heightPx];
    for (const t of section.tiles) {
      if (t.id === excludeId) continue;
      const ox = (t.left / 100) * CANVAS_PX;
      const ow = (t.width / 100) * CANVAS_PX;
      const oy = (t.top / 100) * heightPx;
      const oh = (t.height / 100) * heightPx;
      candidatesX.push(ox, ox + ow / 2, ox + ow);
      candidatesY.push(oy, oy + oh / 2, oy + oh);
    }
    return { x: snapAxis(x, w, candidatesX), y: snapAxis(y, h, candidatesY) };
  }

  function patchTape(sectionIndex: number, id: string, patch: Partial<TapePiece>) {
    const section = collageRef.current.sections[sectionIndex];
    const current = section.tape.find((t) => t.id === id);
    if (!current) return;
    const EPSILON = 0.05;
    const positional: (keyof TapePiece)[] = ['left', 'top', 'width', 'rotation'];
    const changedPosition = positional.some((key) => {
      if (!(key in patch)) return false;
      const a = patch[key] as number | undefined;
      const b = current[key] as number | undefined;
      return a !== undefined && b !== undefined && Math.abs(a - b) > EPSILON;
    });
    const changedOther = Object.keys(patch).some((k) => !positional.includes(k as keyof TapePiece));
    if (!changedPosition && !changedOther) return;
    patchSection(sectionIndex, (s) => ({ ...s, tape: s.tape.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }

  function patchTack(sectionIndex: number, id: string, patch: Partial<TackPiece>) {
    const section = collageRef.current.sections[sectionIndex];
    const current = section.tacks.find((t) => t.id === id);
    if (!current) return;
    const EPSILON = 0.05;
    const positional: (keyof TackPiece)[] = ['left', 'top'];
    const changedPosition = positional.some((key) => {
      if (!(key in patch)) return false;
      const a = patch[key] as number | undefined;
      const b = current[key] as number | undefined;
      return a !== undefined && b !== undefined && Math.abs(a - b) > EPSILON;
    });
    const changedOther = Object.keys(patch).some((k) => !positional.includes(k as keyof TackPiece));
    if (!changedPosition && !changedOther) return;
    patchSection(sectionIndex, (s) => ({ ...s, tacks: s.tacks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }

  function removeSelected() {
    if (!selected) return;
    const { section: si, kind, id } = selected;
    patchSection(si, (s) => {
      if (kind === 'tile') return { ...s, tiles: s.tiles.filter((t) => t.id !== id) };
      if (kind === 'tape') return { ...s, tape: s.tape.filter((t) => t.id !== id) };
      return { ...s, tacks: s.tacks.filter((t) => t.id !== id) };
    });
    setSelected(null);
  }

  function addSection() {
    const section: CollageSection = { canvasWidth: 1440, canvasHeight: 900, tiles: [], tape: [], tacks: [] };
    setCollage((current) => ({ ...current, sections: [...current.sections, section] }));
  }

  function removeSection(sectionIndex: number) {
    setCollage((current) => ({ ...current, sections: current.sections.filter((_, i) => i !== sectionIndex) }));
    if (selected?.section === sectionIndex) setSelected(null);
    setConfirmingRemoveSection(null);
  }

  // Shuffle Images: redistributes photos among their own existing
  // frames. randomness > 0 so repeat clicks explore different
  // combinations instead of always landing on the single best fit.
  function handleShuffleImages() {
    setCollage((current) => shuffleImages(current, 1.5));
  }

  // Shuffle Layout, primary button: stays within the collage's own
  // template family (a different variant each time) — or, for a
  // freeform collage with no family yet, picks any entry-valid template
  // so the button is useful on the very first click too.
  function handleShuffleLayout() {
    setCollage((current) => {
      const { template, variantIndex } = pickNextVariant(current);
      return shuffleLayout(current, template, variantIndex, 0.6);
    });
  }

  // Shuffle Layout, family switcher: an explicit jump to a different
  // template family (still a curated variant, picked at random, never
  // arbitrary coordinates).
  function handleSwitchFamily(templateId: string) {
    const template = getTemplate(templateId);
    if (!template) return;
    setCollage((current) => {
      const variantIndex = Math.floor(Math.random() * template.variants.length);
      return shuffleLayout(current, template, variantIndex, 0.6);
    });
  }

  // Per-section versions of the three above — each section can shuffle
  // images, shuffle layout, or switch template family entirely on its
  // own, leaving every other section on the page untouched.
  function handleShuffleImagesSection(sectionIndex: number) {
    setCollage((current) => shuffleImages(current, 1.5, sectionIndex));
  }

  function handleShuffleLayoutSection(sectionIndex: number) {
    setCollage((current) => {
      const { template, variantIndex } = pickNextVariant(current.sections[sectionIndex]);
      return shuffleLayoutSection(current, sectionIndex, template, variantIndex, 0.6);
    });
  }

  function handleSwitchFamilySection(sectionIndex: number, templateId: string) {
    const template = getTemplate(templateId);
    if (!template) return;
    setCollage((current) => {
      const variantIndex = Math.floor(Math.random() * template.variants.length);
      return shuffleLayoutSection(current, sectionIndex, template, variantIndex, 0.6);
    });
  }

  // Every vertical position/size (tile top & height, tape top & height,
  // tack top) is stored as a percentage of the section's OWN
  // canvasHeight — so just changing canvasHeight would stretch the whole
  // composition instead of simply opening up more room. Rescaling every
  // existing value by the old/new ratio keeps each piece at exactly the
  // same pixel position and size, so growing the canvas only adds empty
  // space at the bottom to drop new content into (and shrinking it packs
  // everything back down, rather than clipping or distorting it).
  function resizeSectionHeight(sectionIndex: number, newHeight: number) {
    const clamped = Math.max(200, Math.round(newHeight));
    patchSection(sectionIndex, (s) => {
      if (clamped === s.canvasHeight) return s;
      const scale = s.canvasHeight / clamped;
      return {
        ...s,
        canvasHeight: clamped,
        tiles: s.tiles.map((t) => ({ ...t, top: t.top * scale, height: t.height * scale }) as CollageTile),
        tape: s.tape.map((t) => ({ ...t, top: t.top * scale, height: t.height !== undefined ? t.height * scale : t.height })),
        tacks: s.tacks.map((t) => ({ ...t, top: t.top * scale })),
      };
    });
  }

  // Stacking order is scoped to one section — it's never meaningful to
  // reorder an element relative to something in a different canvas.
  function allStacked(sectionIndex: number) {
    const s = collageRef.current.sections[sectionIndex];
    return [
      ...s.tiles.map((t) => ({ ref: { kind: 'tile' as const, id: t.id }, z: itemZ('tile', t) })),
      ...s.tape.map((t) => ({ ref: { kind: 'tape' as const, id: t.id }, z: itemZ('tape', t) })),
      ...s.tacks.map((t) => ({ ref: { kind: 'tack' as const, id: t.id }, z: itemZ('tack', t) })),
    ].sort((a, b) => a.z - b.z);
  }

  // Reorders the stack and renumbers EVERY item 1..N in that new order,
  // all in one update. Renumbering everything (rather than swapping just
  // two raw z values) is what makes this work when several items share
  // the same default z — the normal case for anything saved before
  // per-item z-index existed: swapping two items that are BOTH still at
  // the default is swapping a number with itself, so nothing moves.
  function reorderStack(sectionIndex: number, stack: ReturnType<typeof allStacked>, idx: number, direction: 1 | -1) {
    const reordered = [...stack];
    const other = idx + direction;
    [reordered[idx], reordered[other]] = [reordered[other], reordered[idx]];
    const zFor = (kind: 'tile' | 'tape' | 'tack', id: string) => reordered.findIndex((s) => s.ref.kind === kind && s.ref.id === id) + 1;

    patchSection(sectionIndex, (s) => ({
      ...s,
      tiles: s.tiles.map((t) => ({ ...t, z: zFor('tile', t.id) }) as CollageTile),
      tape: s.tape.map((t) => ({ ...t, z: zFor('tape', t.id) })),
      tacks: s.tacks.map((t) => ({ ...t, z: zFor('tack', t.id) })),
    }));
  }

  function bringForward() {
    if (!selected) return;
    const stack = allStacked(selected.section);
    const idx = stack.findIndex((s) => s.ref.kind === selected.kind && s.ref.id === selected.id);
    if (idx === -1 || idx === stack.length - 1) return;
    reorderStack(selected.section, stack, idx, 1);
  }

  function sendBackward() {
    if (!selected) return;
    const stack = allStacked(selected.section);
    const idx = stack.findIndex((s) => s.ref.kind === selected.kind && s.ref.id === selected.id);
    if (idx <= 0) return;
    reorderStack(selected.section, stack, idx, -1);
  }

  // `z` is always computed fresh against the section passed into
  // patchSection's own updater — never from `collageRef.current` — so
  // that several calls landing in the same batch (a multi-file upload's
  // forEach fires every one of these before any of their uploads
  // resolve) each see the OTHERS' tiles already added and don't collide
  // on the same z-index. Any `z` on the passed-in tile is ignored.
  function addTile(sectionIndex: number, tile: CollageTile) {
    patchSection(sectionIndex, (s) => ({ ...s, tiles: [...s.tiles, { ...tile, z: nextZ(s) } as CollageTile] }));
    setSelected({ section: sectionIndex, kind: 'tile', id: tile.id });
  }

  async function handleUploadImage(sectionIndex: number, file: File) {
    // Shows the picked file immediately via a local blob URL, before the
    // upload round-trip even starts, then swaps to the real saved path
    // once it resolves — so there's never a gap with no preview at all.
    const previewUrl = URL.createObjectURL(file);
    const id = genId();
    addTile(sectionIndex, { kind: 'image', id, src: previewUrl, left: 35, top: 35, width: 25, height: 20 });
    const { src, aspect } = await onUpload(file);
    patchTile(sectionIndex, id, { src, aspect } as Partial<CollageTile>);
    URL.revokeObjectURL(previewUrl);
  }

  async function handleUploadVideo(sectionIndex: number, file: File) {
    const previewUrl = URL.createObjectURL(file);
    const id = genId();
    addTile(sectionIndex, { kind: 'video', id, src: previewUrl, left: 35, top: 35, width: 25, height: 20 });
    const { src, aspect } = await onUpload(file);
    patchTile(sectionIndex, id, { src, aspect } as Partial<CollageTile>);
    URL.revokeObjectURL(previewUrl);
  }

  function addYouTube(sectionIndex: number) {
    addTile(sectionIndex, { kind: 'youtube', id: genId(), url: '', left: 35, top: 35, width: 28, height: 18 });
  }

  function addText(sectionIndex: number) {
    addTile(sectionIndex, { kind: 'text', id: genId(), text: 'New text', left: 35, top: 35, width: 22, height: 14 });
  }

  async function handleReplaceImage(sectionIndex: number, id: string, file: File) {
    const previewUrl = URL.createObjectURL(file);
    patchTile(sectionIndex, id, { src: previewUrl } as Partial<CollageTile>);
    const { src, aspect } = await onUpload(file);
    patchTile(sectionIndex, id, { src, aspect } as Partial<CollageTile>);
    URL.revokeObjectURL(previewUrl);
  }

  function addTack(sectionIndex: number) {
    const tack: TackPiece = {
      id: genId(),
      left: 40 + Math.random() * 20,
      top: 40 + Math.random() * 20,
      z: nextZ(collageRef.current.sections[sectionIndex]),
    };
    patchSection(sectionIndex, (s) => ({ ...s, tacks: [...s.tacks, tack] }));
    setSelected({ section: sectionIndex, kind: 'tack', id: tack.id });
  }

  function addTape(sectionIndex: number, color: string) {
    const section = collageRef.current.sections[sectionIndex];
    const width = 18;
    // Thickness is set once here, from the legacy width:height ratio at
    // this starting width — then stored and left alone forever after.
    // Resizing only ever changes `width` (length); real tape doesn't get
    // thicker the more of it you pull out.
    const widthPx = (width / 100) * section.canvasWidth;
    const height = (widthPx / TAPE_ASPECT / section.canvasHeight) * 100;
    const piece: TapePiece = {
      id: genId(),
      color,
      left: 30 + Math.random() * 20,
      top: 30 + Math.random() * 20,
      width,
      height,
      rotation: Math.random() * 16 - 8,
      torn: false,
      z: nextZ(collageRef.current.sections[sectionIndex]),
    };
    patchSection(sectionIndex, (s) => ({ ...s, tape: [...s.tape, piece] }));
    setSelected({ section: sectionIndex, kind: 'tape', id: piece.id });
  }

  const selectedSection = selected ? data.sections[selected.section] : null;
  const selectedTile = selected?.kind === 'tile' ? selectedSection?.tiles.find((t) => t.id === selected.id) : null;
  const selectedTape = selected?.kind === 'tape' ? selectedSection?.tape.find((t) => t.id === selected.id) : null;
  const selectedTack = selected?.kind === 'tack' ? selectedSection?.tacks.find((t) => t.id === selected.id) : null;

  const stackControls = selected && (
    <div className="studio__field" style={{ display: 'flex', gap: '0.5rem' }}>
      <button className="studio__btn" onClick={bringForward}>
        Bring forward
      </button>
      <button className="studio__btn" onClick={sendBackward}>
        Send backward
      </button>
    </div>
  );

  const selectedLocked = selectedTile?.locked || selectedTape?.locked || selectedTack?.locked || false;

  function toggleLocked() {
    if (!selected) return;
    const locked = !selectedLocked;
    if (selected.kind === 'tile') patchTile(selected.section, selected.id, { locked } as Partial<CollageTile>);
    else if (selected.kind === 'tape') patchTape(selected.section, selected.id, { locked });
    else patchTack(selected.section, selected.id, { locked });
  }

  // Centers the selected tile within its own section's canvas — a plain
  // midpoint of the free space on that axis, not a snap to anything else.
  function centerTile(axis: 'left' | 'top') {
    if (!selected || selected.kind !== 'tile' || !selectedTile) return;
    const size = axis === 'left' ? selectedTile.width : selectedTile.height;
    patchTile(selected.section, selectedTile.id, { [axis]: (100 - size) / 2 } as Partial<CollageTile>);
  }

  const alignControls = selected?.kind === 'tile' && (
    <div className="studio__field" style={{ display: 'flex', gap: '0.5rem' }}>
      <button className="studio__btn" onClick={() => centerTile('left')}>
        Center horizontally
      </button>
      <button className="studio__btn" onClick={() => centerTile('top')}>
        Center vertically
      </button>
    </div>
  );

  // Shown for every selected kind — locking is what keeps Shuffle Images
  // from replacing a photo and Shuffle Layout from moving/resizing
  // anything, so it belongs next to every item type, not just images.
  const lockControl = selected && (
    <div className="studio__field">
      <label className="studio__lock-toggle">
        <input type="checkbox" checked={selectedLocked} onChange={toggleLocked} />
        Locked — Shuffle Images/Layout won't touch this
      </label>
    </div>
  );

  function framingControls(tile: CollageTile) {
    return (
      <>
        <label style={{ fontSize: '0.72rem', color: '#666', display: 'block', marginTop: '0.4rem', marginBottom: tile.border ? '0.3rem' : '0.6rem' }}>
          <input
            type="checkbox"
            checked={tile.border ?? false}
            onChange={(e) => patchTile(selected!.section, tile.id, { border: e.target.checked || undefined } as Partial<CollageTile>)}
          />{' '}
          Thin black border
        </label>
        {tile.border && (
          <label style={{ fontSize: '0.7rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem', marginLeft: '1.3rem' }}>
            Thickness (px)
            <input
              type="number"
              min={1}
              max={10}
              style={{ width: '4rem', padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 4 }}
              value={tile.borderWidth ?? 2}
              onChange={(e) => patchTile(selected!.section, tile.id, { borderWidth: parseInt(e.target.value, 10) || 2 } as Partial<CollageTile>)}
            />
          </label>
        )}
        <label style={{ fontSize: '0.72rem', color: '#666', display: 'block', marginBottom: tile.mat ? '0.3rem' : '0.6rem' }}>
          <input
            type="checkbox"
            checked={tile.mat ?? false}
            onChange={(e) => patchTile(selected!.section, tile.id, { mat: e.target.checked || undefined } as Partial<CollageTile>)}
          />{' '}
          White mat/padding
        </label>
        {tile.mat && (
          <label style={{ fontSize: '0.7rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem', marginLeft: '1.3rem' }}>
            Thickness (px)
            <input
              type="number"
              min={2}
              max={60}
              style={{ width: '4rem', padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 4 }}
              value={tile.matPadding ?? 14}
              onChange={(e) => patchTile(selected!.section, tile.id, { matPadding: parseInt(e.target.value, 10) || 14 } as Partial<CollageTile>)}
            />
          </label>
        )}
      </>
    );
  }

  // Only for images — "link to a URL" and "open full-screen" are
  // mutually exclusive ways of handling a click, so picking one clears
  // the other rather than leaving a stale, unused value behind.
  function lightboxControl(tile: CollageTile & { kind: 'image' }) {
    return (
      <label style={{ fontSize: '0.72rem', color: '#666', display: 'block', marginBottom: '0.6rem' }}>
        <input
          type="checkbox"
          checked={tile.lightbox ?? false}
          onChange={(e) =>
            patchTile(selected!.section, tile.id, {
              lightbox: e.target.checked || undefined,
              href: e.target.checked ? undefined : tile.href,
            } as Partial<CollageTile>)
          }
        />{' '}
        Clicking opens this image full-screen (instead of a link)
      </label>
    );
  }

  const entryTemplates = [...TEMPLATES, ...customTemplates].filter((t) => t.contexts.includes('entry'));

  function startSaveTemplate(sectionIndex: number) {
    setSavingTemplateSection(sectionIndex);
    setNewTemplateName('');
  }

  function confirmSaveTemplate(sectionIndex: number) {
    if (!onSaveTemplate || !newTemplateName.trim()) return;
    const section = data.sections[sectionIndex];
    const id = `custom-${genId()}`;
    const variant = sectionToTemplateVariant(section, id);
    onSaveTemplate({
      id,
      name: newTemplateName.trim(),
      description: '',
      contexts: ['entry'],
      variants: [variant],
    });
    setSavingTemplateSection(null);
  }

  return (
    <div className="studio__body" ref={rootRef}>
      <div className="studio__main">
        {!previewMode && (
          <div className="studio__shuffle-toolbar">
            <button className="studio__btn studio__btn--primary" onClick={handleShuffleImages}>
              Shuffle Images
            </button>
            <button className="studio__btn studio__btn--primary" onClick={handleShuffleLayout}>
              Shuffle Layout
            </button>
            <select
              className="studio__shuffle-family"
              value=""
              onChange={(e) => {
                if (e.target.value) handleSwitchFamily(e.target.value);
                e.currentTarget.value = '';
              }}
            >
              <option value="">Switch to…</option>
              {entryTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="studio__spacer" />
            <button className="studio__btn" onClick={undoable.undo} disabled={!undoable.canUndo} title="Undo (Cmd+Z)">
              Undo
            </button>
            <button className="studio__btn" onClick={undoable.redo} disabled={!undoable.canRedo} title="Redo (Cmd+Shift+Z)">
              Redo
            </button>
            <label className="studio__checkerboard-toggle">
              <input type="checkbox" checked={showCheckerboard} onChange={(e) => setShowCheckerboard(e.target.checked)} />
              Checkerboard
            </label>
            <label className="studio__checkerboard-toggle">
              <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
              Snap alignment
            </label>
          </div>
        )}

        {data.sections.map((section, si) => {
          const heightPx = CANVAS_PX * (section.canvasHeight / section.canvasWidth);
          const itemCount = section.tiles.length + section.tape.length + section.tacks.length;
          const previewScale = previewMode && previewWidth === 'mobile' ? MOBILE_PREVIEW_PX / CANVAS_PX : 1;
          return (
            <div key={si} style={{ marginBottom: '2.5rem' }}>
              {!previewMode && (
              <>
              <div className="studio__section-header">
                <span>Section {si + 1}</span>
                <label className="studio__section-height">
                  Height (px)
                  <input
                    type="number"
                    step={100}
                    min={200}
                    value={section.canvasHeight}
                    onChange={(e) => resizeSectionHeight(si, parseInt(e.target.value, 10) || section.canvasHeight)}
                  />
                </label>
                <label className="studio__lock-toggle" title="Drop several images/video at full size with different stacking order to layer them.">
                  <input
                    type="checkbox"
                    checked={section.fullBleed ?? false}
                    onChange={(e) => patchSection(si, (s) => ({ ...s, fullBleed: e.target.checked || undefined }))}
                  />
                  Full bleed (edge-to-edge)
                </label>
                <div className="studio__spacer" />
                {confirmingRemoveSection === si ? (
                  <>
                    <span className="studio__status">
                      Remove this section{itemCount > 0 ? ` and its ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}?
                    </span>
                    <button className="studio__btn studio__btn--danger" onClick={() => removeSection(si)}>
                      Yes, remove
                    </button>
                    <button className="studio__btn" onClick={() => setConfirmingRemoveSection(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="studio__btn studio__btn--danger" onClick={() => setConfirmingRemoveSection(si)}>
                    Remove section
                  </button>
                )}
              </div>

              <div className="studio__collage-toolbar">
                <label className="studio__btn">
                  + Image
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      files.forEach((file) => handleUploadImage(si, file));
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="studio__btn">
                  + Video
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      files.forEach((file) => handleUploadVideo(si, file));
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <button className="studio__btn" onClick={() => addYouTube(si)}>
                  + YouTube
                </button>
                <button className="studio__btn" onClick={() => addText(si)}>
                  + Text
                </button>
                <button className="studio__btn" onClick={() => addTack(si)}>
                  + Thumbtack
                </button>
                {WASHI_COLORS.map((c) => (
                  <button
                    key={c.id}
                    className="studio__swatch-btn"
                    style={{ background: c.hex }}
                    title={`+ ${c.label} washi tape`}
                    onClick={() => addTape(si, c.hex)}
                  />
                ))}
              </div>

              {/* This section's own shuffle controls — independent of
                  every other section, and of the page-wide buttons above. */}
              <div className="studio__collage-toolbar">
                <button className="studio__btn" onClick={() => handleShuffleImagesSection(si)}>
                  Shuffle Images (this section)
                </button>
                <button className="studio__btn" onClick={() => handleShuffleLayoutSection(si)}>
                  Shuffle Layout (this section)
                </button>
                <select
                  className="studio__shuffle-family"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleSwitchFamilySection(si, e.target.value);
                    e.currentTarget.value = '';
                  }}
                >
                  <option value="">Switch to…</option>
                  {entryTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {onSaveTemplate &&
                  (savingTemplateSection === si ? (
                    <>
                      <input
                        className="studio__template-name-input"
                        placeholder="Template name…"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        autoFocus
                      />
                      <button className="studio__btn studio__btn--primary" disabled={!newTemplateName.trim()} onClick={() => confirmSaveTemplate(si)}>
                        Save
                      </button>
                      <button className="studio__btn" onClick={() => setSavingTemplateSection(null)}>
                        Cancel
                      </button>
                      {countOmittedOnSave(section) > 0 && (
                        <span className="studio__status">
                          Video/tape/thumbtacks won&rsquo;t be part of the saved template.
                        </span>
                      )}
                    </>
                  ) : (
                    <button className="studio__btn" onClick={() => startSaveTemplate(si)}>
                      Save as template…
                    </button>
                  ))}
              </div>
              </>
              )}

              <div style={{ width: CANVAS_PX * previewScale, height: heightPx * previewScale }}>
                <div
                  className={`deco-canvas${showCheckerboard ? ' deco-canvas--checkerboard' : ''}`}
                  style={{ width: CANVAS_PX, height: heightPx, transform: previewScale !== 1 ? `scale(${previewScale})` : undefined, transformOrigin: 'top left' }}
                >
                {section.tiles.map((tile) => {
                  const x = (tile.left / 100) * CANVAS_PX;
                  const y = (tile.top / 100) * heightPx;
                  const w = (tile.width / 100) * CANVAS_PX;
                  const h = (tile.height / 100) * heightPx;
                  const isSelected = !previewMode && selected?.section === si && selected.kind === 'tile' && selected.id === tile.id;
                  if (previewMode && tile.kind === 'text' && !tile.text.trim()) return null;
                  return (
                    <Rnd
                      key={tile.id}
                      size={{ width: w, height: h }}
                      position={{ x, y }}
                      bounds="parent"
                      disableDragging={previewMode || tile.locked}
                      enableResizing={!previewMode && !tile.locked}
                      style={{ zIndex: itemZ('tile', tile) }}
                      onDragStart={() => setSelected({ section: si, kind: 'tile', id: tile.id })}
                      onDragStop={(_e, d) => {
                        const snapped = snapTilePosition(si, tile.id, d.x, d.y, w, h, heightPx);
                        patchTile(si, tile.id, { left: (snapped.x / CANVAS_PX) * 100, top: (snapped.y / heightPx) * 100 });
                      }}
                      onResizeStop={(_e, _dir, ref, _delta, pos) => {
                        const rw = parseFloat(ref.style.width);
                        const rh = parseFloat(ref.style.height);
                        const snapped = snapTilePosition(si, tile.id, pos.x, pos.y, rw, rh, heightPx);
                        patchTile(si, tile.id, {
                          width: (rw / CANVAS_PX) * 100,
                          height: (rh / heightPx) * 100,
                          left: (snapped.x / CANVAS_PX) * 100,
                          top: (snapped.y / heightPx) * 100,
                        });
                      }}
                    >
                      <div
                        className={`deco-tile${isSelected ? ' deco-tile--selected' : ''}${tile.border ? ' deco-tile--bordered' : ''}${tile.mat ? ' deco-tile--matted' : ''}${tile.locked ? ' studio__item--locked' : ''}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          padding: tile.mat ? `${tile.matPadding ?? 14}px` : undefined,
                          borderWidth: tile.border ? `${tile.borderWidth ?? 2}px` : undefined,
                        }}
                        onMouseDown={() => setSelected({ section: si, kind: 'tile', id: tile.id })}
                      >
                        {tile.kind === 'image' && (
                          <img
                            src={midSrc(tile.src)}
                            alt={tile.alt ?? ''}
                            draggable={false}
                            style={{ objectPosition: `${tile.focalX ?? 50}% ${tile.focalY ?? 50}%` }}
                          />
                        )}
                        {tile.kind === 'video' && <video src={tile.src} muted loop autoPlay playsInline />}
                        {tile.kind === 'youtube' &&
                          (tile.url ? (
                            <iframe src={`https://www.youtube-nocookie.com/embed/${youtubeEmbedId(tile.url)}`} title="YouTube video" />
                          ) : (
                            <div className="studio__tile-placeholder">Select to add a YouTube URL</div>
                          ))}
                        {tile.kind === 'text' && (
                          <div
                            className={`deco-tile__text${!tile.text ? ' deco-tile__text--empty' : ''}${tile.textSize && tile.textSize !== 'body' ? ` deco-tile__text--${tile.textSize}` : ''}${tile.uppercase ? ' deco-tile__text--uppercase' : ''}`}
                          >
                            {tile.text}
                          </div>
                        )}
                        {tile.locked && !previewMode && <span className="studio__lock-badge" title="Locked">🔒</span>}
                      </div>
                    </Rnd>
                  );
                })}

                {section.tape.map((piece) => {
                  const x = (piece.left / 100) * CANVAS_PX;
                  const y = (piece.top / 100) * heightPx;
                  const w = (piece.width / 100) * CANVAS_PX;
                  const h = (tapeHeightPercent(piece, section.canvasWidth, section.canvasHeight) / 100) * heightPx;
                  const isSelected = !previewMode && selected?.section === si && selected.kind === 'tape' && selected.id === piece.id;
                  return (
                    <Rnd
                      key={piece.id}
                      size={{ width: w, height: h }}
                      position={{ x, y }}
                      bounds="parent"
                      disableDragging={previewMode || piece.locked}
                      // Horizontal handles only — real tape has a fixed
                      // thickness, so stretching it only makes it longer.
                      // A locked piece gets no handles at all.
                      enableResizing={
                        previewMode || piece.locked
                          ? false
                          : {
                              left: true,
                              right: true,
                              top: false,
                              bottom: false,
                              topLeft: false,
                              topRight: false,
                              bottomLeft: false,
                              bottomRight: false,
                            }
                      }
                      style={{ zIndex: itemZ('tape', piece) }}
                      onDragStart={() => setSelected({ section: si, kind: 'tape', id: piece.id })}
                      onDragStop={(_e, d) =>
                        patchTape(si, piece.id, { left: (d.x / CANVAS_PX) * 100, top: (d.y / heightPx) * 100 })
                      }
                      onResizeStop={(_e, _dir, ref, _delta, pos) =>
                        patchTape(si, piece.id, {
                          width: (parseFloat(ref.style.width) / CANVAS_PX) * 100,
                          left: (pos.x / CANVAS_PX) * 100,
                          top: (pos.y / heightPx) * 100,
                        })
                      }
                    >
                      <div
                        className={`deco-tape${piece.locked ? ' studio__item--locked' : ''}`}
                        style={{
                          width: '100%',
                          aspectRatio: 'auto',
                          height: '100%',
                          ['--tape-color' as any]: piece.color,
                          transform: `rotate(${piece.rotation}deg)`,
                          clipPath: tapeClipPath(piece.torn, piece.tornSeed),
                          outline: isSelected ? '2px solid #2456d6' : 'none',
                        }}
                        onMouseDown={() => setSelected({ section: si, kind: 'tape', id: piece.id })}
                      />
                    </Rnd>
                  );
                })}

                {section.tacks.map((tack) => {
                  const size = 0.035 * CANVAS_PX;
                  const x = (tack.left / 100) * CANVAS_PX;
                  const y = (tack.top / 100) * heightPx;
                  const isSelected = !previewMode && selected?.section === si && selected.kind === 'tack' && selected.id === tack.id;
                  return (
                    <Rnd
                      key={tack.id}
                      size={{ width: size, height: size }}
                      position={{ x, y }}
                      bounds="parent"
                      disableDragging={previewMode || tack.locked}
                      enableResizing={false}
                      style={{ zIndex: itemZ('tack', tack) }}
                      onDragStart={() => setSelected({ section: si, kind: 'tack', id: tack.id })}
                      onDragStop={(_e, d) =>
                        patchTack(si, tack.id, { left: (d.x / CANVAS_PX) * 100, top: (d.y / heightPx) * 100 })
                      }
                    >
                      <img
                        src="/decorations/tack-silver.png"
                        draggable={false}
                        className={tack.locked ? 'studio__item--locked' : undefined}
                        style={{
                          width: '100%',
                          height: '100%',
                          filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.2))',
                          outline: isSelected ? '2px solid #2456d6' : 'none',
                          borderRadius: '50%',
                        }}
                        onMouseDown={() => setSelected({ section: si, kind: 'tack', id: tack.id })}
                      />
                    </Rnd>
                  );
                })}
                </div>
              </div>

              {!previewMode && (
              <div style={{ marginTop: '0.75rem' }}>
                <button className="studio__btn" onClick={() => resizeSectionHeight(si, section.canvasHeight + 300)}>
                  Make longer
                </button>
              </div>
              )}
            </div>
          );
        })}

        {!previewMode && (
        <button className="studio__btn studio__btn--primary" onClick={addSection}>
          + Add section
        </button>
        )}
      </div>

      {!previewMode && (
      <div className="studio__sidebar">
        {selectedTile && selectedTile.kind === 'image' && (
          <>
            <h3>Image</h3>
            <FocalPointPicker
              src={selectedTile.src}
              focalX={selectedTile.focalX}
              focalY={selectedTile.focalY}
              onChange={(focalX, focalY) => patchTile(selected!.section, selectedTile.id, { focalX, focalY } as Partial<CollageTile>)}
            />
            <div className="studio__field">
              <label>Replace with a new upload</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleReplaceImage(selected!.section, selectedTile.id, file);
                  e.currentTarget.value = '';
                }}
              />
            </div>
            {lightboxControl(selectedTile)}
            <div className="studio__field">
              <label>Link (optional) — a URL, or e.g. /entries/some-page</label>
              <input
                disabled={selectedTile.lightbox}
                value={selectedTile.href ?? ''}
                onChange={(e) => patchTile(selected!.section, selectedTile.id, { href: e.target.value || undefined } as Partial<CollageTile>)}
              />
            </div>
            {framingControls(selectedTile)}
            {alignControls}
            {lockControl}
            {stackControls}
            <button className="studio__btn studio__btn--danger" onClick={removeSelected}>
              Remove from page
            </button>
          </>
        )}

        {selectedTile && selectedTile.kind === 'video' && (
          <>
            <h3>Video</h3>
            <video className="studio__thumb" src={selectedTile.src} controls style={{ background: '#000' }} />
            <div className="studio__field">
              <label>Replace with a new upload</label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleReplaceImage(selected!.section, selectedTile.id, file);
                  e.currentTarget.value = '';
                }}
              />
            </div>
            <div className="studio__field">
              <label>Link (optional)</label>
              <input
                value={selectedTile.href ?? ''}
                onChange={(e) => patchTile(selected!.section, selectedTile.id, { href: e.target.value || undefined } as Partial<CollageTile>)}
              />
            </div>
            {framingControls(selectedTile)}
            {alignControls}
            {lockControl}
            {stackControls}
            <button className="studio__btn studio__btn--danger" onClick={removeSelected}>
              Remove from page
            </button>
          </>
        )}

        {selectedTile && selectedTile.kind === 'youtube' && (
          <>
            <h3>YouTube</h3>
            <div className="studio__field">
              <label>YouTube URL</label>
              <input
                placeholder="youtube.com/watch?v=… or youtu.be/…"
                value={selectedTile.url}
                onChange={(e) => patchTile(selected!.section, selectedTile.id, { url: e.target.value } as Partial<CollageTile>)}
              />
            </div>
            {alignControls}
            {lockControl}
            {stackControls}
            <button className="studio__btn studio__btn--danger" onClick={removeSelected}>
              Remove from page
            </button>
          </>
        )}

        {selectedTile && selectedTile.kind === 'text' && (
          <>
            <h3>Text</h3>
            <div className="studio__field">
              <label>Content</label>
              <textarea
                rows={6}
                value={selectedTile.text}
                onChange={(e) => patchTile(selected!.section, selectedTile.id, { text: e.target.value } as Partial<CollageTile>)}
              />
            </div>
            <div className="studio__field" style={{ maxWidth: 160 }}>
              <label>Size</label>
              <select
                value={selectedTile.textSize ?? 'body'}
                onChange={(e) =>
                  patchTile(selected!.section, selectedTile.id, { textSize: e.target.value as TextSize } as Partial<CollageTile>)
                }
              >
                <option value="small">Small</option>
                <option value="body">Body</option>
                <option value="large">Large</option>
                <option value="headline">Headline</option>
              </select>
            </div>
            <label style={{ fontSize: '0.72rem', color: '#666', display: 'block', marginBottom: '0.6rem' }}>
              <input
                type="checkbox"
                checked={selectedTile.uppercase ?? false}
                onChange={(e) =>
                  patchTile(selected!.section, selectedTile.id, { uppercase: e.target.checked || undefined } as Partial<CollageTile>)
                }
              />{' '}
              ALL CAPS (adds headline-friendly letter-spacing)
            </label>
            <div className="studio__field">
              <label>Link (optional)</label>
              <input
                value={selectedTile.href ?? ''}
                onChange={(e) => patchTile(selected!.section, selectedTile.id, { href: e.target.value || undefined } as Partial<CollageTile>)}
              />
            </div>
            {alignControls}
            {lockControl}
            {stackControls}
            <button className="studio__btn studio__btn--danger" onClick={removeSelected}>
              Remove from page
            </button>
          </>
        )}

        {selectedTape && (
          <>
            <h3>Washi tape</h3>
            <div className="studio__field">
              <label>Color</label>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: selectedTape.color,
                  boxShadow: '0 0 0 1px #ccc',
                }}
              />
            </div>
            <div className="studio__field">
              <label>Rotation (deg)</label>
              <input
                type="number"
                value={Math.round(selectedTape.rotation)}
                onChange={(e) => patchTape(selected!.section, selectedTape.id, { rotation: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="studio__field">
              <label>
                <input
                  type="checkbox"
                  checked={selectedTape.torn}
                  onChange={(e) =>
                    patchTape(selected!.section, selectedTape.id, {
                      torn: e.target.checked,
                      tornSeed: e.target.checked ? Math.floor(Math.random() * 1e9) : selectedTape.tornSeed,
                    })
                  }
                />{' '}
                Torn edge (unchecked = straight cut)
              </label>
            </div>
            {selectedTape.torn && (
              <button
                className="studio__btn"
                onClick={() => patchTape(selected!.section, selectedTape.id, { tornSeed: Math.floor(Math.random() * 1e9) })}
              >
                Reroll tear
              </button>
            )}
            {lockControl}
            {stackControls}
            <button className="studio__btn studio__btn--danger" style={{ marginTop: '0.75rem' }} onClick={removeSelected}>
              Remove
            </button>
          </>
        )}

        {selectedTack && (
          <>
            <h3>Thumbtack</h3>
            {lockControl}
            {stackControls}
            <button className="studio__btn studio__btn--danger" onClick={removeSelected}>
              Remove
            </button>
          </>
        )}

        {!selectedTile && !selectedTape && !selectedTack && (
          <div className="studio__empty">Click an item to edit it, or add one above.</div>
        )}
      </div>
      )}
    </div>
  );
}
