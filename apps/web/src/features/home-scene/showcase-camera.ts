/**
 * ANA SAYFA VİTRİN KAMERASI (01.10.2026) — saf fonksiyonlar, three.js yok.
 *
 * Çekimler `config/camera.config.json` → `homeShowcase`tan gelir. Bir
 * çekim süresince kamera `from`dan `to`ya yumuşakça kayar (dolly); çekimin
 * son `blendSeconds` saniyesinde konum, bakış noktası ve görüş açısı bir
 * sonraki çekimin başlangıcına `smoothstep` ile karışır — sert kesme yok.
 * Konumlar ata GÖRE verilir; dünyaya çevirmek çağıranın işidir (`anchor`).
 */

import type { CameraConfig } from '@at-sevdalisi/game-config';

export type Vec3 = [number, number, number];
export type ShowcaseShot = CameraConfig['homeShowcase']['shots'][number];

export interface ShowcaseCameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
  /** Şu an "sahnede" olan çekim (geçişte gidilen çekim, karışım > 0.5 ise). */
  shotIndex: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** 0..1 → 0..1, uçlarda hızı sıfır (yumuşak giriş/çıkış). */
export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function totalShowcaseDuration(shots: readonly ShowcaseShot[]): number {
  return shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
}

/** Bir çekimin başladığı an (döngü başına göre). */
export function shotStartTime(shots: readonly ShowcaseShot[], index: number): number {
  let time = 0;
  for (let i = 0; i < index && i < shots.length; i += 1) time += shots[i]!.durationSeconds;
  return time;
}

function poseWithinShot(
  shot: ShowcaseShot,
  progress: number,
): Omit<ShowcaseCameraPose, 'shotIndex'> {
  return {
    position: lerpVec(shot.from, shot.to, smoothstep(progress)),
    target: shot.target,
    fov: shot.fov,
  };
}

/**
 * `timeSeconds` anındaki kamera pozu. Zaman döngüseldir (son çekimden sonra
 * ilk çekime dönülür). `blendSeconds` çekim süresinin yarısını aşamaz.
 */
export function evaluateShowcaseCamera(
  timeSeconds: number,
  shots: readonly ShowcaseShot[],
  blendSeconds: number,
): ShowcaseCameraPose {
  if (shots.length === 0) {
    return { position: [0, 2, 6], target: [0, 1, 0], fov: 40, shotIndex: 0 };
  }
  const total = totalShowcaseDuration(shots);
  let t = ((timeSeconds % total) + total) % total;
  let index = 0;
  while (index < shots.length - 1 && t >= shots[index]!.durationSeconds) {
    t -= shots[index]!.durationSeconds;
    index += 1;
  }
  const shot = shots[index]!;
  const current = poseWithinShot(shot, t / shot.durationSeconds);
  const blend = Math.min(blendSeconds, shot.durationSeconds / 2);
  const blendStart = shot.durationSeconds - blend;
  if (blend <= 0 || t < blendStart || shots.length === 1) {
    return { ...current, shotIndex: index };
  }
  const nextIndex = (index + 1) % shots.length;
  const next = poseWithinShot(shots[nextIndex]!, 0);
  const mix = smoothstep((t - blendStart) / blend);
  return {
    position: lerpVec(current.position, next.position, mix),
    target: lerpVec(current.target, next.target, mix),
    fov: lerp(current.fov, next.fov, mix),
    shotIndex: mix > 0.5 ? nextIndex : index,
  };
}

/** Ata göre konumu dünyaya çevirir (atın yönü `headingRadians`, Y ekseni etrafında). */
export function toWorld(local: Vec3, anchor: Vec3, headingRadians: number): Vec3 {
  const cos = Math.cos(headingRadians);
  const sin = Math.sin(headingRadians);
  // Sahne grubu `rotation.y = -heading` ile döner (RaceScene3D ile aynı kural).
  return [
    anchor[0] + local[0] * cos - local[2] * sin,
    anchor[1] + local[1],
    anchor[2] + local[0] * sin + local[2] * cos,
  ];
}

/**
 * Dikey (portre) ekranda yatay görüş daralır ve at kadrajdan taşar. Çekim
 * açıları `referenceAspect` (16:9) için yazılmıştır; daha dar ekranda dikey
 * görüş açısı, AYNI yatay kapsamı koruyacak kadar genişletilir (`maxFov`
 * ile sınırlı). Geniş ekranda değişmez.
 */
export function fitFovToAspect(
  fov: number,
  aspect: number,
  referenceAspect: number,
  maxFov: number,
): number {
  if (aspect >= referenceAspect || aspect <= 0) return fov;
  const halfRad = (fov * Math.PI) / 360;
  const widened = (Math.atan(Math.tan(halfRad) * (referenceAspect / aspect)) * 360) / Math.PI;
  return Math.min(maxFov, widened);
}
