'use client';

/**
 * Gerçek at/jokey 3D modelleri (Faz 3, `docs/GAME_DESIGN.md` §5) veya bir
 * portre illüstrasyonu YOK — proje sahibinin görsel kalite planında da
 * belirtildiği gibi asset üretim hattı kararı henüz VERİLMEDİ (bkz.
 * `docs/ARCHITECTURE.md`/`docs/ROADMAP.md` "Açık kararlar"). Bu bileşen o
 * karar verilene kadar kullanılan, atın kimliğinden (id) türetilmiş
 * DETERMİNİSTİK bir renk rozeti — her at her zaman AYNI rengi alır, ama
 * bu asla "gerçek görsel" olduğu iddiasında değildir.
 */
export interface HorseAvatarProps {
  horseId: string;
  size?: number;
}

const DEFAULT_SIZE_PX = 56;
const HUE_MODULO = 360;
const SATURATION_PERCENT = 62;
const LIGHTNESS_PERCENT = 38;

function hueFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash % HUE_MODULO;
}

export function HorseAvatar({ horseId, size = DEFAULT_SIZE_PX }: HorseAvatarProps): React.ReactElement {
  const hue = hueFromId(horseId);
  const background = `linear-gradient(135deg, hsl(${hue}, ${SATURATION_PERCENT}%, ${LIGHTNESS_PERCENT}%), hsl(${hue}, ${SATURATION_PERCENT}%, ${Math.max(LIGHTNESS_PERCENT - 16, 10)}%))`;

  return (
    <div
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        borderRadius: '50%',
        background,
        border: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${Math.round(size * 0.5)}px`,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
      }}
    >
      🐴
    </div>
  );
}
