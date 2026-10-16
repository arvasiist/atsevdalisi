/**
 * Atların yanal şeritleri (08.10.2026'da `RaceScene3D`ten çıkarıldı). Zaman
 * çizelgesi yalnızca pist üzerindeki MESAFEYİ taşır; hepsi merkez çizgide
 * çizilince yakın atlar iç içe geçerdi. Şerit yalnızca GÖRSELDİR — sonucu,
 * sırayı ya da HUD'u etkilemez (sunucu otoritesi).
 *
 * TEK KAYNAK: sahne atı bu konumda çizer, kamera da AYNI konumu takip eder.
 * Eskiden kamera şeritsiz (merkez çizgi) konumu izliyordu; takip edilen at
 * kadrajın kenarına düşüyor ve "kayıyordu".
 */
import { TRACK_WIDTH_METERS } from './track-dimensions';

/** Atlar arası yanal şerit aralığı — pist genişliğine sığacak şekilde daraltılır. */
const MAX_LANE_SPACING_METERS = 1.7;
const LANE_MARGIN_METERS = 3;

export function laneOffsetMeters(index: number, count: number): number {
  const spacing = Math.min(
    MAX_LANE_SPACING_METERS,
    (TRACK_WIDTH_METERS - LANE_MARGIN_METERS * 2) / Math.max(1, count - 1),
  );
  return (index - (count - 1) / 2) * spacing;
}

export interface LaneInput {
  x: number;
  z: number;
  headingRadians: number;
}

/** Şeride kaydırılmış dünya konumu. Pist dışına doğru birim normal: heading 0 = +X → dış = -Z. */
export function lanePosition(horse: LaneInput, index: number, count: number): { x: number; z: number } {
  const lane = laneOffsetMeters(index, count);
  return {
    x: horse.x + Math.sin(horse.headingRadians) * lane,
    z: horse.z - Math.cos(horse.headingRadians) * lane,
  };
}

/** Listedeki bir atın sahnede ÇİZİLDİĞİ konumu (kamera için). Bulunamazsa `null`. */
export function renderedPositionOf<T extends LaneInput & { horseId: string }>(
  horses: readonly T[],
  horseId: string | undefined,
): { x: number; z: number; headingRadians: number } | null {
  if (horseId === undefined) return null;
  const index = horses.findIndex((horse) => horse.horseId === horseId);
  if (index < 0) return null;
  const horse = horses[index]!;
  return { ...lanePosition(horse, index, horses.length), headingRadians: horse.headingRadians };
}
