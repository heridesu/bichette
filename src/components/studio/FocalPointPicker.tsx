import { thumbSrc } from '../../lib/images';

interface Props {
  src: string;
  focalX?: number;
  focalY?: number;
  onChange: (focalX: number, focalY: number) => void;
  /** Fits into a small fixed-size slot (e.g. a compact row item) instead
   * of taking the full width of its container. */
  compact?: boolean;
}

// Click-to-set focal point — re-centers the existing object-fit: cover
// crop without touching the original file (no crop rectangle, no zoom).
// Shown uncropped (object-fit: contain, natural aspect) so a click maps
// directly onto the image's own coordinate space, not onto whatever a
// 4:3 thumbnail happens to be cropping away.
export default function FocalPointPicker({ src, focalX = 50, focalY = 50, onChange, compact }: Props) {
  function handleClick(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    onChange(x, y);
  }

  return (
    <div className={`studio__focal-picker${compact ? ' studio__focal-picker--compact' : ''}`}>
      <img src={thumbSrc(src)} alt="" draggable={false} onClick={handleClick} />
      <div className="studio__focal-marker" style={{ left: `${focalX}%`, top: `${focalY}%` }} />
      {!compact && (
        <p className="studio__field-hint" style={{ marginTop: '0.3rem' }}>
          Click to choose what shows in this frame — shifts the crop, doesn&rsquo;t zoom or touch the original photo.
        </p>
      )}
    </div>
  );
}
