/**
 * Kamera sistemi (brief FAZ 5 "Cameras", `docs/GAME_DESIGN.md` §6: "Jokey
 * Kamerası, Pist Kamerası, Son Düzlük Kamerası, Fotofiniş"). Saf matematik
 * — Three.js'e bağımlı değildir (bir `@react-three/fiber` bileşeni, bu
 * modülün ürettiği `CameraPose`'u okuyup gerçek `camera.position`/
 * `camera.lookAt` değerlerine uygular; bkz. `RaceScene3D.tsx`).
 */

export type CameraMode = 'track' | 'jockey' | 'final_straight' | 'photo_finish';

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vector3Like;
  lookAt: Vector3Like;
}

export interface CameraContext {
  /** O anki lider atın konumu (fotofiniş kamerasının odaklandığı at). */
  leaderPosition: Vector3Like;
  /** Jokey kamerasının takip ettiği at (oyuncunun atı, yoksa lider). */
  focusHorsePosition: Vector3Like;
  /** Pistin merkez noktası (Pist Kamerası'nın baktığı sabit nokta). */
  trackCenter: Vector3Like;
  /** Bitiş çizgisinin konumu (Son Düzlük ve Fotofiniş kameraları için). */
  finishLinePosition: Vector3Like;
}

const TRACK_CAMERA_HEIGHT_METERS = 45;
const JOCKEY_CAMERA_HEIGHT_METERS = 3;
const JOCKEY_CAMERA_BACK_OFFSET_METERS = 8;
const FINAL_STRAIGHT_CAMERA_HEIGHT_METERS = 6;
const FINAL_STRAIGHT_CAMERA_BACK_OFFSET_METERS = 24;
const FINAL_STRAIGHT_CAMERA_SIDE_OFFSET_METERS = 12;
const PHOTO_FINISH_CAMERA_HEIGHT_METERS = 1.5;
const PHOTO_FINISH_CAMERA_SIDE_OFFSET_METERS = 4;

/**
 * Verilen kamera moduna göre kamera konumunu/bakış noktasını hesaplar.
 * Saf bir fonksiyondur: aynı `mode` + `context` her zaman aynı `CameraPose`
 * üretir (determinism, `docs/RACE_ENGINE.md` §7 ilkesiyle tutarlı bir
 * "sunum katmanı" garantisi).
 */
export function computeCameraPose(mode: CameraMode, context: CameraContext): CameraPose {
  switch (mode) {
    case 'track':
      return {
        position: { x: context.trackCenter.x, y: TRACK_CAMERA_HEIGHT_METERS, z: context.trackCenter.z },
        lookAt: context.trackCenter,
      };

    case 'jockey': {
      const focus = context.focusHorsePosition;
      return {
        position: {
          x: focus.x - JOCKEY_CAMERA_BACK_OFFSET_METERS,
          y: JOCKEY_CAMERA_HEIGHT_METERS,
          z: focus.z,
        },
        lookAt: focus,
      };
    }

    case 'final_straight':
      return {
        position: {
          x: context.finishLinePosition.x - FINAL_STRAIGHT_CAMERA_BACK_OFFSET_METERS,
          y: FINAL_STRAIGHT_CAMERA_HEIGHT_METERS,
          z: context.finishLinePosition.z + FINAL_STRAIGHT_CAMERA_SIDE_OFFSET_METERS,
        },
        lookAt: context.finishLinePosition,
      };

    case 'photo_finish':
      return {
        position: {
          x: context.finishLinePosition.x,
          y: PHOTO_FINISH_CAMERA_HEIGHT_METERS,
          z: context.finishLinePosition.z + PHOTO_FINISH_CAMERA_SIDE_OFFSET_METERS,
        },
        lookAt: context.leaderPosition,
      };

    default: {
      const exhaustiveCheck: never = mode;
      throw new Error(`Bilinmeyen kamera modu: ${String(exhaustiveCheck)}`);
    }
  }
}

/** UI'da kamera seçim butonları için sıralı liste ve Türkçe etiketler. */
export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  track: 'Pist Kamerası',
  jockey: 'Jokey Kamerası',
  final_straight: 'Son Düzlük Kamerası',
  photo_finish: 'Fotofiniş',
};

export const CAMERA_MODE_ORDER: CameraMode[] = ['track', 'jockey', 'final_straight', 'photo_finish'];
