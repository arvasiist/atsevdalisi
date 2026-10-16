/**
 * 2B AVATAR PORTRESİ (07.10.2026) — profil/listeler için. Her kartta ayrı
 * WebGL bağlamı açmamak için 3D değil SVG'dir (CLAUDE.md (18) ile aynı karar).
 */
import type { AvatarAppearance } from '@at-sevdalisi/shared-types';
import { avatarColors } from './avatar-catalog';

export function AvatarPortrait({
  appearance,
  size = 72,
  label,
}: {
  appearance: AvatarAppearance;
  size?: number;
  label: string;
}): React.ReactElement {
  const c = avatarColors(appearance);
  const hairPath: Record<string, string> = {
    short: 'M26 34 Q50 10 74 34 L74 30 Q50 6 26 30 Z',
    curly: 'M22 36 Q24 14 40 14 Q50 4 60 14 Q76 14 78 36 Q70 22 50 22 Q30 22 22 36 Z',
    long: 'M24 34 Q50 6 76 34 L78 70 L70 70 L70 36 Q50 22 30 36 L30 70 L22 70 Z',
    ponytail: 'M26 34 Q50 8 74 34 L74 30 Q50 4 26 30 Z M72 40 Q86 52 78 66 L74 64 Q80 52 70 44 Z',
    bald: '',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label} className="avatar-portrait">
      <circle cx="50" cy="50" r="49" fill="#1c2640" />
      <path d="M18 100 Q20 70 50 68 Q80 70 82 100 Z" fill={c.outfit} />
      <rect x="44" y="56" width="12" height="12" fill={c.skin} />
      <circle cx="50" cy="42" r="22" fill={c.skin} />
      {hairPath[appearance.hairStyle] ? <path d={hairPath[appearance.hairStyle]} fill={c.hair} /> : null}
      <circle cx="42" cy="44" r="2.4" fill="#1a1410" />
      <circle cx="58" cy="44" r="2.4" fill="#1a1410" />
      {appearance.accessory === 'glasses' ? (
        <g fill="none" stroke="#111" strokeWidth="1.6">
          <circle cx="42" cy="44" r="5" />
          <circle cx="58" cy="44" r="5" />
          <path d="M47 44 H53" />
        </g>
      ) : null}
      {appearance.hat === 'fedora' ? (
        <g fill={c.outfit}>
          <rect x="22" y="22" width="56" height="4" rx="2" />
          <rect x="32" y="10" width="36" height="14" rx="4" />
        </g>
      ) : appearance.hat === 'cap' || appearance.hat === 'flatcap' ? (
        <path d="M27 30 Q50 6 73 30 L84 32 L27 32 Z" fill={c.outfit} />
      ) : appearance.hat === 'tophat' ? (
        <g>
          <rect x="24" y="23" width="52" height="4" rx="2" fill="#16161c" />
          <rect x="34" y="2" width="32" height="23" rx="2" fill="#16161c" />
          <rect x="34" y="19" width="32" height="4" fill={c.outfit} />
        </g>
      ) : appearance.hat === 'bowler' ? (
        <g fill="#1d1a17">
          <rect x="25" y="25" width="50" height="4" rx="2" />
          <path d="M31 27 Q31 8 50 8 Q69 8 69 27 Z" />
        </g>
      ) : null}
      {appearance.accessory === 'medal' ? <circle cx="50" cy="84" r="5" fill="#d4af37" /> : null}
      {appearance.accessory === 'scarf' ? <rect x="34" y="64" width="32" height="7" rx="3" fill="#e8dcc0" /> : null}
      {appearance.accessory === 'bowtie' ? (
        <g fill="#7a1424">
          <path d="M50 70 L38 64 L38 76 Z" />
          <path d="M50 70 L62 64 L62 76 Z" />
          <circle cx="50" cy="70" r="2.6" />
        </g>
      ) : null}
      {appearance.accessory === 'binoculars' ? (
        <g>
          <path d="M40 66 Q50 74 60 66" fill="none" stroke="#3a2a1a" strokeWidth="1.4" />
          <rect x="40" y="76" width="8" height="11" rx="2" fill="#2b2b30" />
          <rect x="52" y="76" width="8" height="11" rx="2" fill="#2b2b30" />
          <rect x="47" y="79" width="6" height="3" fill="#2b2b30" />
        </g>
      ) : null}
    </svg>
  );
}
