import { useEffect, useState } from 'react';
import type { DesktopSection, EntryInfo, Layout, MobileSection } from './types';
import DesktopEditor from './DesktopEditor';
import MobileEditor from './MobileEditor';
import PagesEditor from './PagesEditor';
import './studio.css';

type Tab = 'desktop' | 'mobile' | 'pages';

function readStoredTab(): Tab {
  try {
    const stored = sessionStorage.getItem('studio:tab');
    if (stored === 'desktop' || stored === 'mobile' || stored === 'pages') return stored;
  } catch {
    // ignore
  }
  return 'desktop';
}

export default function StudioApp() {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [entriesList, setEntriesList] = useState<EntryInfo[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  // Saving any content (a page, an upload) writes a file under
  // src/content/entries/, and Astro's dev server reacts to that by doing
  // a full browser reload of every open page — including this one — since
  // it can't hot-swap content collection data. A plain useState here
  // would silently reset to the Desktop tab every time that happens, so
  // the active tab is persisted across that reload instead.
  const [tab, setTabState] = useState<Tab>(readStoredTab);
  function setTab(next: Tab) {
    setTabState(next);
    try {
      sessionStorage.setItem('studio:tab', next);
    } catch {
      // ignore
    }
  }
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFiles, setHistoryFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [layoutRes, entriesRes] = await Promise.all([fetch('/api/studio/layout'), fetch('/api/studio/entries')]);
      setLayout(await layoutRes.json());
      const data = await entriesRes.json();
      setEntriesList(data.entries);
      setCollections(data.collections);
    })();
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

  const entriesMap = Object.fromEntries(entriesList.map((e) => [e.slug, e]));

  function updateDesktop(sections: DesktopSection[]) {
    if (!layout) return;
    setLayout({ ...layout, desktopSections: sections });
    setDirty(true);
  }

  function updateMobile(sections: MobileSection[]) {
    if (!layout) return;
    setLayout({ ...layout, mobileSections: sections });
    setDirty(true);
  }

  async function handleUpload(file: File): Promise<EntryInfo> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/studio/upload', { method: 'POST', body: form });
    if (!res.ok) throw new Error('Upload failed');
    const entry: EntryInfo = await res.json();
    setEntriesList((list) => [...list, entry]);
    return entry;
  }

  async function handleSave() {
    if (!layout) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/layout', { method: 'POST', body: JSON.stringify(layout) });
      if (!res.ok) throw new Error('Save failed');
      setDirty(false);
      setSavedAt(new Date());
    } catch (e) {
      setError('Could not save — check the terminal running astro dev for details.');
    } finally {
      setSaving(false);
    }
  }

  async function openHistory() {
    const res = await fetch('/api/studio/layout?list=1');
    const data = await res.json();
    setHistoryFiles(data.files);
    setHistoryOpen((open) => !open);
  }

  async function restore(file: string) {
    const res = await fetch(`/api/studio/layout?history=${encodeURIComponent(file)}`);
    const data = await res.json();
    setLayout(data);
    setDirty(true);
    setHistoryOpen(false);
  }

  if (!layout) {
    return <div className="studio__empty">Loading…</div>;
  }

  return (
    <div className="studio">
      <div className="studio__topbar">
        <span className="studio__mark">Bichette Studio</span>

        <div className="studio__tabs">
          <button className={`studio__tab${tab === 'desktop' ? ' studio__tab--active' : ''}`} onClick={() => setTab('desktop')}>
            Desktop
          </button>
          <button className={`studio__tab${tab === 'mobile' ? ' studio__tab--active' : ''}`} onClick={() => setTab('mobile')}>
            Mobile
          </button>
          <button className={`studio__tab${tab === 'pages' ? ' studio__tab--active' : ''}`} onClick={() => setTab('pages')}>
            Pages
          </button>
        </div>

        <div className="studio__spacer" />

        {tab !== 'pages' && (
          <>
            {error && <span className="studio__status" style={{ color: '#b42318' }}>{error}</span>}
            {!error && savedAt && !dirty && <span className="studio__status">Saved {savedAt.toLocaleTimeString()}</span>}
            {dirty && <span className="studio__status">Unsaved changes</span>}

            <div className="studio__history">
              <button className="studio__btn" onClick={openHistory}>
                History
              </button>
              {historyOpen && (
                <div className="studio__history-menu">
                  {historyFiles.length === 0 && <div className="studio__history-item">No earlier versions yet</div>}
                  {historyFiles.map((f) => (
                    <div key={f} className="studio__history-item">
                      <span>{f.replace('.json', '')}</span>
                      <button className="studio__btn" onClick={() => restore(f)}>
                        Load
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <a className="studio__btn" href="http://localhost:4321/" target="_blank" rel="noopener noreferrer">
          View site ↗
        </a>

        {tab !== 'pages' && (
          <button className="studio__btn studio__btn--primary" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {/* All three stay mounted and are only hidden — switching tabs must
          never silently drop unsaved edits in whichever one you left. */}
      <div style={{ display: tab === 'desktop' ? 'block' : 'none' }}>
        <DesktopEditor
          sections={layout.desktopSections}
          entriesMap={entriesMap}
          entriesList={entriesList}
          collections={collections}
          onChange={updateDesktop}
          onUpload={handleUpload}
        />
      </div>
      <div style={{ display: tab === 'mobile' ? 'block' : 'none' }}>
        <MobileEditor
          sections={layout.mobileSections}
          entriesMap={entriesMap}
          entriesList={entriesList}
          collections={collections}
          onChange={updateMobile}
        />
      </div>
      <div style={{ display: tab === 'pages' ? 'block' : 'none' }}>
        <PagesEditor />
      </div>
    </div>
  );
}
