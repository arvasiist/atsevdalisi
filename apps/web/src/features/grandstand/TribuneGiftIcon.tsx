/**
 * Tribün hediyesi simgesi (08.10.2026). Config'teki Unicode simge kullanılır;
 * Unicode'da karşılığı olmayan NAL burada SVG olarak çizilir (dosya değil —
 * CLAUDE.md kural 8: varlık dosyası uydurulmaz).
 */
export function TribuneGiftIcon({
  giftKey,
  emoji,
  size = 28,
}: {
  giftKey: string;
  emoji: string;
  size?: number;
}): React.ReactElement {
  if (giftKey === 'horseshoe') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Altın Nal">
        <defs>
          <linearGradient id="tribune-horseshoe-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7dc8a" />
            <stop offset="100%" stopColor="#b8862b" />
          </linearGradient>
        </defs>
        <path
          d="M7 6 C 4 14, 5 24, 16 27 C 27 24, 28 14, 25 6 L 20.5 6 C 23 13, 22 20.5, 16 22 C 10 20.5, 9 13, 11.5 6 Z"
          fill="url(#tribune-horseshoe-gold)"
          stroke="#7a5a17"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {[
          [8.4, 10],
          [8.6, 15.5],
          [10.4, 20.5],
          [23.6, 10],
          [23.4, 15.5],
          [21.6, 20.5],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill="#5b4210" />
        ))}
      </svg>
    );
  }
  return (
    <span aria-hidden="true" style={{ fontSize: size * 0.85, lineHeight: 1 }}>
      {emoji}
    </span>
  );
}
