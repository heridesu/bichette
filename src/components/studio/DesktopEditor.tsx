import { useState } from 'react';
import { Rnd } from 'react-rnd';
import type { DesktopSection, DesktopTile, EntryInfo, LinkSpec } from './types';
import LinkEditor from './LinkEditor';
import { midSrc, thumbSrc } from '../../lib/images';

const CANVAS_PX = 860;

interface Selected {
  section: number;
  tile: number;
}

interface Props {
  sections: DesktopSection[];
  entriesMap: Record<string, EntryInfo>;
  entriesList: EntryInfo[];
  collections: string[];
  onChange: (sections: DesktopSection[]) => void;
  onUpload: (file: File) => Promise<EntryInfo>;
}

export default function DesktopEditor({ sections, entriesMap, entriesList, collections, onChange, onUpload }: Props) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [pendingAdd, setPendingAdd] = useState<Record<number, string>>({});

  function patchTile(sectionIndex: number, tileIndex: number, patch: Partial<DesktopTile>) {
    const current = sections[sectionIndex].tiles[tileIndex];
    // react-rnd fires a resize/drag-stop event on mount and on a plain
    // click (zero movement) as well as on a real drag — ignore anything
    // that isn't an actual change so selecting a tile never counts as an
    // edit, and settling-in on load never does either.
    const EPSILON = 0.05;
    const numericKeys: (keyof DesktopTile)[] = ['left', 'top', 'width', 'height'];
    const changed = numericKeys.some((key) => {
      if (!(key in patch)) return false;
      const a = patch[key] as number | undefined;
      const b = current[key] as number | undefined;
      return a !== undefined && b !== undefined && Math.abs(a - b) > EPSILON;
    });
    const nonNumericChanged = Object.keys(patch).some((key) => !numericKeys.includes(key as keyof DesktopTile) && (patch as any)[key] !== (current as any)[key]);
    if (!changed && !nonNumericChanged) return;

    const next = sections.map((s, si) =>
      si !== sectionIndex ? s : { ...s, tiles: s.tiles.map((t, ti) => (ti !== tileIndex ? t : { ...t, ...patch })) },
    );
    onChange(next);
  }

  function removeTile(sectionIndex: number, tileIndex: number) {
    const next = sections.map((s, si) => (si !== sectionIndex ? s : { ...s, tiles: s.tiles.filter((_, ti) => ti !== tileIndex) }));
    onChange(next);
    setSelected(null);
  }

  function addTile(sectionIndex: number, slug: string) {
    const newIndex = sections[sectionIndex].tiles.length;
    const tile: DesktopTile = { slug, left: 35, top: 35, width: 25, height: 20, link: { type: 'entry' } };
    const next = sections.map((s, si) => (si !== sectionIndex ? s : { ...s, tiles: [...s.tiles, tile] }));
    onChange(next);
    setSelected({ section: sectionIndex, tile: newIndex });
  }

  async function handleUploadNew(sectionIndex: number, file: File) {
    const entry = await onUpload(file);
    addTile(sectionIndex, entry.slug);
  }

  async function handleUploadReplace(sectionIndex: number, tileIndex: number, file: File) {
    const entry = await onUpload(file);
    patchTile(sectionIndex, tileIndex, { slug: entry.slug });
  }

  function addSection() {
    const newSection: DesktopSection = { canvasWidth: 1440, canvasHeight: 900, tiles: [] };
    onChange([...sections, newSection]);
  }

  function removeSection(sectionIndex: number) {
    if (sections[sectionIndex].tiles.length > 0) return;
    onChange(sections.filter((_, i) => i !== sectionIndex));
    if (selected?.section === sectionIndex) setSelected(null);
  }

  const selectedTile = selected ? sections[selected.section].tiles[selected.tile] : null;
  const selectedEntry = selectedTile ? entriesMap[selectedTile.slug] : null;

  return (
    <div className="studio__body">
      <div className="studio__main">
        {sections.map((section, sectionIndex) => {
          const heightPx = CANVAS_PX * (section.canvasHeight / section.canvasWidth);
          return (
            <div key={sectionIndex}>
              <div className="studio__section-header">
                <span>
                  Section {sectionIndex + 1} — {section.canvasWidth}×{section.canvasHeight}
                </span>
                <label className="studio__btn">
                  + Upload image
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadNew(sectionIndex, file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <select
                  value={pendingAdd[sectionIndex] ?? ''}
                  onChange={(e) => {
                    const slug = e.target.value;
                    if (slug) {
                      addTile(sectionIndex, slug);
                      setPendingAdd((p) => ({ ...p, [sectionIndex]: '' }));
                    }
                  }}
                >
                  <option value="">+ Add existing…</option>
                  {entriesList.map((en) => (
                    <option key={en.slug} value={en.slug}>
                      {en.title ?? en.slug}
                    </option>
                  ))}
                </select>
                <div className="studio__spacer" />
                <button
                  className="studio__btn studio__btn--danger"
                  disabled={section.tiles.length > 0}
                  title={section.tiles.length > 0 ? 'Remove every image from this section first' : 'Remove this section'}
                  onClick={() => removeSection(sectionIndex)}
                >
                  Remove section
                </button>
              </div>

              <div className="studio__canvas" style={{ width: CANVAS_PX, height: heightPx }}>
                {section.tiles.map((tile, tileIndex) => {
                  const entry = entriesMap[tile.slug];
                  const isSelected = selected?.section === sectionIndex && selected?.tile === tileIndex;
                  const x = (tile.left / 100) * CANVAS_PX;
                  const y = (tile.top / 100) * heightPx;
                  const w = (tile.width / 100) * CANVAS_PX;
                  const h = (tile.height / 100) * heightPx;
                  return (
                    <Rnd
                      key={tileIndex}
                      size={{ width: w, height: h }}
                      position={{ x, y }}
                      bounds="parent"
                      style={{ zIndex: tile.z ?? 1 }}
                      onDragStart={() => setSelected({ section: sectionIndex, tile: tileIndex })}
                      onDragStop={(_e, d) => {
                        patchTile(sectionIndex, tileIndex, {
                          left: (d.x / CANVAS_PX) * 100,
                          top: (d.y / heightPx) * 100,
                        });
                      }}
                      onResizeStop={(_e, _dir, ref, _delta, pos) => {
                        patchTile(sectionIndex, tileIndex, {
                          width: (parseFloat(ref.style.width) / CANVAS_PX) * 100,
                          height: (parseFloat(ref.style.height) / heightPx) * 100,
                          left: (pos.x / CANVAS_PX) * 100,
                          top: (pos.y / heightPx) * 100,
                        });
                      }}
                    >
                      <div
                        className={`studio__tile${isSelected ? ' studio__tile--selected' : ''}${
                          tile.link.type === 'none' ? ' studio__tile--unlinked' : ''
                        }`}
                        style={{ width: '100%', height: '100%', position: 'relative' }}
                        onMouseDown={() => setSelected({ section: sectionIndex, tile: tileIndex })}
                      >
                        {entry?.image ? (
                          <img src={midSrc(entry.image)} alt="" draggable={false} />
                        ) : (
                          <div className="studio__tile-placeholder">
                            {entry ? `${entry.title ?? entry.slug} — no image` : `missing: ${tile.slug}`}
                          </div>
                        )}
                      </div>
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
        {selectedTile && selectedEntry ? (
          <>
            <h3>Selected image</h3>
            <img className="studio__thumb" src={thumbSrc(selectedEntry.image)} alt="" />

            <div className="studio__field">
              <label>Swap to existing entry</label>
              <select
                value={selectedTile.slug}
                onChange={(e) => selected && patchTile(selected.section, selected.tile, { slug: e.target.value })}
              >
                {entriesList.map((en) => (
                  <option key={en.slug} value={en.slug}>
                    {en.title ?? en.slug}
                  </option>
                ))}
              </select>
            </div>

            <div className="studio__field">
              <label>Or replace with a new upload</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && selected) handleUploadReplace(selected.section, selected.tile, file);
                  e.currentTarget.value = '';
                }}
              />
            </div>

            <LinkEditor
              value={selectedTile.link}
              collections={collections}
              onChange={(link: LinkSpec) => selected && patchTile(selected.section, selected.tile, { link })}
            />

            <div className="studio__grid2">
              <div className="studio__field">
                <label>Left %</label>
                <input
                  type="number"
                  step="0.1"
                  value={Math.round(selectedTile.left * 10) / 10}
                  onChange={(e) => selected && patchTile(selected.section, selected.tile, { left: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="studio__field">
                <label>Top %</label>
                <input
                  type="number"
                  step="0.1"
                  value={Math.round(selectedTile.top * 10) / 10}
                  onChange={(e) => selected && patchTile(selected.section, selected.tile, { top: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="studio__field">
                <label>Width %</label>
                <input
                  type="number"
                  step="0.1"
                  value={Math.round(selectedTile.width * 10) / 10}
                  onChange={(e) => selected && patchTile(selected.section, selected.tile, { width: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="studio__field">
                <label>Height %</label>
                <input
                  type="number"
                  step="0.1"
                  value={Math.round(selectedTile.height * 10) / 10}
                  onChange={(e) => selected && patchTile(selected.section, selected.tile, { height: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <button className="studio__btn studio__btn--danger" onClick={() => selected && removeTile(selected.section, selected.tile)}>
              Remove from homepage
            </button>
          </>
        ) : (
          <div className="studio__empty">Click an image to edit it, or add one above.</div>
        )}
      </div>
    </div>
  );
}
