import { HEAD_PATH, MANE_PATH } from '../../components/ui/HorseHeadIcon';
import { PWA_BACKGROUND } from './pwa';

/**
 * İkon görseli — `next/og` (satori) ile PNG'ye çevrilir. Logo ölçünün %62'si:
 * "maskable" ikonlarda güvenli bölge (merkezdeki %80'lik daire) içinde kalır.
 */
export function PwaIconImage({ size }: { size: number }): React.ReactElement {
  const logo = Math.round(size * 0.62);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: PWA_BACKGROUND,
      }}
    >
      <svg width={logo} height={logo} viewBox="0 0 64 64">
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7dc8a" />
            <stop offset="1" stopColor="#b8862b" />
          </linearGradient>
        </defs>
        <path d={MANE_PATH} fill="url(#gold)" opacity={0.75} />
        <path d={HEAD_PATH} fill="url(#gold)" fillRule="evenodd" />
      </svg>
    </div>
  );
}
