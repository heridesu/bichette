import type { LinkSpec, LinkType } from './types';

interface Props {
  value: LinkSpec;
  collections: string[];
  onChange: (link: LinkSpec) => void;
  compact?: boolean;
}

export default function LinkEditor({ value, collections, onChange, compact }: Props) {
  return (
    <>
      <div className="studio__field">
        {!compact && <label>Links to</label>}
        <select
          value={value.type}
          onChange={(e) => {
            const type = e.target.value as LinkType;
            if (type === 'collection') onChange({ type, slug: collections[0] ?? '' });
            else if (type === 'url') onChange({ type, href: '' });
            else onChange({ type });
          }}
        >
          <option value="entry">Its own page</option>
          <option value="collection">A collection</option>
          <option value="url">External URL</option>
          <option value="lightbox">Full image (click to enlarge)</option>
          <option value="none">Nowhere</option>
        </select>
      </div>

      {value.type === 'collection' && (
        <div className="studio__field">
          {!compact && <label>Collection</label>}
          {collections.length > 0 ? (
            <select value={value.slug ?? ''} onChange={(e) => onChange({ ...value, slug: e.target.value })}>
              {collections.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input value={value.slug ?? ''} onChange={(e) => onChange({ ...value, slug: e.target.value })} placeholder="collection name" />
          )}
        </div>
      )}

      {value.type === 'url' && (
        <div className="studio__field">
          {!compact && <label>URL</label>}
          <input value={value.href ?? ''} onChange={(e) => onChange({ ...value, href: e.target.value })} placeholder="https://…" />
        </div>
      )}
    </>
  );
}
