import { useState } from 'react';
import { thumbSrc } from '../../lib/images';

// A small "pick an already-uploaded photo" button + grid, reused
// everywhere an image can be added in Studio — uploading a brand-new
// file is only half the story; most of the time the photo you want is
// already sitting in public/photos/ from an earlier upload. Reuses the
// same GET /api/studio/photos endpoint and .studio__medialibrary-grid
// styling built for the Contact Sheet editor.
function probeAspect(src: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? `${img.naturalWidth}/${img.naturalHeight}` : undefined);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

interface Props {
  onSelect: (src: string, aspect: string | undefined) => void;
  label?: string;
}

export default function MediaLibraryPicker({ onSelect, label = '+ Choose from Library' }: Props) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<{ src: string }[]>([]);
  const [loading, setLoading] = useState(false);

  function toggle() {
    if (!open) {
      setLoading(true);
      fetch('/api/studio/photos')
        .then((r) => r.json())
        .then((data) => {
          setPhotos(data);
          setLoading(false);
        });
    }
    setOpen((v) => !v);
  }

  async function handlePick(src: string) {
    const aspect = await probeAspect(thumbSrc(src));
    onSelect(src, aspect);
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="studio__btn" onClick={toggle}>
        {open ? 'Close library' : label}
      </button>
      {open && (
        <div className="studio__medialibrary-grid">
          {loading && <span className="studio__status">Loading…</span>}
          {!loading &&
            photos.map((p) => (
              <button key={p.src} type="button" onClick={() => handlePick(p.src)} title="Use this photo">
                <img src={thumbSrc(p.src)} alt="" />
              </button>
            ))}
        </div>
      )}
    </>
  );
}
