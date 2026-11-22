import { useEffect, useState } from 'react';
import type { Block, EntryType, PageData, PageSummary } from './types';

const TYPES: EntryType[] = ['photo', 'note', 'link', 'essay', 'observation', 'curiosity'];

async function uploadAsset(file: File): Promise<{ src: string; aspect?: string; kind: 'image' | 'video' }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/studio/asset-upload', { method: 'POST', body: form });
  return res.json();
}

function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function PagesEditor() {
  const [list, setList] = useState<PageSummary[]>([]);
  const [current, setCurrent] = useState<PageData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<EntryType>('note');
  const [newTitle, setNewTitle] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The slug the open page is actually saved under on disk — `current.slug`
  // becomes the editable "page URL" field, which may differ from this
  // while a rename is pending (not yet saved).
  const [originalSlug, setOriginalSlug] = useState<string | null>(null);

  function refreshList() {
    fetch('/api/studio/pages')
      .then((r) => r.json())
      .then(setList);
  }

  useEffect(() => {
    refreshList();
    // Saving, creating, renaming or deleting a page all write a file
    // under src/content/entries/, which makes Astro's dev server fully
    // reload every open tab (it can't hot-swap content collection data).
    // That wipes this component's state, so which page was open is kept
    // in sessionStorage and restored right here on the remount that
    // follows — otherwise every save would bounce you back to the list.
    try {
      const pending = sessionStorage.getItem('studio:openSlug');
      if (pending) open(pending, 5);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function rememberOpenSlug(slug: string | null) {
    try {
      if (slug) sessionStorage.setItem('studio:openSlug', slug);
      else sessionStorage.removeItem('studio:openSlug');
    } catch {
      // ignore
    }
  }

  async function open(slug: string, retriesLeft = 0): Promise<boolean> {
    const res = await fetch(`/api/studio/pages?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) {
      // A page just created (or just renamed) on disk can briefly 404
      // here while Astro's content collection cache catches up with the
      // new file — retry a few times rather than giving up on it. Each
      // attempt also tends to land after the dev-server reload above has
      // already happened, which is the other reason this needs retries.
      if (retriesLeft > 0) {
        await new Promise((r) => setTimeout(r, 200));
        return open(slug, retriesLeft - 1);
      }
      setError(`Could not open /entries/${slug}.`);
      return false;
    }
    const data = await res.json();
    setCurrent(data);
    setOriginalSlug(data.slug);
    rememberOpenSlug(data.slug);
    setDirty(false);
    setError(null);
    setCreating(false);
    setConfirmingDelete(false);
    return true;
  }

  function startCreate() {
    setCurrent(null);
    setNewType('note');
    setNewTitle('');
    setCreating(true);
  }

  async function confirmCreate() {
    const res = await fetch('/api/studio/pages', {
      method: 'POST',
      body: JSON.stringify({ type: newType, title: newTitle || undefined }),
    });
    const { slug } = await res.json();
    rememberOpenSlug(slug);
    refreshList();
    setCreating(false);
    await open(slug, 5);
  }

  function patch(fields: Partial<PageData>) {
    if (!current) return;
    setCurrent({ ...current, ...fields });
    setDirty(true);
  }

  function patchBlocks(blocks: Block[]) {
    patch({ blocks });
  }

  async function handleSave() {
    if (!current) return;
    setSaving(true);
    setError(null);
    rememberOpenSlug(current.slug);
    try {
      const res = await fetch('/api/studio/pages', {
        method: 'PUT',
        body: JSON.stringify({ ...current, originalSlug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not save.');
      }
      const result = await res.json();
      setOriginalSlug(result.slug ?? current.slug);
      rememberOpenSlug(result.slug ?? current.slug);
      if (result.slug && result.slug !== current.slug) setCurrent({ ...current, slug: result.slug });
      setDirty(false);
      refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!current || !originalSlug) return;
    const res = await fetch(`/api/studio/pages?slug=${encodeURIComponent(originalSlug)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Could not delete.');
      setConfirmingDelete(false);
      return;
    }
    setCurrent(null);
    setOriginalSlug(null);
    rememberOpenSlug(null);
    setConfirmingDelete(false);
    refreshList();
  }

  return (
    <div className="studio__body">
      <div className="studio__pages-list">
        <button className="studio__btn studio__btn--primary" style={{ width: '100%', marginBottom: '0.75rem' }} onClick={startCreate}>
          + New page
        </button>
        {list.map((p) => (
          <button
            key={p.slug}
            className={`studio__page-row${originalSlug === p.slug ? ' studio__page-row--active' : ''}`}
            onClick={() => open(p.slug)}
          >
            {p.image && <img src={p.image} alt="" />}
            <span>
              <strong>{p.title ?? p.slug}</strong>
              <small>{p.type}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="studio__main" style={{ maxWidth: 640 }}>
        {creating ? (
          <div className="studio__grid2" style={{ maxWidth: 420 }}>
            <div className="studio__field">
              <label>Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value as EntryType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="studio__field">
              <label>Title (optional)</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / 3', display: 'flex', gap: '0.5rem' }}>
              <button className="studio__btn studio__btn--primary" onClick={confirmCreate}>
                Create
              </button>
              <button className="studio__btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : !current ? (
          <div className="studio__empty">Choose a page on the left, or create a new one.</div>
        ) : (
          <>
            <div className="studio__section-header" style={{ margin: 0, marginBottom: '1rem' }}>
              <a href={`http://localhost:4321/entries/${originalSlug}`} target="_blank" rel="noopener noreferrer" className="studio__btn">
                Preview ↗
              </a>
              <div className="studio__spacer" />
              {error && <span className="studio__status" style={{ color: '#b42318' }}>{error}</span>}
              {dirty && <span className="studio__status">Unsaved changes</span>}
              {confirmingDelete ? (
                <>
                  <span className="studio__status">Delete this page permanently?</span>
                  <button className="studio__btn studio__btn--danger" onClick={handleDelete}>
                    Yes, delete
                  </button>
                  <button className="studio__btn" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="studio__btn studio__btn--danger" onClick={() => setConfirmingDelete(true)}>
                  Delete page
                </button>
              )}
              <button className="studio__btn studio__btn--primary" disabled={!dirty || saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>

            <FieldForm page={current} onChange={patch} />

            <h3 style={{ marginTop: '2rem' }}>Content</h3>
            <BlockEditor blocks={current.blocks} onChange={patchBlocks} />
          </>
        )}
      </div>
    </div>
  );
}

function FieldForm({ page, onChange }: { page: PageData; onChange: (f: Partial<PageData>) => void }) {
  async function handleImageUpload(file: File) {
    const { src, aspect } = await uploadAsset(file);
    onChange({ image: src, aspect: aspect ?? page.aspect });
  }

  return (
    <div className="studio__grid2">
      <div className="studio__field">
        <label>Type</label>
        <select value={page.type} onChange={(e) => onChange({ type: e.target.value as EntryType })}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="studio__field">
        <label>Date</label>
        <input type="date" value={page.date} onChange={(e) => onChange({ date: e.target.value })} />
      </div>
      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Title (optional)</label>
        <input value={page.title ?? ''} onChange={(e) => onChange({ title: e.target.value || undefined })} />
      </div>
      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Page URL — /entries/…</label>
        <input
          value={page.slug}
          onChange={(e) =>
            onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-') })
          }
        />
      </div>
      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Location (optional)</label>
        <input value={page.location ?? ''} onChange={(e) => onChange({ location: e.target.value || undefined })} />
      </div>
      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Caption (optional)</label>
        <input value={page.caption ?? ''} onChange={(e) => onChange({ caption: e.target.value || undefined })} />
      </div>

      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Lead image</label>
        {page.image && <img src={page.image} alt="" className="studio__thumb" style={{ marginBottom: '0.5rem' }} />}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
            e.currentTarget.value = '';
          }}
        />
        {page.image && (
          <button className="studio__btn" style={{ marginTop: '0.5rem' }} onClick={() => onChange({ image: undefined, aspect: undefined })}>
            Remove lead image
          </button>
        )}
      </div>

      {page.type === 'link' && (
        <>
          <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
            <label>URL</label>
            <input value={page.url ?? ''} onChange={(e) => onChange({ url: e.target.value || undefined })} placeholder="https://…" />
          </div>
          <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
            <label>Source (optional)</label>
            <input value={page.source ?? ''} onChange={(e) => onChange({ source: e.target.value || undefined })} />
          </div>
        </>
      )}

      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Tags (comma-separated)</label>
        <input
          value={(page.tags ?? []).join(', ')}
          onChange={(e) => onChange({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
      </div>
      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Collections (comma-separated)</label>
        <input
          value={(page.collections ?? []).join(', ')}
          onChange={(e) => onChange({ collections: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
      </div>
    </div>
  );
}

function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  function update(index: number, block: Block) {
    onChange(blocks.map((b, i) => (i === index ? block : b)));
  }
  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }
  function move(index: number, dir: -1 | 1) {
    onChange(moveItem(blocks, index, dir));
  }
  function add(block: Block) {
    onChange([...blocks, block]);
  }

  return (
    <div>
      {blocks.map((block, i) => (
        <div key={i} className="studio__block">
          <div className="studio__row-controls">
            <button className="studio__icon-btn" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button className="studio__icon-btn" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button className="studio__icon-btn" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
          <div className="studio__block-body">
            <div className="studio__block-label">{block.type}</div>
            <BlockBody block={block} onChange={(b) => update(i, b)} />
          </div>
        </div>
      ))}

      <div className="studio__add-row" style={{ flexWrap: 'wrap' }}>
        <button className="studio__btn" onClick={() => add({ type: 'paragraph', text: '' })}>
          + Paragraph
        </button>
        <button className="studio__btn" onClick={() => add({ type: 'image', src: '' })}>
          + Image
        </button>
        <button className="studio__btn" onClick={() => add({ type: 'imagegrid', cols: 2, images: [] })}>
          + Image grid
        </button>
        <button className="studio__btn" onClick={() => add({ type: 'video', src: '' })}>
          + Video
        </button>
        <button className="studio__btn" onClick={() => add({ type: 'youtube', url: '' })}>
          + YouTube
        </button>
        <button className="studio__btn" onClick={() => add({ type: 'list', ordered: false, items: [] })}>
          + List
        </button>
        <button className="studio__btn" onClick={() => add({ type: 'quote', text: '' })}>
          + Quote
        </button>
      </div>
    </div>
  );
}

function BlockBody({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  if (block.type === 'paragraph') {
    return <textarea rows={3} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />;
  }

  if (block.type === 'quote') {
    return <textarea rows={2} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />;
  }

  if (block.type === 'list') {
    return (
      <>
        <label style={{ fontSize: '0.72rem', color: '#666' }}>
          <input
            type="checkbox"
            checked={block.ordered}
            onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
          />{' '}
          numbered
        </label>
        <textarea
          rows={4}
          placeholder="One item per line"
          value={block.items.join('\n')}
          onChange={(e) => onChange({ ...block, items: e.target.value.split('\n') })}
        />
      </>
    );
  }

  if (block.type === 'raw') {
    return (
      <>
        <div style={{ fontSize: '0.72rem', color: '#b45309', marginBottom: '0.3rem' }}>
          Unrecognized content — edited as raw text, nothing lost.
        </div>
        <textarea rows={5} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      </>
    );
  }

  if (block.type === 'image') {
    return (
      <div>
        {block.src && <img src={block.src} alt="" className="studio__thumb" />}
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              const { src, aspect } = await uploadAsset(file);
              onChange({ ...block, src, aspect: aspect ?? block.aspect });
            }
            e.currentTarget.value = '';
          }}
        />
        <input placeholder="Alt text" value={block.alt ?? ''} onChange={(e) => onChange({ ...block, alt: e.target.value || undefined })} />
        <input
          placeholder="Caption (optional)"
          value={block.caption ?? ''}
          onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
        />
        <input
          placeholder="Aspect ratio, e.g. 4/5 for a vertical photo (auto-filled on upload)"
          value={block.aspect ?? ''}
          onChange={(e) => onChange({ ...block, aspect: e.target.value || undefined })}
        />
        <input
          placeholder="Link (optional) — a URL, or e.g. /entries/some-page"
          value={block.href ?? ''}
          onChange={(e) => onChange({ ...block, href: e.target.value || undefined })}
        />
        <div className="studio__field" style={{ maxWidth: 160, marginTop: '0.4rem' }}>
          <label>Size</label>
          <select value={block.width ?? 100} onChange={(e) => onChange({ ...block, width: parseInt(e.target.value, 10) })}>
            <option value={100}>Full width</option>
            <option value={70}>Large (70%)</option>
            <option value={50}>Medium (50%)</option>
            <option value={30}>Small (30%)</option>
          </select>
        </div>
      </div>
    );
  }

  if (block.type === 'youtube') {
    return (
      <div>
        <input
          placeholder="YouTube URL (youtube.com/watch?v=... or youtu.be/...)"
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
        />
        <input
          placeholder="Caption (optional)"
          value={block.caption ?? ''}
          onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
        />
      </div>
    );
  }

  if (block.type === 'video') {
    return (
      <div>
        {block.src && <video src={block.src} controls className="studio__thumb" style={{ background: '#000' }} />}
        <input
          type="file"
          accept="video/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              const { src } = await uploadAsset(file);
              onChange({ ...block, src });
            }
            e.currentTarget.value = '';
          }}
        />
        <input
          placeholder="Caption (optional)"
          value={block.caption ?? ''}
          onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
        />
        <input
          placeholder="Aspect ratio, e.g. 9/16 for a vertical video, 16/9 for horizontal"
          value={block.aspect ?? ''}
          onChange={(e) => onChange({ ...block, aspect: e.target.value || undefined })}
        />
      </div>
    );
  }

  if (block.type === 'imagegrid') {
    return (
      <div>
        <div className="studio__field" style={{ maxWidth: 160 }}>
          <label>Columns (1 = stacked vertically)</label>
          <input
            type="number"
            min={1}
            max={4}
            value={block.cols}
            onChange={(e) => onChange({ ...block, cols: parseInt(e.target.value, 10) || 1 })}
          />
        </div>
        <div className="studio__imagegrid-items">
          {block.images.map((img, i) => (
            <div key={i} className="studio__row-item">
              {img.src && <img src={img.src} alt="" />}
              <div className="studio__row-item-fields">
                <input
                  placeholder="Caption (optional)"
                  value={img.caption ?? ''}
                  onChange={(e) => {
                    const images = block.images.map((im, idx) => (idx === i ? { ...im, caption: e.target.value || undefined } : im));
                    onChange({ ...block, images });
                  }}
                />
                <input
                  placeholder="Link (optional)"
                  value={img.href ?? ''}
                  onChange={(e) => {
                    const images = block.images.map((im, idx) => (idx === i ? { ...im, href: e.target.value || undefined } : im));
                    onChange({ ...block, images });
                  }}
                />
              </div>
              <button
                className="studio__icon-btn"
                onClick={() => onChange({ ...block, images: block.images.filter((_, idx) => idx !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              const { src } = await uploadAsset(file);
              onChange({ ...block, images: [...block.images, { src }] });
            }
            e.currentTarget.value = '';
          }}
        />
      </div>
    );
  }

  return null;
}
