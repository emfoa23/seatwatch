function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const PALETTES = [
  ['#fb7185', '#7c3aed'],
  ['#34d399', '#0ea5e9'],
  ['#fbbf24', '#dc2626'],
  ['#a78bfa', '#ec4899'],
  ['#22d3ee', '#3b82f6'],
  ['#f97316', '#db2777'],
  ['#10b981', '#6366f1'],
  ['#facc15', '#7c2d12'],
];

export function Thumbnail({
  title,
  category,
  size = 64,
  wide = false,
}: {
  title: string;
  category?: string;
  size?: number;
  wide?: boolean;
}) {
  const h = hashStr(title);
  const [a, b] = PALETTES[h % PALETTES.length];
  const initials = title.replace(/[^A-Za-z0-9가-힣]/g, '').slice(0, 2) || '?';
  const w = wide ? size * 1.6 : size;
  const fontSize = Math.max(14, Math.floor(size * 0.4));

  return (
    <div
      className="thumbnail"
      style={{
        background: `linear-gradient(135deg, ${a}, ${b})`,
        width: w,
        height: size,
        minWidth: w,
        color: '#fff',
      }}
      aria-hidden="true"
    >
      <span className="thumbnail-mark" style={{ fontSize }}>{initials}</span>
      {category && <span className="thumbnail-tag">{category}</span>}
    </div>
  );
}
