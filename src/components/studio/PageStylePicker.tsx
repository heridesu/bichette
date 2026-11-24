import type { PageStyle } from './types';

// Small schematic diagrams — not real layouts, just enough of a visual
// shorthand (title/image/text proportions) that picking a page style
// doesn't require remembering what each name means. Same spirit as the
// collage TemplatePicker's SVG previews, hand-drawn here since page
// styles aren't geometric slot data the way collage templates are.
const INK = '#8a8a8a';
const INK_LIGHT = '#dcdcdc';
const INK_LINE = '#b0b0b0';

function SingleImageDiagram() {
  return (
    <svg viewBox="0 0 120 150">
      <rect x={20} y={14} width={80} height={62} fill={INK} />
      <rect x={30} y={84} width={60} height={4} fill={INK_LINE} />
      <rect x={42} y={96} width={36} height={30} fill={INK_LIGHT} />
      <rect x={38} y={134} width={44} height={3} fill={INK_LINE} />
    </svg>
  );
}

function PhotoEssayDiagram() {
  return (
    <svg viewBox="0 0 120 150">
      <rect x={30} y={10} width={60} height={4} fill={INK_LINE} />
      <rect x={14} y={22} width={92} height={44} fill={INK} />
      <rect x={14} y={74} width={92} height={3} fill={INK_LINE} />
      <rect x={14} y={81} width={70} height={3} fill={INK_LINE} />
      <rect x={14} y={96} width={92} height={44} fill={INK} />
      <rect x={14} y={148 - 10} width={50} height={3} fill={INK_LINE} />
    </svg>
  );
}

function EditorialDiagram() {
  return (
    <svg viewBox="0 0 120 150">
      <rect x={14} y={10} width={74} height={9} fill="#5a5a5a" />
      <rect x={14} y={30} width={92} height={46} fill={INK} />
      <rect x={14} y={84} width={92} height={3} fill={INK_LINE} />
      <rect x={14} y={92} width={92} height={3} fill={INK_LINE} />
      <rect x={14} y={100} width={92} height={3} fill={INK_LINE} />
      <rect x={14} y={108} width={70} height={3} fill={INK_LINE} />
      <rect x={14} y={120} width={92} height={3} fill={INK_LINE} />
      <rect x={14} y={128} width={56} height={3} fill={INK_LINE} />
    </svg>
  );
}

function ObjectStudyDiagram() {
  return (
    <svg viewBox="0 0 120 150">
      <rect x={18} y={14} width={84} height={76} fill={INK} />
      <line x1={30} y1={106} x2={90} y2={106} stroke={INK_LINE} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" />
      <line x1={38} y1={116} x2={82} y2={116} stroke={INK_LINE} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" />
    </svg>
  );
}

const DIAGRAMS: Record<PageStyle, () => JSX.Element> = {
  'single-image': SingleImageDiagram,
  'photo-essay': PhotoEssayDiagram,
  editorial: EditorialDiagram,
  'object-study': ObjectStudyDiagram,
};

const NONE_DESCRIPTION = 'The default look — no extra spacing or typography treatment. This is what every page used before page styles existed.';

const PAGE_STYLE_OPTIONS: { value: PageStyle; label: string; description: string }[] = [
  {
    value: 'single-image',
    label: 'Single Image',
    description:
      'For a page that\'s really just one photograph. Also reveals two extra optional fields below: a second "detail" photo, and a short note.',
  },
  {
    value: 'photo-essay',
    label: 'Photo Essay',
    description: 'More breathing room between photos and a quieter title — good when the writing is light and the photos should carry the page.',
  },
  {
    value: 'editorial',
    label: 'Editorial Article',
    description: 'A bigger, bolder title — good for a page with real writing in the body.',
  },
  {
    value: 'object-study',
    label: 'Object Study',
    description: 'The caption renders in a quiet serif, like a handwritten museum label — good for a single object, scan, or curiosity.',
  },
];

interface Props {
  value: PageStyle | undefined;
  onChange: (value: PageStyle | undefined) => void;
}

export default function PageStylePicker({ value, onChange }: Props) {
  const selectedDescription = value ? PAGE_STYLE_OPTIONS.find((opt) => opt.value === value)?.description : NONE_DESCRIPTION;

  return (
    <div>
      <p className="studio__pagestyle-hint">
        Purely visual — it changes spacing and typography once you fill in the title, image, and body fields below like
        normal. It never changes which template (Standard/Collage/Contact Sheet) you're using.
      </p>
      <div className="studio__pagestyle-grid">
        <button
          type="button"
          className={`studio__pagestyle-card${!value ? ' studio__pagestyle-card--active' : ''}`}
          onClick={() => onChange(undefined)}
        >
          <div className="studio__pagestyle-diagram studio__pagestyle-diagram--none">
            <span>—</span>
          </div>
          <strong>None</strong>
        </button>
        {PAGE_STYLE_OPTIONS.map((opt) => {
          const Diagram = DIAGRAMS[opt.value];
          return (
            <button
              key={opt.value}
              type="button"
              className={`studio__pagestyle-card${value === opt.value ? ' studio__pagestyle-card--active' : ''}`}
              onClick={() => onChange(opt.value)}
            >
              <div className="studio__pagestyle-diagram">
                <Diagram />
              </div>
              <strong>{opt.label}</strong>
            </button>
          );
        })}
      </div>
      {selectedDescription && <p className="studio__pagestyle-description">{selectedDescription}</p>}
    </div>
  );
}
