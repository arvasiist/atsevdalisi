/**
 * Camera Director — Master Development Brief §17 "PHASE 8 — BROADCAST
 * CAMERA": "Race Event'lerine göre otomatik kamera seç." Bu dosya
 * `camera-presets.ts`'in 4 kamera modunu (Pist/Jokey/Son Düzlük/
 * Fotofiniş) DEĞİŞTİRMEZ — yalnızca HANGİ modun ne zaman otomatik
 * seçileceğine karar veren saf bir sınıflandırma katmanıdır.
 *
 * Brief'in önerdiği tam kamera listesi (START_CAMERA/SIDE_CAMERA/
 * LEADER_CAMERA/GROUP_CAMERA/TURN_CAMERA/CLOSEUP_CAMERA vb.) BİLEREK
 * bu turda eklenmedi — bunlar YENİ kamera pozisyon matematiği
 * gerektirir ve gerçek 3D pist/tribün geometrisi (Grup 2, asset kararı
 * bekleyen kapsam) geldiğinde çok daha anlamlı kalibre edilebilir; şimdi
 * eklemek `camera-presets.ts`'in kendi doc yorumundaki "gerçek pist
 * boyutları geldiğinde ince ayar gerektirebilir" notuyla aynı riski
 * taşırdı. Bu yüzden bu dilim, MEVCUT 4 mod arasında brief'in istediği
 * "event'e göre otomatik geçiş" davranışını sağlar — küçük, izole,
 * geri alınabilir bir adım (docs/IMPLEMENTATION_PLAN_MASTER_BRIEF.md
 * "Grup 1" maddesi).
 *
 * Mesafe eşikleri METRE cinsindendir (zaman değil) — bir yarışın
 * "final düzlüğü" gerçekte KALAN MESAFEYE göre tanımlıdır, sabit bir
 * zaman yüzdesine göre DEĞİL (atların hızı segment segment değiştiği
 * için zaman bazlı bir eşik yanlış anda tetiklenebilir).
 */

import type { CameraMode } from './camera-presets';

/** Brief §17'nin event isimlerine en yakın karşılık — dört kategoriye indirgendi (mevcut 4 kamera moduyla eşleştirilebilecek kadar). */
export type RaceCameraEvent = 'start' | 'normal' | 'overtake' | 'final_stretch' | 'finish';

export interface CameraDirectorInput {
  /** Lider atın kat ettiği mesafe (metre) — `RaceViewer.tsx`'in zaten hesapladığı `positionMeters`. */
  leaderPositionMeters: number;
  /** Yarışın toplam mesafesi (metre) — segment verisinden zaten türetiliyor (bkz. `RaceViewer.tsx`'in `raceDistanceMeters`). */
  raceDistanceMeters: number;
  /** Brief'in OVERTAKE event'i — şu an en az bir atın bir geçiş denemesinin bloklandığı an (bkz. `RaceSegmentSnapshot.blocked`, `domain/race/overtaking.ts`). */
  anyHorseBlocked: boolean;
  /** Yarış bitti mi (brief'in FINISH event'i). */
  isFinished: boolean;
}

/** Brief'in START event'i — yarışın ilk bu kadar metresi (start gate/ilk hamle vurgusu). */
export const START_PHASE_METERS = 50;
/** Brief'in FINAL_400/FINAL_200 event'lerine karşılık gelen tek eşik — "final düzlüğü" kamerasının devreye girdiği kalan mesafe. */
export const FINAL_STRETCH_REMAINING_METERS = 400;

/**
 * Saf sınıflandırma — aynı girdi her zaman aynı event'i döner
 * (`docs/RACE_ENGINE.md` §1 "sunum katmanı" determinizm ilkesiyle
 * tutarlı). Öncelik sırası: FINISH > START > FINAL_STRETCH > OVERTAKE >
 * NORMAL — bir yarışın aynı anda hem "start" hem "final düzlüğü" olması
 * (çok kısa mesafeli yarış) durumunda START önceliklidir, çünkü start
 * gerçekte daha erken gerçekleşen bir event'tir.
 */
export function classifyRaceCameraEvent(input: CameraDirectorInput): RaceCameraEvent {
  if (input.isFinished) {
    return 'finish';
  }
  if (input.leaderPositionMeters <= START_PHASE_METERS) {
    return 'start';
  }
  const remainingMeters = input.raceDistanceMeters - input.leaderPositionMeters;
  if (remainingMeters <= FINAL_STRETCH_REMAINING_METERS) {
    return 'final_stretch';
  }
  if (input.anyHorseBlocked) {
    return 'overtake';
  }
  return 'normal';
}

const EVENT_TO_CAMERA_MODE: Record<RaceCameraEvent, CameraMode> = {
  start: 'track',
  normal: 'track',
  // Mevcut 4 mod arasında "aksiyon"a en yakın olan Jokey Kamerası —
  // gerçek bir GROUP_CAMERA (brief'in önerdiği) henüz yok (yukarıdaki
  // doc yorumuna bkz.).
  overtake: 'jockey',
  final_stretch: 'final_straight',
  finish: 'photo_finish',
};

/** `classifyRaceCameraEvent` + event→mod eşlemesi — Camera Director'ın tek genel amaçlı girişi. */
export function selectAutomaticCameraMode(input: CameraDirectorInput): CameraMode {
  return EVENT_TO_CAMERA_MODE[classifyRaceCameraEvent(input)];
}
