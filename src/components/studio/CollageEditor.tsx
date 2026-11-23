import { useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import type { CollageData, CollageSection, CollageTile, TackPiece, TapePiece } from './types';
import { TAPE_ASPECT, WASHI_COLORS, itemZ, nextZ, tapeClipPath, tapeHeightPercent, youtubeEmbedId } from '../../lib/decorations';
import { midSrc, thumbSrc } from '../../lib/images';

const CANVAS_PX = 860;
const POSITIONAL_KEYS = ['left', 'top', 'width', 'height'];

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

type Selected = { section: number; kind: 'tile' | 'tape' | 'tack'; id: string } | null;

interface Props {
  collage: CollageData;
  onChange: (collage: CollageData) => void;
  onUpload: (file: File) => Promise<{ src: string; aspect?: string; kind: 'image' | 'video' }>;
}

export default function CollageEditor({ collage, onChange, onUpload }: Props) {
  const [selected, setSelected] = useState<Selected>(null);
  // Which section (if any) is showing its "remove this and everything in
  // it?" prompt — removing a section is a single click when it's already
  // empty, but anything with real content needs this one extra step
  // first, same as the page-level "Delete page" confirmation below.
  const [confirmingRemoveSection, setConfirmingRemoveSection] = useState<number | null>(null);

  // Several flows (upload-then-patch, bring-forward-then-...) call
  // onChange and then, after an `await`, need to read the result of that
  // very update — but `collage` is a prop, frozen at whatever it was
  // when this render's closures were created, so a second read of it
  // after an await is stale (the update from the first call never shows
  // up in this closure). A ref that's reassigned every render always
  // points at the latest value, sidestepping that entirely.
  const collageRef = useRef(collage);
  collageRef.current = collage;

  function patchSection(sectionIndex: number, updater: (section: CollageSection) => CollageSection) {
    const current = collageRef.current;
    onChange({ ...current, sections: current.sections.map((s, i) => (i === sectionIndex ? updater(s) : s)) });
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
    const current = collageRef.current;
    const section: CollageSection = { canvasWidth: 1440, canvasHeight: 900, tiles: [], tape: [], tacks: [] };
    onChange({ ...current, sections: [...current.sections, section] });
  }

  function removeSection(sectionIndex: number) {
    const current = collageRef.current;
    onChange({ ...current, sections: current.sections.filter((_, i) => i !== sectionIndex) });
    if (selected?.section === sectionIndex) setSelected(null);
    setConfirmingRemoveSection(null);
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

  function addTile(sectionIndex: number, tile: CollageTile) {
    patchSection(sectionIndex, (s) => ({ ...s, tiles: [...s.tiles, tile] }));
    setSelected({ section: sectionIndex, kind: 'tile', id: tile.id });
  }

  async function handleUploadImage(sectionIndex: number, file: File) {
    // Shows the picked file immediately via a local blob URL, before the
    // upload round-trip even starts, then swaps to the real saved path
    // once it resolves — so there's never a gap with no preview at all.
    const previewUrl = URL.createObjectURL(file);
    const id = genId();
    addTile(sectionIndex, { kind: 'image', id, src: previewUrl, left: 35, top: 35, width: 25, height: 20, z: nextZ(collageRef.current.sections[sectionIndex]) });
    const { src, aspect } = await onUpload(file);
    patchTile(sectionIndex, id, { src, aspect } as Partial<CollageTile>);
    URL.revokeObjectURL(previewUrl);
  }

  async function handleUploadVideo(sectionIndex: number, file: File) {
    const previewUrl = URL.createObjectURL(file);
    const id = genId();
    addTile(sectionIndex, { kind: 'video', id, src: previewUrl, left: 35, top: 35, width: 25, height: 20, z: nextZ(collageRef.current.sections[sectionIndex]) });
    const { src, aspect } = await onUpload(file);
    patchTile(sectionIndex, id, { src, aspect } as Partial<CollageTile>);
    URL.revokeObjectURL(previewUrl);
  }

  function addYouTube(sectionIndex: number) {
    addTile(sectionIndex, {
      kind: 'youtube',
      id: genId(),
      url: '',
      left: 35,
      top: 35,
      width: 28,
      height: 18,
      z: nextZ(collageRef.current.sections[sectionIndex]),
    });
  }

  function addText(sectionIndex: number) {
    addTile(sectionIndex, {
      kind: 'text',
      id: genId(),
      text: 'New text',
      left: 35,
      top: 35,
      width: 22,
      height: 14,
      z: nextZ(collageRef.current.sections[sectionIndex]),
    });
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
    const section = collage.sections[sectionIndex];
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

  const selectedSection = selected ? collage.sections[selected.section] : null;
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

  function framingControls(tile: CollageTile) {
    return (
      <>
        <label style={{ fontSize: '0.72rem', color: '#666', display: 'block', marginTop: '0.4rem' }}>
          <input
            type="checkbox"
            checked={tile.border ?? false}
            onChange={(e) => patchTile(selected!.section, tile.id, { border: e.target.checked || undefined } as Partial<CollageTile>)}
          />{' '}
          Thin black border
        </label>
        <label style={{ fontSize: '0.72rem', color: '#666', display: 'block', marginBottom: '0.6rem' }}>
          <input
            type="checkbox"
            checked={tile.mat ?? false}
            onChange={(e) => patchTile(selected!.section, tile.id, { mat: e.target.checked || undefined } as Partial<CollageTile>)}
          />{' '}
          White mat/padding
        </label>
      </>
    );
  }

  return (
    <div className="studio__body">
      <div className="studio__main">
        {collage.sections.map((section, si) => {
          const heightPx = CANVAS_PX * (section.canvasHeight / section.canvasWidth);
          const itemCount = section.tiles.length + section.tape.length + section.tacks.length;
          return (
            <div key={si} style={{ marginBottom: '2.5rem' }}>
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
                <button className="studio__btn" onClick={() => resizeSectionHeight(si, section.canvasHeight + 300)}>
                  Make longer
                </button>
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
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(si, file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="studio__btn">
                  + Video
                  <input
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadVideo(si, file);
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

              <div className="deco-canvas" style={{ width: CANVAS_PX, height: heightPx }}>
                {section.tiles.map((tile) => {
                  const x = (tile.left / 100) * CANVAS_PX;
                  const y = (tile.top / 100) * heightPx;
                  const w = (tile.width / 100) * CANVAS_PX;
                  const h = (tile.height / 100) * heightPx;
                  const isSelected = selected?.section === si && selected.kind === 'tile' && selected.id === tile.id;
                  return (
                    <Rnd
                      key={tile.id}
                      size={{ width: w, height: h }}
                      position={{ x, y }}
                      bounds="parent"
                      style={{ zIndex: itemZ('tile', tile) }}
                      onDragStart={() => setSelected({ section: si, kind: 'tile', id: tile.id })}
                      onDragStop={(_e, d) =>
                        patchTile(si, tile.id, { left: (d.x / CANVAS_PX) * 100, top: (d.y / heightPx) * 100 })
                      }
                      onResizeStop={(_e, _dir, ref, _delta, pos) =>
                        patchTile(si, tile.id, {
                          width: (parseFloat(ref.style.width) / CANVAS_PX) * 100,
                          height: (parseFloat(ref.style.height) / heightPx) * 100,
                          left: (pos.x / CANVAS_PX) * 100,
                          top: (pos.y / heightPx) * 100,
                        })
                      }
                    >
                      <div
                        className={`deco-tile${isSelected ? ' deco-tile--selected' : ''}${tile.border ? ' deco-tile--bordered' : ''}${tile.mat ? ' deco-tile--matted' : ''}`}
                        style={{ width: '100%', height: '100%' }}
                        onMouseDown={() => setSelected({ section: si, kind: 'tile', id: tile.id })}
                      >
                        {tile.kind === 'image' && <img src={midSrc(tile.src)} alt={tile.alt ?? ''} draggable={false} />}
                        {tile.kind === 'video' && <video src={tile.src} muted loop autoPlay playsInline />}
                        {tile.kind === 'youtube' &&
                          (tile.url ? (
                            <iframe src={`https://www.youtube-nocookie.com/embed/${youtubeEmbedId(tile.url)}`} title="YouTube video" />
                          ) : (
                            <div className="studio__tile-placeholder">Select to add a YouTube URL</div>
                          ))}
                        {tile.kind === 'text' && <div className="deco-tile__text">{tile.text}</div>}
                      </div>
                    </Rnd>
                  );
                })}

                {section.tape.map((piece) => {
                  const x = (piece.left / 100) * CANVAS_PX;
                  const y = (piece.top / 100) * heightPx;
                  const w = (piece.width / 100) * CANVAS_PX;
                  const h = (tapeHeightPercent(piece, section.canvasWidth, section.canvasHeight) / 100) * heightPx;
                  const isSelected = selected?.section === si && selected.kind === 'tape' && selected.id === piece.id;
                  return (
                    <Rnd
                      key={piece.id}
                      size={{ width: w, height: h }}
                      position={{ x, y }}
                      bounds="parent"
                      // Horizontal handles only — real tape has a fixed
                      // thickness, so stretching it only makes it longer.
                      enableResizing={{
                        left: true,
                        right: true,
                        top: false,
                        bottom: false,
                        topLeft: false,
                        topRight: false,
                        bottomLeft: false,
                        bottomRight: false,
                      }}
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
                        className="deco-tape"
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
                  const isSelected = selected?.section === si && selected.kind === 'tack' && selected.id === tack.id;
                  return (
                    <Rnd
                      key={tack.id}
                      size={{ width: size, height: size }}
                      position={{ x, y }}
                      bounds="parent"
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
          );
        })}

        <button className="studio__btn studio__btn--primary" onClick={addSection}>
          + Add section
        </button>
      </div>

      <div className="studio__sidebar">
        {selectedTile && selectedTile.kind === 'image' && (
          <>
            <h3>Image</h3>
            <img className="studio__thumb" src={thumbSrc(selectedTile.src)} alt="" />
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
            <div className="studio__field">
              <label>Link (optional) — a URL, or e.g. /entries/some-page</label>
              <input
                value={selectedTile.href ?? ''}
                onChange={(e) => patchTile(selected!.section, selectedTile.id, { href: e.target.value || undefined } as Partial<CollageTile>)}
              />
            </div>
            {framingControls(selectedTile)}
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
            <div className="studio__field">
              <label>Link (optional)</label>
              <input
                value={selectedTile.href ?? ''}
                onChange={(e) => patchTile(selected!.section, selectedTile.id, { href: e.target.value || undefined } as Partial<CollageTile>)}
              />
            </div>
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
            {stackControls}
            <button className="studio__btn studio__btn--danger" style={{ marginTop: '0.75rem' }} onClick={removeSelected}>
              Remove
            </button>
          </>
        )}

        {selectedTack && (
          <>
            <h3>Thumbtack</h3>
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
    </div>
  );
}
