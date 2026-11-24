import { useRef, useState } from 'react';
import type { ContactSheetAspect, ContactSheetData, ContactSheetImage, ContactSheetStyle } from './types';
import { midSrc, thumbSrc } from '../../lib/images';
import FocalPointPicker from './FocalPointPicker';

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const STYLE_DEFAULTS: Record<ContactSheetStyle, { gapX: number; gapY: number; aspect: ContactSheetAspect }> = {
  editorial: { gapX: 6, gapY: 6, aspect: 'portrait' },
  compact: { gapX: 2, gapY: 2, aspect: 'square' },
  film: { gapX: 4, gapY: 4, aspect: 'original' },
};

const ASPECT_RATIO: Record<ContactSheetAspect, string | undefined> = {
  original: undefined,
  square: '1',
  portrait: '4 / 5',
  landscape: '3 / 2',
};

interface Props {
  data: ContactSheetData;
  onChange: (data: ContactSheetData) => void;
  onUpload: (file: File) => Promise<{ src: string; aspect?: string; kind: 'image' | 'video' }>;
  previewMode?: boolean;
}

export default function ContactSheetEditor({ data, onChange, onUpload, previewMode = false }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<{ src: string }[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Same stale-closure problem fixed in Part 2 — reads the latest data
  // across the awaits in a multi-file upload.
  const dataRef = useRef(data);
  dataRef.current = data;

  const defaults = STYLE_DEFAULTS[data.style];
  const gapX = data.gapX ?? defaults.gapX;
  const gapY = data.gapY ?? defaults.gapY;
  const aspect = data.aspect ?? defaults.aspect;
  const aspectRatio = ASPECT_RATIO[aspect];
  const columnsDesktop = data.columnsDesktop ?? 3;
  const columnsMobile = data.columnsMobile ?? 2;

  function patch(fields: Partial<ContactSheetData>) {
    onChange({ ...dataRef.current, ...fields });
  }

  function patchImage(id: string, fields: Partial<ContactSheetImage>) {
    onChange({ ...dataRef.current, images: dataRef.current.images.map((img) => (img.id === id ? { ...img, ...fields } : img)) });
  }

  function removeImage(id: string) {
    onChange({ ...dataRef.current, images: dataRef.current.images.filter((img) => img.id !== id) });
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const images = [...dataRef.current.images];
    const fromIdx = images.findIndex((i) => i.id === fromId);
    const toIdx = images.findIndex((i) => i.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = images.splice(fromIdx, 1);
    images.splice(toIdx, 0, moved);
    onChange({ ...dataRef.current, images });
  }

  async function handleUploadFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const previewUrl = URL.createObjectURL(file);
      const id = genId();
      onChange({ ...dataRef.current, images: [...dataRef.current.images, { id, src: previewUrl }] });
      const { src } = await onUpload(file);
      onChange({ ...dataRef.current, images: dataRef.current.images.map((img) => (img.id === id ? { ...img, src } : img)) });
      URL.revokeObjectURL(previewUrl);
    }
  }

  function openLibrary() {
    setShowLibrary(true);
    fetch('/api/studio/photos')
      .then((r) => r.json())
      .then(setLibrary);
  }

  function addFromLibrary(src: string) {
    onChange({ ...dataRef.current, images: [...dataRef.current.images, { id: genId(), src }] });
  }

  const selected = selectedId ? data.images.find((img) => img.id === selectedId) : null;

  return (
    <div className="studio__body">
      <div className="studio__main">
        {!previewMode && (
        <>
        <div className="studio__collage-toolbar">
          <label className="studio__section-height">
            Style
            <select value={data.style} onChange={(e) => patch({ style: e.target.value as ContactSheetStyle })}>
              <option value="editorial">Editorial</option>
              <option value="compact">Compact</option>
              <option value="film">Film</option>
            </select>
          </label>
          <label className="studio__section-height">
            Columns (desktop)
            <input
              type="number"
              min={1}
              max={6}
              value={columnsDesktop}
              onChange={(e) => patch({ columnsDesktop: parseInt(e.target.value, 10) || 3 })}
            />
          </label>
          <label className="studio__section-height">
            Columns (mobile)
            <input
              type="number"
              min={1}
              max={4}
              value={columnsMobile}
              onChange={(e) => patch({ columnsMobile: parseInt(e.target.value, 10) || 2 })}
            />
          </label>
        </div>
        <div className="studio__collage-toolbar">
          <label className="studio__section-height">
            Gap X (px)
            <input type="number" min={0} max={60} value={gapX} onChange={(e) => patch({ gapX: parseInt(e.target.value, 10) || 0 })} />
          </label>
          <label className="studio__section-height">
            Gap Y (px)
            <input type="number" min={0} max={60} value={gapY} onChange={(e) => patch({ gapY: parseInt(e.target.value, 10) || 0 })} />
          </label>
          <label className="studio__section-height">
            Aspect
            <select value={aspect} onChange={(e) => patch({ aspect: e.target.value as ContactSheetAspect })}>
              <option value="original">Original</option>
              <option value="square">Square</option>
              <option value="portrait">Portrait (4:5)</option>
              <option value="landscape">Landscape (3:2)</option>
            </select>
          </label>
          <label className="studio__lock-toggle">
            <input type="checkbox" checked={data.showCaptions ?? false} onChange={(e) => patch({ showCaptions: e.target.checked || undefined })} />
            Show captions
          </label>
          {data.style === 'film' && (
            <label className="studio__lock-toggle">
              <input
                type="checkbox"
                checked={data.showFrameNumbers ?? false}
                onChange={(e) => patch({ showFrameNumbers: e.target.checked || undefined })}
              />
              Frame numbers
            </label>
          )}
        </div>

        <div className="studio__collage-toolbar">
          <label className="studio__btn">
            + Upload images
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) handleUploadFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <button className="studio__btn" onClick={() => (showLibrary ? setShowLibrary(false) : openLibrary())}>
            {showLibrary ? 'Close media library' : '+ Add from Media Library'}
          </button>
        </div>

        {showLibrary && (
          <div className="studio__medialibrary-grid">
            {library.map((p) => (
              <button key={p.src} onClick={() => addFromLibrary(p.src)} title="Add to sheet">
                <img src={thumbSrc(p.src)} alt="" />
              </button>
            ))}
          </div>
        )}
        </>
        )}

        <div
          className={`contact-sheet contact-sheet--${data.style}`}
          data-aspect={aspect}
          style={{ ['--cols-desktop' as any]: columnsDesktop, ['--cols-mobile' as any]: columnsMobile, ['--gap-x' as any]: `${gapX}px`, ['--gap-y' as any]: `${gapY}px` }}
        >
          {data.images.map((img, i) => (
            <figure
              key={img.id}
              className={`contact-sheet__cell studio__contact-sheet-cell${!previewMode && selectedId === img.id ? ' studio__contact-sheet-cell--selected' : ''}${draggingId === img.id ? ' studio__contact-sheet-cell--dragging' : ''}`}
              draggable={!previewMode}
              onDragStart={() => setDraggingId(img.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) reorder(draggingId, img.id);
              }}
            >
              <div
                className="contact-sheet__frame"
                style={aspectRatio ? { aspectRatio } : undefined}
                onClick={() => !previewMode && setSelectedId(img.id)}
              >
                <img src={midSrc(img.src)} alt="" draggable={false} style={{ objectPosition: `${img.focalX ?? 50}% ${img.focalY ?? 50}%` }} />
              </div>
              {!previewMode && (
                <button className="studio__contact-sheet-remove" title="Remove from this sheet" onClick={() => removeImage(img.id)}>
                  ✕
                </button>
              )}
              {data.showCaptions && img.caption && <figcaption className="contact-sheet__caption">{img.caption}</figcaption>}
              {data.style === 'film' && data.showFrameNumbers && <p className="contact-sheet__framenum">{String(i + 1).padStart(2, '0')}</p>}
            </figure>
          ))}
        </div>
        {!previewMode && data.images.length === 0 && <div className="studio__empty">Upload images or add some from the Media Library above.</div>}
      </div>

      {!previewMode && (
      <div className="studio__sidebar">
        {selected ? (
          <>
            <h3>Image</h3>
            {aspect !== 'original' ? (
              <FocalPointPicker
                src={selected.src}
                focalX={selected.focalX}
                focalY={selected.focalY}
                onChange={(focalX, focalY) => patchImage(selected.id, { focalX, focalY })}
              />
            ) : (
              <img className="studio__thumb" src={thumbSrc(selected.src)} alt="" />
            )}
            <div className="studio__field">
              <label>Alt text</label>
              <input value={selected.alt ?? ''} onChange={(e) => patchImage(selected.id, { alt: e.target.value || undefined })} />
            </div>
            <div className="studio__field">
              <label>Caption (optional)</label>
              <input value={selected.caption ?? ''} onChange={(e) => patchImage(selected.id, { caption: e.target.value || undefined })} />
            </div>
            <button className="studio__btn studio__btn--danger" onClick={() => removeImage(selected.id)}>
              Remove from this sheet
            </button>
          </>
        ) : (
          <div className="studio__empty">Click a photo to edit it, or drag one to reorder.</div>
        )}
      </div>
      )}
    </div>
  );
}
