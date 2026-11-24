import { useEffect, useRef, useState } from 'react';
import type { Block, CollageData, ContactSheetData, EntryType, PageData, PageStyle, PageSummary } from './types';
import CollageEditor from './CollageEditor';
import ContactSheetEditor from './ContactSheetEditor';
import TemplatePicker from './TemplatePicker';
import { applyTemplate, convertPageToCollage, type CollageTemplate, type TemplateImageInput } from '../../lib/collageTemplates';
import { thumbSrc } from '../../lib/images';
import FocalPointPicker from './FocalPointPicker';
import PageStylePicker from './PageStylePicker';
import MediaLibraryPicker from './MediaLibraryPicker';

// One section the same size as the homepage's own default section
// (DesktopEditor's addSection()) — a collage page should feel like the
// same spacious working area, not a cramped square. This is the "Blank
// canvas" choice in the template picker; its own height is freely
// resizable afterward in CollageEditor.
const DEFAULT_COLLAGE: CollageData = {
  sections: [{ canvasWidth: 1440, canvasHeight: 900, tiles: [], tape: [], tacks: [] }],
};

const DEFAULT_CONTACT_SHEET: ContactSheetData = { images: [], style: 'editorial' };

function collectImages(collage: CollageData): TemplateImageInput[] {
  const images: TemplateImageInput[] = [];
  for (const section of collage.sections) {
    for (const tile of section.tiles) {
      if (tile.kind === 'image')
        images.push({ src: tile.src, alt: tile.alt, aspect: tile.aspect, href: tile.href, border: tile.border, mat: tile.mat });
    }
  }
  return images;
}

const TYPES: EntryType[] = ['photo', 'note', 'link', 'essay', 'observation', 'curiosity'];

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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
  const [newPageStyle, setNewPageStyle] = useState<PageStyle | ''>('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A page clicked in the sidebar while the open one has unsaved
  // changes — held here until the user confirms discarding them, rather
  // than switching (and silently losing the edits) right away.
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  // The slug the open page is actually saved under on disk — `current.slug`
  // becomes the editable "page URL" field, which may differ from this
  // while a rename is pending (not yet saved).
  const [originalSlug, setOriginalSlug] = useState<string | null>(null);
  // A template the user just picked for a brand-new (not-yet-populated)
  // collage page, waiting on images to fill it — see the "Add images to
  // fill" step below. `pendingImages` accumulates as uploads complete.
  const [pendingTemplate, setPendingTemplate] = useState<CollageTemplate | null>(null);
  const [pendingImages, setPendingImages] = useState<TemplateImageInput[]>([]);
  const [uploadingTemplateImages, setUploadingTemplateImages] = useState(false);
  // Re-running the picker on a page that already has a layout — shows a
  // replace-warning instead of silently discarding the current one.
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  // Hides every editing control so the page reads close to how it'll
  // actually look — a pure view-state toggle over the same (possibly
  // unsaved) data, never written back or saved itself.
  const [previewMode, setPreviewMode] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  // The collage exactly as it was when this page was last opened or
  // saved — "Revert to Saved" resets just the canvas back to this,
  // discarding any shuffles/edits made since without touching other
  // fields (title, tags, etc.) that may also be mid-edit.
  const savedCollageRef = useRef<CollageData | undefined>(undefined);
  // Collapsing the page list gives the collage editor the full window
  // width — handy since its canvas is a fixed 860px wide plus a sidebar.
  // Persisted the same way `studio:tab`/`studio:openSlug` are, so it
  // survives the full-page reload a save/create/delete triggers.
  const [listCollapsed, setListCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem('studio:pagesListCollapsed') === '1';
    } catch {
      return false;
    }
  });
  function toggleListCollapsed() {
    setListCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('studio:pagesListCollapsed', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  const [customTemplates, setCustomTemplates] = useState<CollageTemplate[]>([]);

  function refreshList() {
    fetch('/api/studio/pages')
      .then((r) => r.json())
      .then(setList);
  }

  function refreshCustomTemplates() {
    fetch('/api/studio/templates')
      .then((r) => r.json())
      .then(setCustomTemplates);
  }

  async function saveCustomTemplate(template: CollageTemplate) {
    await fetch('/api/studio/templates', { method: 'POST', body: JSON.stringify(template) });
    refreshCustomTemplates();
  }

  async function deleteCustomTemplate(id: string) {
    await fetch(`/api/studio/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    refreshCustomTemplates();
  }

  useEffect(() => {
    refreshList();
    refreshCustomTemplates();
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
    savedCollageRef.current = data.collage;
    rememberOpenSlug(data.slug);
    setDirty(false);
    setError(null);
    setCreating(false);
    setConfirmingDelete(false);
    setConfirmingRevert(false);
    return true;
  }

  function startCreate() {
    setCurrent(null);
    setNewType('note');
    setNewTitle('');
    setNewPageStyle('');
    setCreating(true);
  }

  async function confirmCreate() {
    const res = await fetch('/api/studio/pages', {
      method: 'POST',
      body: JSON.stringify({ type: newType, title: newTitle || undefined, pageStyle: newPageStyle || undefined }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? 'Failed to create the page.');
      return;
    }
    const { slug } = body;
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

  async function handleTemplateUploadFiles(files: FileList) {
    setUploadingTemplateImages(true);
    try {
      for (const file of Array.from(files)) {
        const { src, aspect } = await uploadAsset(file);
        setPendingImages((prev) => [...prev, { src, aspect }]);
      }
    } finally {
      setUploadingTemplateImages(false);
    }
  }

  function finalizeTemplate(template: CollageTemplate, images: TemplateImageInput[]) {
    const sections = applyTemplate(template, 0, images);
    patch({ collage: { sections, templateId: template.id, templateVariant: 0 } });
    setPendingTemplate(null);
    setPendingImages([]);
    setChangingTemplate(false);
  }

  // Resets just the canvas back to its last-saved (or last-opened, if
  // never saved this session) state — lets shuffling/experimenting stay
  // genuinely free of risk without needing to abandon the whole page.
  function revertToSaved() {
    patch({ collage: savedCollageRef.current });
    setConfirmingRevert(false);
  }

  // "Change template" on a page that already has images: reflow its
  // existing photos into the new template's slots rather than asking the
  // user to re-upload anything. Non-image content (video/youtube/text,
  // tape, tacks) doesn't carry over — the warning shown alongside the
  // picker says so.
  function applyTemplateReflow(template: CollageTemplate) {
    const images = current?.collage ? collectImages(current.collage) : [];
    finalizeTemplate(template, images);
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
      savedCollageRef.current = current.collage;
      setDirty(false);
      refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  // The one-time migration path off the old "contact sheet as an Image
  // Grid block" mechanism (Part 2) — builds a brand-new, standalone
  // Contact Sheet page from that block's images, leaving the original
  // Standard page and its block completely untouched.
  async function convertImageGridToContactSheetPage(block: Block & { type: 'imagegrid' }) {
    if (!current) return;
    const title = current.title ? `${current.title} (contact sheet)` : undefined;
    const createRes = await fetch('/api/studio/pages', {
      method: 'POST',
      body: JSON.stringify({ type: current.type, title }),
    });
    const { slug } = await createRes.json();
    const contactSheet: ContactSheetData = {
      style: 'editorial',
      images: block.images.map((img) => ({ id: genId(), src: img.src, alt: img.alt, caption: img.caption })),
    };
    await fetch('/api/studio/pages', {
      method: 'PUT',
      body: JSON.stringify({
        slug,
        originalSlug: slug,
        type: current.type,
        date: new Date().toISOString().slice(0, 10),
        title,
        template: 'contact-sheet',
        contactSheet,
        blocks: [],
      }),
    });
    refreshList();
    rememberOpenSlug(slug);
    await open(slug, 5);
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

  // Clicking a different page in the sidebar: switch right away if
  // there's nothing unsaved to lose, otherwise hold it until confirmed.
  function selectPage(slug: string) {
    if (slug === originalSlug) return;
    if (dirty) {
      setPendingSlug(slug);
      return;
    }
    open(slug);
  }

  function confirmSwitchPage() {
    const slug = pendingSlug;
    setPendingSlug(null);
    if (slug) open(slug);
  }

  return (
    <div className="studio__body">
      {listCollapsed ? (
        <button className="studio__pages-list-expand" onClick={toggleListCollapsed} title="Show page list">
          ▶
        </button>
      ) : (
        <div className="studio__pages-list">
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <button className="studio__btn studio__btn--primary" style={{ flex: '1 1 auto' }} onClick={startCreate}>
              + New page
            </button>
            <button className="studio__btn" onClick={toggleListCollapsed} title="Collapse page list">
              ◀
            </button>
          </div>
          {pendingSlug && (
            <div className="studio__field" style={{ marginBottom: '0.75rem' }}>
              <p className="studio__status">Discard unsaved changes and switch pages?</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="studio__btn studio__btn--danger" onClick={confirmSwitchPage}>
                  Yes, discard
                </button>
                <button className="studio__btn" onClick={() => setPendingSlug(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {list.map((p) => (
            <button
              key={p.slug}
              className={`studio__page-row${originalSlug === p.slug ? ' studio__page-row--active' : ''}`}
              onClick={() => selectPage(p.slug)}
            >
              {p.image && <img src={thumbSrc(p.image)} alt="" />}
              <span>
                <strong>{p.title ?? p.slug}</strong>
                <small>{p.type}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="studio__page-content">
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
            <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
              <label>Page style (optional)</label>
              <PageStylePicker value={newPageStyle || undefined} onChange={(v) => setNewPageStyle(v ?? '')} />
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
              <label className="studio__lock-toggle" title="Keeps this page off the nav's random 'elsewhere' link — still reachable at its own URL.">
                <input type="checkbox" checked={current.hidden ?? false} onChange={(e) => patch({ hidden: e.target.checked || undefined })} />
                Hidden (skip in &ldquo;elsewhere&rdquo;)
              </label>
              <div className="studio__spacer" />
              {error && <span className="studio__status" style={{ color: '#b42318' }}>{error}</span>}
              {dirty && <span className="studio__status">Unsaved changes</span>}
              {current.template === 'collage' &&
                current.collage &&
                (confirmingRevert ? (
                  <>
                    <span className="studio__status">Discard changes to the canvas since it was last saved?</span>
                    <button className="studio__btn studio__btn--danger" onClick={revertToSaved}>
                      Yes, revert
                    </button>
                    <button className="studio__btn" onClick={() => setConfirmingRevert(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="studio__btn" onClick={() => setConfirmingRevert(true)}>
                    Revert to saved
                  </button>
                ))}
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

            {!previewMode && (
              <div style={{ maxWidth: 640 }}>
                <FieldForm page={current} onChange={patch} />
              </div>
            )}

            <div className="studio__section-header" style={{ margin: 0, marginTop: '1.5rem', marginBottom: '0.5rem' }}>
              <button
                className={`studio__btn${previewMode ? ' studio__btn--primary' : ''}`}
                onClick={() => setPreviewMode((v) => !v)}
              >
                {previewMode ? 'Exit preview' : 'Preview'}
              </button>
              {previewMode && (
                <>
                  <button
                    className={`studio__btn${previewWidth === 'desktop' ? ' studio__btn--primary' : ''}`}
                    onClick={() => setPreviewWidth('desktop')}
                  >
                    Desktop
                  </button>
                  <button
                    className={`studio__btn${previewWidth === 'mobile' ? ' studio__btn--primary' : ''}`}
                    onClick={() => setPreviewWidth('mobile')}
                  >
                    Mobile
                  </button>
                </>
              )}
            </div>

            {current.template === 'collage' ? (
              <>
                <h3 style={{ marginTop: '2rem' }}>Collage layout</h3>
                {!current.collage && !pendingTemplate ? (
                  <TemplatePicker
                    context="entry"
                    onPick={(t) => setPendingTemplate(t)}
                    onBlank={() => patch({ collage: DEFAULT_COLLAGE })}
                    customTemplates={customTemplates}
                    onDeleteCustom={deleteCustomTemplate}
                  />
                ) : !current.collage && pendingTemplate ? (
                  <div className="studio__field" style={{ maxWidth: 480 }}>
                    <p className="studio__status">
                      Add images to fill &ldquo;{pendingTemplate.name}&rdquo;
                      {pendingImages.length > 0 ? ` — ${pendingImages.length} added so far` : ''}.
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploadingTemplateImages}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) handleTemplateUploadFiles(e.target.files);
                        e.currentTarget.value = '';
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        className="studio__btn studio__btn--primary"
                        disabled={pendingImages.length === 0 || uploadingTemplateImages}
                        onClick={() => finalizeTemplate(pendingTemplate, pendingImages)}
                      >
                        Apply with {pendingImages.length} image{pendingImages.length === 1 ? '' : 's'}
                      </button>
                      <button
                        className="studio__btn"
                        onClick={() => {
                          setPendingTemplate(null);
                          setPendingImages([]);
                        }}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                ) : changingTemplate ? (
                  <>
                    {current.collage && collectImages(current.collage).length > 0 && (
                      <p className="studio__status" style={{ marginBottom: '0.5rem' }}>
                        This replaces the current layout — your {collectImages(current.collage).length} photo
                        {collectImages(current.collage).length === 1 ? '' : 's'} will be reflowed into the new
                        arrangement; any video, text, or decorations won&rsquo;t carry over.
                      </p>
                    )}
                    <TemplatePicker
                      context="entry"
                      onPick={(t) => applyTemplateReflow(t)}
                      onBlank={() => {
                        patch({ collage: DEFAULT_COLLAGE });
                        setChangingTemplate(false);
                      }}
                      onCancel={() => setChangingTemplate(false)}
                      customTemplates={customTemplates}
                      onDeleteCustom={deleteCustomTemplate}
                    />
                  </>
                ) : (
                  <>
                    {!previewMode && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <button className="studio__btn" onClick={() => setChangingTemplate(true)}>
                          Change template…
                        </button>
                      </div>
                    )}
                    <CollageEditor
                      collage={current.collage ?? DEFAULT_COLLAGE}
                      onChange={(collage) => patch({ collage })}
                      onUpload={uploadAsset}
                      customTemplates={customTemplates}
                      onSaveTemplate={saveCustomTemplate}
                      previewMode={previewMode}
                      previewWidth={previewWidth}
                    />
                  </>
                )}
              </>
            ) : current.template === 'contact-sheet' ? (
              <>
                <h3 style={{ marginTop: '2rem' }}>Contact Sheet</h3>
                <ContactSheetEditor
                  data={current.contactSheet ?? DEFAULT_CONTACT_SHEET}
                  onChange={(contactSheet) => patch({ contactSheet })}
                  onUpload={uploadAsset}
                  previewMode={previewMode}
                />
              </>
            ) : previewMode ? (
              <div style={{ maxWidth: previewWidth === 'mobile' ? 390 : 640, margin: previewWidth === 'mobile' ? '0 auto' : undefined }}>
                <BlockPreview page={current} />
              </div>
            ) : (
              <div style={{ maxWidth: 640 }}>
                <h3 style={{ marginTop: '2rem' }}>Content</h3>
                <BlockEditor blocks={current.blocks} onChange={patchBlocks} onConvertToContactSheet={convertImageGridToContactSheetPage} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FieldForm({ page, onChange }: { page: PageData; onChange: (f: Partial<PageData>) => void }) {
  async function handleImageUpload(file: File) {
    const previewUrl = URL.createObjectURL(file);
    onChange({ image: previewUrl });
    const { src, aspect } = await uploadAsset(file);
    onChange({ image: src, aspect: aspect ?? page.aspect });
    URL.revokeObjectURL(previewUrl);
  }

  async function handleDetailImageUpload(file: File) {
    const previewUrl = URL.createObjectURL(file);
    onChange({ detailImage: previewUrl });
    const { src } = await uploadAsset(file);
    onChange({ detailImage: src });
    URL.revokeObjectURL(previewUrl);
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
        <label>Template</label>
        <select
          value={page.template ?? 'standard'}
          onChange={(e) => {
            const template = e.target.value as 'standard' | 'collage' | 'contact-sheet';
            // Moving from Standard to Collage on a page that already has
            // a lead image or body content: carry all of it over as real
            // tiles rather than dropping it behind a blank/template
            // picker. A page with nothing yet still gets the normal
            // picker (there's nothing to lose).
            if (template === 'collage' && !page.collage && (page.image || page.blocks.length > 0)) {
              onChange({ template, collage: convertPageToCollage(page) });
            } else {
              onChange({ template });
            }
          }}
        >
          <option value="standard">Standard</option>
          <option value="collage">Collage (drag &amp; drop)</option>
          <option value="contact-sheet">Contact Sheet</option>
        </select>
      </div>
      {(page.template ?? 'standard') === 'standard' && (
        <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
          <label>Page style (optional)</label>
          <PageStylePicker value={page.pageStyle} onChange={(v) => onChange({ pageStyle: v })} />
        </div>
      )}
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

      {page.pageStyle === 'single-image' && (
        <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
          <label>Note (optional) — a short aside, separate from the caption above</label>
          <input value={page.note ?? ''} onChange={(e) => onChange({ note: e.target.value || undefined })} />
        </div>
      )}

      <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
        <label>Lead image</label>
        <p className="studio__field-hint">
          {(page.template ?? 'standard') === 'standard'
            ? 'Shows as the big photo at the top of this page, and doubles as its thumbnail in the Studio page list and on the homepage/collections grid.'
            : "Not shown on the page itself — this template has its own images on the canvas. Used only as this page's thumbnail in the Studio page list and on the homepage/collections grid."}
        </p>
        {page.image && <img src={thumbSrc(page.image)} alt="" className="studio__thumb" style={{ marginBottom: '0.5rem' }} />}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
            e.currentTarget.value = '';
          }}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <MediaLibraryPicker onSelect={(src, aspect) => onChange({ image: src, aspect: aspect ?? page.aspect })} />
        </div>
        {page.image && (
          <button className="studio__btn" style={{ marginTop: '0.5rem' }} onClick={() => onChange({ image: undefined, aspect: undefined })}>
            Remove lead image
          </button>
        )}
      </div>

      {page.pageStyle === 'single-image' && (
        <div className="studio__field" style={{ gridColumn: '1 / 3' }}>
          <label>Detail photo (optional) — a second, smaller photo shown below</label>
          {page.detailImage && (
            <img src={thumbSrc(page.detailImage)} alt="" className="studio__thumb" style={{ marginBottom: '0.5rem' }} />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleDetailImageUpload(file);
              e.currentTarget.value = '';
            }}
          />
          <div style={{ marginTop: '0.5rem' }}>
            <MediaLibraryPicker onSelect={(src) => onChange({ detailImage: src })} />
          </div>
          <input
            placeholder="Alt text (optional)"
            style={{ marginTop: '0.5rem' }}
            value={page.detailImageAlt ?? ''}
            onChange={(e) => onChange({ detailImageAlt: e.target.value || undefined })}
          />
          {page.detailImage && (
            <button
              className="studio__btn"
              style={{ marginTop: '0.5rem' }}
              onClick={() => onChange({ detailImage: undefined, detailImageAlt: undefined })}
            >
              Remove detail photo
            </button>
          )}
        </div>
      )}

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

// Read-only approximation of the live Standard-page render, shown when
// Preview mode is on. Deliberately NOT byte-identical to entries/
// [slug].astro — that page's typography lives in its own Astro-scoped
// <style>, which a React component here can't import — but it shows the
// same title/figure/body-block content and order so composition and
// flow can be judged before saving.
function BlockPreview({ page }: { page: PageData }) {
  return (
    <div style={{ fontFamily: 'Georgia, serif' }}>
      {page.title && <h1 style={{ fontSize: '1.9rem', marginBottom: '0.5rem' }}>{page.title}</h1>}
      {page.location && <p style={{ fontSize: '0.85rem', color: '#9a9a9a', marginBottom: '0.5rem' }}>{page.location}</p>}
      {page.image && <img src={thumbSrc(page.image)} alt={page.imageAlt ?? ''} style={{ width: '100%', display: 'block', marginBottom: '0.5rem' }} />}
      {page.caption && <p style={{ fontStyle: 'italic', color: '#5a5a5a', margin: '1rem 0' }}>{page.caption}</p>}
      {page.blocks.map((block, i) => (
        <div key={i} style={{ margin: '1rem 0' }}>
          <BlockPreviewBody block={block} />
        </div>
      ))}
      {page.url && (
        <p style={{ marginTop: '1.5rem' }}>
          <a href={page.url} target="_blank" rel="noopener noreferrer">
            visit the source ↗
          </a>
        </p>
      )}
      {page.tags && page.tags.length > 0 && (
        <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', margin: '2rem 0 0', padding: 0, fontSize: '0.68rem', color: '#9a9a9a' }}>
          {page.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockPreviewBody({ block }: { block: Block }) {
  if (block.type === 'paragraph' || block.type === 'raw') {
    return <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{block.text}</p>;
  }
  if (block.type === 'quote') {
    return <blockquote style={{ fontStyle: 'italic', margin: 0, paddingLeft: '1rem', borderLeft: '2px solid #ddd' }}>{block.text}</blockquote>;
  }
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag>
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </Tag>
    );
  }
  if (block.type === 'image') {
    return (
      <figure style={{ margin: 0, width: block.width && block.width < 100 ? `${block.width}%` : '100%' }}>
        {block.src && <img src={thumbSrc(block.src)} alt={block.alt ?? ''} style={{ width: '100%', display: 'block' }} />}
        {block.caption && <figcaption style={{ fontSize: '0.82rem', color: '#5a5a5a', fontStyle: 'italic', marginTop: '0.5rem' }}>{block.caption}</figcaption>}
      </figure>
    );
  }
  if (block.type === 'imagegrid') {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${block.cols}, 1fr)`,
          gap: block.style === 'contact-sheet' ? '0.25rem' : '1rem',
        }}
      >
        {block.images.map((img, i) => (
          <img
            key={i}
            src={thumbSrc(img.src)}
            alt={img.alt ?? ''}
            style={{ width: '100%', aspectRatio: block.style === 'contact-sheet' ? '1' : undefined, objectFit: 'cover', display: 'block' }}
          />
        ))}
      </div>
    );
  }
  if (block.type === 'video') {
    return <video src={block.src} controls style={{ width: '100%', display: 'block', background: '#000' }} />;
  }
  if (block.type === 'youtube') {
    return <div className="studio__tile-placeholder">YouTube: {block.url || '(no URL set)'}</div>;
  }
  return null;
}

function BlockEditor({
  blocks,
  onChange,
  onConvertToContactSheet,
}: {
  blocks: Block[];
  onChange: (b: Block[]) => void;
  onConvertToContactSheet?: (block: Block & { type: 'imagegrid' }) => void;
}) {
  // Lets handleAddImages read the latest blocks across an `await` — the
  // `blocks` prop captured in that closure is stale the moment a second
  // upload in the same batch resolves after the first one's onChange has
  // already re-rendered this component with a new array.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

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

  function addImageFromLibrary(src: string, aspect: string | undefined) {
    add({ type: 'image', src, aspect });
  }

  // "+ Image" adds one fully-formed Image block per file picked, instead
  // of one empty block the user then has to fill in one at a time — a
  // preview blob shows immediately, swapped for the real uploaded path
  // once each upload resolves.
  async function addImages(files: FileList) {
    const picked = Array.from(files);
    if (picked.length === 0) return;
    const startIndex = blocksRef.current.length;
    const previews = picked.map((file) => URL.createObjectURL(file));
    onChange([...blocksRef.current, ...previews.map((src): Block => ({ type: 'image', src }))]);
    for (let i = 0; i < picked.length; i++) {
      const { src, aspect } = await uploadAsset(picked[i]);
      const index = startIndex + i;
      onChange(blocksRef.current.map((b, bi) => (bi === index ? ({ ...b, src, aspect } as Block) : b)));
      URL.revokeObjectURL(previews[i]);
    }
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
            {block.type === 'imagegrid' && block.style === 'contact-sheet' && onConvertToContactSheet && (
              <button className="studio__btn" style={{ marginTop: '0.5rem' }} onClick={() => onConvertToContactSheet(block)}>
                Convert to Contact Sheet page…
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="studio__add-row" style={{ flexWrap: 'wrap' }}>
        <button className="studio__btn" onClick={() => add({ type: 'paragraph', text: '' })}>
          + Paragraph
        </button>
        <label className="studio__btn">
          + Image
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) addImages(e.target.files);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <MediaLibraryPicker label="+ Image from Library" onSelect={addImageFromLibrary} />
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
  // Same stale-closure problem as BlockEditor.addImages, one level down —
  // needed by the imagegrid branch's multi-file upload below.
  const blockRef = useRef(block);
  blockRef.current = block;

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
        {block.src && (
          <FocalPointPicker
            src={block.src}
            focalX={block.focalX}
            focalY={block.focalY}
            onChange={(focalX, focalY) => onChange({ ...block, focalX, focalY })}
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              const previewUrl = URL.createObjectURL(file);
              onChange({ ...block, src: previewUrl });
              const { src, aspect } = await uploadAsset(file);
              onChange({ ...block, src, aspect: aspect ?? block.aspect });
              URL.revokeObjectURL(previewUrl);
            }
            e.currentTarget.value = '';
          }}
        />
        <MediaLibraryPicker
          label={block.src ? '…or choose a different one from Library' : '+ Choose from Library'}
          onSelect={(src, aspect) => onChange({ ...block, src, aspect: aspect ?? block.aspect })}
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
        <label style={{ fontSize: '0.72rem', color: '#666', display: 'block', marginTop: '0.4rem' }}>
          <input type="checkbox" checked={block.border ?? false} onChange={(e) => onChange({ ...block, border: e.target.checked || undefined })} />{' '}
          Thin black border
        </label>
        {block.border && (
          <label style={{ fontSize: '0.7rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '1.3rem' }}>
            Thickness (px)
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              style={{ width: '4rem', padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 4 }}
              value={block.borderWidth ?? 2}
              onChange={(e) => onChange({ ...block, borderWidth: parseFloat(e.target.value) || 2 })}
            />
          </label>
        )}
        <label style={{ fontSize: '0.72rem', color: '#666', display: 'block' }}>
          <input type="checkbox" checked={block.mat ?? false} onChange={(e) => onChange({ ...block, mat: e.target.checked || undefined })} />{' '}
          White mat/padding
        </label>
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
              const previewUrl = URL.createObjectURL(file);
              onChange({ ...block, src: previewUrl });
              const { src } = await uploadAsset(file);
              onChange({ ...block, src });
              URL.revokeObjectURL(previewUrl);
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
        <div className="studio__field" style={{ maxWidth: 220 }}>
          <label>Style</label>
          <select
            value={block.style ?? 'grid'}
            onChange={(e) => onChange({ ...block, style: e.target.value as 'grid' | 'contact-sheet' })}
          >
            <option value="grid">Grid (captions, your own spacing)</option>
            <option value="contact-sheet">Contact sheet (uniform squares, no captions)</option>
          </select>
        </div>
        <div className="studio__imagegrid-items">
          {block.images.map((img, i) => (
            <div key={i} className="studio__row-item">
              {img.src && (
                <FocalPointPicker
                  compact
                  src={img.src}
                  focalX={img.focalX}
                  focalY={img.focalY}
                  onChange={(focalX, focalY) => {
                    const images = block.images.map((im, idx) => (idx === i ? { ...im, focalX, focalY } : im));
                    onChange({ ...block, images });
                  }}
                />
              )}
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
                  disabled={img.lightbox}
                  value={img.href ?? ''}
                  onChange={(e) => {
                    const images = block.images.map((im, idx) => (idx === i ? { ...im, href: e.target.value || undefined } : im));
                    onChange({ ...block, images });
                  }}
                />
                <label style={{ fontSize: '0.72rem', color: '#666' }}>
                  <input
                    type="checkbox"
                    checked={img.lightbox ?? false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      const images = block.images.map((im, idx) =>
                        idx === i ? { ...im, lightbox: checked || undefined, href: checked ? undefined : im.href } : im,
                      );
                      onChange({ ...block, images });
                    }}
                  />{' '}
                  Lightbox (opens full-screen instead of a link)
                </label>
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
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.currentTarget.value = '';
            for (const file of files) {
              const previewUrl = URL.createObjectURL(file);
              const current = blockRef.current as typeof block;
              onChange({ ...current, images: [...current.images, { src: previewUrl }] });
              const { src } = await uploadAsset(file);
              const withPreview = blockRef.current as typeof block;
              onChange({
                ...withPreview,
                images: withPreview.images.map((im) => (im.src === previewUrl ? { ...im, src } : im)),
              });
              URL.revokeObjectURL(previewUrl);
            }
          }}
        />
        <MediaLibraryPicker
          label="+ Add from Library"
          onSelect={(src) => {
            const current = blockRef.current as typeof block;
            onChange({ ...current, images: [...current.images, { src }] });
          }}
        />
      </div>
    );
  }

  return null;
}
