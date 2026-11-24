import { TEMPLATES, type CollageTemplate } from '../../lib/collageTemplates';

const WEIGHT_FILL: Record<string, string> = {
  anchor: '#8a8a8a',
  banner: '#b0b0b0',
  medium: '#c7c7c7',
  small: '#dcdcdc',
  tiny: '#ececec',
};

// A small SVG rendered straight from the template's own slot data — so
// the preview can never drift out of sync with the real layout it
// produces, since there's nothing hand-drawn to keep in sync.
function TemplatePreview({ template }: { template: CollageTemplate }) {
  const variant = template.variants[0];
  return (
    <svg viewBox={`0 0 ${variant.canvasWidth} ${variant.canvasHeight}`} className="studio__template-preview">
      <rect x={0} y={0} width={variant.canvasWidth} height={variant.canvasHeight} fill="#f6f6f4" />
      {variant.slots.map((slot, i) => {
        const x = (slot.left / 100) * variant.canvasWidth;
        const y = (slot.top / 100) * variant.canvasHeight;
        const w = (slot.width / 100) * variant.canvasWidth;
        const h = (slot.height / 100) * variant.canvasHeight;
        if (slot.kind === 'text') {
          return <rect key={i} x={x} y={y} width={w} height={h} fill="none" stroke="#999" strokeDasharray="6 5" strokeWidth={3} />;
        }
        return <rect key={i} x={x} y={y} width={w} height={h} fill={WEIGHT_FILL[slot.weight]} />;
      })}
    </svg>
  );
}

interface Props {
  context: 'homepage' | 'entry';
  onPick: (template: CollageTemplate) => void;
  onBlank: () => void;
  onCancel?: () => void;
  /** User-saved templates (fetched from GET /api/studio/templates), shown
   * alongside the built-in ones — same card, same preview rendering. */
  customTemplates?: CollageTemplate[];
  onDeleteCustom?: (id: string) => void;
}

export default function TemplatePicker({ context, onPick, onBlank, onCancel, customTemplates = [], onDeleteCustom }: Props) {
  const available = TEMPLATES.filter((t) => t.contexts.includes(context));
  const custom = customTemplates.filter((t) => t.contexts.includes(context));
  return (
    <div className="studio__template-picker">
      <div className="studio__template-grid">
        {available.map((t) => (
          <button key={t.id} className="studio__template-card" onClick={() => onPick(t)}>
            <TemplatePreview template={t} />
            <strong>{t.name}</strong>
            <span>{t.description}</span>
          </button>
        ))}
        {custom.map((t) => (
          <div key={t.id} className="studio__template-card studio__template-card--custom">
            <button className="studio__template-card-pick" onClick={() => onPick(t)}>
              <TemplatePreview template={t} />
              <strong>{t.name}</strong>
              <span>{t.description || 'A template you saved.'}</span>
            </button>
            {onDeleteCustom && (
              <button className="studio__icon-btn" title="Delete this saved template" onClick={() => onDeleteCustom(t.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button className="studio__template-card studio__template-card--blank" onClick={onBlank}>
          <div className="studio__template-blank-icon">+</div>
          <strong>Blank canvas</strong>
          <span>Start with nothing and build it by hand.</span>
        </button>
      </div>
      {onCancel && (
        <button className="studio__btn" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
