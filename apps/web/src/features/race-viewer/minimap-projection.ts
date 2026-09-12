/**
 * Mini harita izdüşümü (brief `docs/GAME_DESIGN.md` §6: "mini harita").
 * `track-path.ts`'in ürettiği 3D pist koordinatlarını, bir SVG mini
 * haritasında çizilebilecek yüzde bazlı 2D koordinatlara (0-100 aralığı)
 * çevirir. Saf matematik — hiçbir render kütüphanesine bağımlı değildir.
 */

import type { StadiumTrackGeometry, TrackPathPoint } from './track-path';

export interface MiniMapPoint {
  /** Mini haritanın genişliğine göre yüzde (0-100). */
  xPercent: number;
  /** Mini haritanın yüksekliğine göre yüzde (0-100). */
  yPercent: number;
}

const DEFAULT_PADDING_PERCENT = 12;

/**
 * Bir pist noktasını (`x`, `z`) mini haritanın 0-100 yüzde uzayına
 * ölçekler; `paddingPercent` kadar kenar boşluğu bırakır (çizgiler mini
 * haritanın tam kenarına yapışmasın diye).
 */
export function projectToMiniMap(
  point: TrackPathPoint,
  geometry: StadiumTrackGeometry,
  paddingPercent: number = DEFAULT_PADDING_PERCENT,
): MiniMapPoint {
  const halfWidth = geometry.straightLengthMeters / 2 + geometry.turnRadiusMeters;
  const halfHeight = geometry.turnRadiusMeters;
  const usableHalfRange = 50 - paddingPercent;

  const xPercent = 50 + safeRatio(point.x, halfWidth) * usableHalfRange;
  const yPercent = 50 + safeRatio(point.z, halfHeight) * usableHalfRange;

  return { xPercent, yPercent };
}

function safeRatio(value: number, divisor: number): number {
  if (divisor === 0) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value / divisor));
}
