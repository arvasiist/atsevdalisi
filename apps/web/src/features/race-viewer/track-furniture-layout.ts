/**
 * İç saha ışık kulelerinin yerleşimi (10.10.2026, görsel P1-8) — saf.
 *
 * Yayın kamerası ("Pist Kamerası") lideri iç saha tarafından
 * `BROADCAST_CAMERA_SIDE_OFFSET_METERS` uzaktan izler. Kuleler eskiden iç
 * korkuluğun 8 m içindeydi — tam kamera ile atlar arasında — ve atlar kule
 * hizasından geçerken kalın direk kadrajın önüne giriyordu. Artık kuleler
 * kamera koridorunun (lider pistin herhangi bir şeridindeyken) GERİSİNE,
 * iç sahanın ortasına doğru dikilir.
 */
import { BROADCAST_CAMERA_SIDE_OFFSET_METERS } from './camera-presets';
import { TRACK_WIDTH_METERS } from './track-dimensions';
import type { StadiumTrackGeometry } from './track-path';

/** Kamera koridorunun iç sınırı ile kule arasındaki pay (metre). */
export const LIGHT_TOWER_CLEARANCE_METERS = 6;

/** Kule merkezinin pist merkez çizgisinden içeri uzaklığı. */
export function lightTowerInsetMeters(): number {
  return BROADCAST_CAMERA_SIDE_OFFSET_METERS + TRACK_WIDTH_METERS / 2 + LIGHT_TOWER_CLEARANCE_METERS;
}

/** İki düzlüğün iç saha tarafında beş kule ([x, z]). İç saha çok darsa kule yok. */
export function lightTowerPositions(geometry: StadiumTrackGeometry): Array<[number, number]> {
  const z = geometry.turnRadiusMeters - lightTowerInsetMeters();
  if (z <= 0) return [];
  const half = geometry.straightLengthMeters / 2;
  return [
    [-half * 0.6, -z],
    [0, -z],
    [half * 0.6, -z],
    [-half * 0.6, z],
    [half * 0.6, z],
  ];
}
