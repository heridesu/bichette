import { useState } from 'react';
import type { EntryInfo, MobileItem, MobileSection } from './types';
import LinkEditor from './LinkEditor';

interface Props {
  sections: MobileSection[];
  entriesMap: Record<string, EntryInfo>;
  entriesList: EntryInfo[];
  collections: string[];
  onChange: (sections: MobileSection[]) => void;
}

export default function MobileEditor({ sections, entriesMap, entriesList, collections, onChange }: Props) {
  const [pendingAdd, setPendingAdd] = useState<Record<number, string>>({});

  function patchItem(si: number, ri: number, ii: number, patch: Partial<MobileItem>) {
    const next = sections.map((s, i) =>
      i !== si
        ? s
        : {
            ...s,
            rows: s.rows.map((row, r) => (r !== ri ? row : row.map((item, idx) => (idx !== ii ? item : { ...item, ...patch })))),
          },
    );
    onChange(next);
  }

  function removeItem(si: number, ri: number, ii: number) {
    const next = sections.map((s, i) => {
      if (i !== si) return s;
      const rows = s.rows
        .map((row, r) => (r !== ri ? row : row.filter((_, idx) => idx !== ii)))
        .filter((row) => row.length > 0);
      return { ...s, rows };
    });
    onChange(next);
  }

  function removeRow(si: number, ri: number) {
    const next = sections.map((s, i) => (i !== si ? s : { ...s, rows: s.rows.filter((_, r) => r !== ri) }));
    onChange(next);
  }

  function moveRow(si: number, ri: number, direction: -1 | 1) {
    const next = sections.map((s, i) => {
      if (i !== si) return s;
      const rows = [...s.rows];
      const target = ri + direction;
      if (target < 0 || target >= rows.length) return s;
      [rows[ri], rows[target]] = [rows[target], rows[ri]];
      return { ...s, rows };
    });
    onChange(next);
  }

  function addRow(si: number, slug: string) {
    const entry = entriesMap[slug];
    const item: MobileItem = { slug, width: 80, aspect: entry?.aspect ?? '1/1', link: { type: 'entry' } };
    const next = sections.map((s, i) => (i !== si ? s : { ...s, rows: [...s.rows, [item]] }));
    onChange(next);
  }

  function addSection() {
    onChange([...sections, { rows: [] }]);
  }

  function removeSection(si: number) {
    if (sections[si].rows.length > 0) return;
    onChange(sections.filter((_, i) => i !== si));
  }

  return (
    <div className="studio__body">
      <div className="studio__main">
        {sections.map((section, si) => (
          <div key={si} className="studio__mobile-section">
            <div className="studio__section-header" style={{ margin: 0, marginBottom: '0.5rem' }}>
              <span>Section {si + 1}</span>
              <div className="studio__spacer" />
              <button
                className="studio__btn studio__btn--danger"
                disabled={section.rows.length > 0}
                title={section.rows.length > 0 ? 'Remove every row from this section first' : 'Remove this section'}
                onClick={() => removeSection(si)}
              >
                Remove section
              </button>
            </div>

            {section.rows.map((row, ri) => (
              <div key={ri} className="studio__row">
                <div className="studio__row-controls">
                  <button className="studio__icon-btn" disabled={ri === 0} onClick={() => moveRow(si, ri, -1)} title="Move row up">
                    ↑
                  </button>
                  <button
                    className="studio__icon-btn"
                    disabled={ri === section.rows.length - 1}
                    onClick={() => moveRow(si, ri, 1)}
                    title="Move row down"
                  >
                    ↓
                  </button>
                  <button className="studio__icon-btn" onClick={() => removeRow(si, ri)} title="Remove row">
                    ✕
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                  {row.map((item, ii) => {
                    const entry = entriesMap[item.slug];
                    return (
                      <div key={ii} className="studio__row-item">
                        {entry?.image ? (
                          <img src={entry.image} alt="" />
                        ) : (
                          <div className="studio__row-item-placeholder">no image</div>
                        )}
                        <div className="studio__row-item-fields">
                          <select value={item.slug} onChange={(e) => patchItem(si, ri, ii, { slug: e.target.value })}>
                            {entriesList.map((en) => (
                              <option key={en.slug} value={en.slug}>
                                {en.title ?? en.slug}
                              </option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <input
                              type="number"
                              value={item.width}
                              title="width %"
                              onChange={(e) => patchItem(si, ri, ii, { width: parseFloat(e.target.value) || 0 })}
                              style={{ width: '4.5rem' }}
                            />
                            <select
                              value={item.align ?? 'start'}
                              onChange={(e) =>
                                patchItem(si, ri, ii, {
                                  align: e.target.value === 'start' ? undefined : (e.target.value as 'end' | 'center'),
                                })
                              }
                            >
                              <option value="start">align start</option>
                              <option value="center">align center</option>
                              <option value="end">align end</option>
                            </select>
                          </div>
                          <LinkEditor
                            compact
                            value={item.link}
                            collections={collections}
                            onChange={(link) => patchItem(si, ri, ii, { link })}
                          />
                        </div>
                        <button className="studio__icon-btn" onClick={() => removeItem(si, ri, ii)} title="Remove image">
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="studio__add-row">
              <select value={pendingAdd[si] ?? ''} onChange={(e) => setPendingAdd((p) => ({ ...p, [si]: e.target.value }))}>
                <option value="">Add image to new row…</option>
                {entriesList.map((en) => (
                  <option key={en.slug} value={en.slug}>
                    {en.title ?? en.slug}
                  </option>
                ))}
              </select>
              <button
                className="studio__btn"
                onClick={() => {
                  const slug = pendingAdd[si];
                  if (slug) {
                    addRow(si, slug);
                    setPendingAdd((p) => ({ ...p, [si]: '' }));
                  }
                }}
              >
                Add row
              </button>
            </div>
          </div>
        ))}
        <button className="studio__btn studio__btn--primary" onClick={addSection}>
          + Add section
        </button>
      </div>
    </div>
  );
}
