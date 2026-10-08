/**
 * Kamera sistemi (brief FAZ 5 "Cameras", `docs/GAME_DESIGN.md` §6: "Jokey
 * Kamerası, Pist Kamerası, Son Düzlük Kamerası, Fotofiniş"). Saf matematik
 * — Three.js'e bağımlı değildir (bir `@react-three/fiber` bileşeni, bu
 * modülün ürettiği `CameraPose`'u okuyup gerçek `camera.position`/
 * `camera.lookAt` değerlerine uygular; bkz. `RaceScene3D.tsx`).
 */

import { loadCameraConfig } from '@at-sevdalisi/game-config';

export type CameraMode = 'track' | 'jockey' | 'final_straight' | 'photo_finish';

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vector3Like;
  lookAt: Vector3Like;
  /**
   * 08.10.2026 — takip gecikmesinin zaman sabiti (sn). Verilmezse
   * `camera.config.json → defaultFollowSeconds`. Jokey kamerası çok kısa
   * tutar: uzun gecikmede hızlı koşan at kadrajda ileri-geri "kayıyordu".
   */
  followSeconds?: number;
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
  /**
   * Liderin ve odak atın koşu yönü (radyan, 0 = +X) — 01.10.2026. Verilmezse
   * 0 kabul edilir (eski davranış: kamera hep -X tarafından bakar).
   */
  leaderHeadingRadians?: number;
  focusHeadingRadians?: number;
}

/**
 * Yayın kamerası (Pist Kamerası): iç saha tarafından, alçaktan, liderin
 * biraz önünden geriye — grubun ortasına — bakar; tribün atların arkasında
 * kalır (dış tarafta tribün olduğu için kamera oraya konamaz).
 */
const BROADCAST_CAMERA_HEIGHT_METERS = 5.5;
const BROADCAST_CAMERA_SIDE_OFFSET_METERS = 24;
const BROADCAST_CAMERA_AHEAD_OFFSET_METERS = 8;
const BROADCAST_CAMERA_LOOK_BEHIND_METERS = 9;
const JOCKEY_CAMERA = loadCameraConfig().jockeyCamera;
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
    case 'track': {
      // 01.10.2026: eskiden pist merkezine 45 m yukarıdan dik bakıyordu ve
      // ekranda yalnızca iç saha çimi görünüyordu. Artık TV yayını gibi
      // lideri iç saha tarafından takip eder.
      const leader = context.leaderPosition;
      const heading = context.leaderHeadingRadians ?? 0;
      const forwardX = Math.cos(heading);
      const forwardZ = Math.sin(heading);
      // Pistin İÇİNE doğru birim normal (heading 0 = +X → iç = +Z).
      const inwardX = -Math.sin(heading);
      const inwardZ = Math.cos(heading);
      return {
        position: {
          x:
            leader.x +
            inwardX * BROADCAST_CAMERA_SIDE_OFFSET_METERS +
            forwardX * BROADCAST_CAMERA_AHEAD_OFFSET_METERS,
          y: BROADCAST_CAMERA_HEIGHT_METERS,
          z:
            leader.z +
            inwardZ * BROADCAST_CAMERA_SIDE_OFFSET_METERS +
            forwardZ * BROADCAST_CAMERA_AHEAD_OFFSET_METERS,
        },
        lookAt: {
          x: leader.x - forwardX * BROADCAST_CAMERA_LOOK_BEHIND_METERS,
          y: leader.y,
          z: leader.z - forwardZ * BROADCAST_CAMERA_LOOK_BEHIND_METERS,
        },
      };
    }

    case 'jockey': {
      // 08.10.2026 — yarış oyunlarındaki takip kamerası: atın arkasından ve
      // üstünden, atın İLERİSİNE bakar (at kadrajın alt-ortasında, pist
      // önde). Eskisi atın 8 m arkasından alçaktan ata bakıyordu.
      const focus = context.focusHorsePosition;
      const heading = context.focusHeadingRadians ?? 0;
      const forwardX = Math.cos(heading);
      const forwardZ = Math.sin(heading);
      return {
        position: {
          x: focus.x - forwardX * JOCKEY_CAMERA.backMeters,
          y: JOCKEY_CAMERA.heightMeters,
          z: focus.z - forwardZ * JOCKEY_CAMERA.backMeters,
        },
        lookAt: {
          x: focus.x + forwardX * JOCKEY_CAMERA.lookAheadMeters,
          y: JOCKEY_CAMERA.lookHeightMeters,
          z: focus.z + forwardZ * JOCKEY_CAMERA.lookAheadMeters,
        },
        followSeconds: JOCKEY_CAMERA.followSeconds,
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

export const CAMERA_MODE_ORDER: CameraMode[] = [
  'track',
  'jockey',
  'final_straight',
  'photo_finish',
];
