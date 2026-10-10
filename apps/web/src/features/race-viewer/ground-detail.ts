/**
 * Zemin ayrıntısı kararları (10.10.2026, görsel B2) — saf (three/DOM yok).
 * Değerler `vfx.config.json` → `ground`. `TrackScenery` bu fonksiyonları
 * doku tekrarı ve pist kesiti için kullanır; biçme şeridi formülü çim
 * malzemesinin GLSL'iyle AYNIDIR (`MOWING_GLSL`) — test bu fonksiyonu sınar.
 */
import type { VfxConfig } from '@at-sevdalisi/game-config';

export type GroundDetailConfig = VfxConfig['ground'];

/** Dünyada `sizeMeters` uzunluğu kaplamak için doku tekrarı (en az 1). */
export function textureRepeat(sizeMeters: number, tileMeters: number): number {
  if (!(tileMeters > 0)) return 1;
  return Math.max(1, sizeMeters / tileMeters);
}

/**
 * Biçme şeridi parlaklık çarpanı: z ekseninde (düzlüklere paralel) şerit
 * şerit `1 ± contrast/2`; merkezden `fadeMeters`e doğru 1'e söner.
 */
export function mowingStripeFactor(x: number, z: number, config: GroundDetailConfig): number {
  if (config.mowingContrast <= 0 || config.mowingStripeMeters <= 0) return 1;
  const band = Math.floor(z / config.mowingStripeMeters) % 2 === 0 ? 1 : -1;
  const distance = Math.hypot(x, z);
  const fade = 1 - smoothstep(config.mowingFadeMeters * 0.6, config.mowingFadeMeters, distance);
  return 1 + band * (config.mowingContrast / 2) * fade;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Pist kesitindeki yanal duraklar (merkezden metre) ve her durağın ton
 * çarpanı: kenar bantları (çime/korkuluğa yakın sıkışmış toprak) koyu,
 * orta parlak. Yarım genişlikten küçük bant iki durağa düşer.
 */
export function trackCrossSection(
  halfWidthMeters: number,
  edgeBandMeters: number,
): Array<{ offset: number; shade: number }> {
  const band = Math.min(Math.max(0, edgeBandMeters), halfWidthMeters * 0.45);
  if (band === 0) {
    return [
      { offset: -halfWidthMeters, shade: 1 },
      { offset: halfWidthMeters, shade: 1 },
    ];
  }
  return [
    { offset: -halfWidthMeters, shade: 0.78 },
    { offset: -halfWidthMeters + band, shade: 0.96 },
    { offset: 0, shade: 1.04 },
    { offset: halfWidthMeters - band, shade: 0.96 },
    { offset: halfWidthMeters, shade: 0.8 },
  ];
}

/**
 * Çim malzemesine eklenen GLSL (`onBeforeCompile`): `mowingStripeFactor`
 * ile birebir aynı formül. Uniform adları `uMowing*`.
 */
export const MOWING_GLSL = /* glsl */ `
float mowingStripeFactor(vec3 world) {
  if (uMowingContrast <= 0.0 || uMowingStripe <= 0.0) return 1.0;
  float band = mod(floor(world.z / uMowingStripe), 2.0) < 0.5 ? 1.0 : -1.0;
  float fade = 1.0 - smoothstep(uMowingFade * 0.6, uMowingFade, length(world.xz));
  return 1.0 + band * (uMowingContrast * 0.5) * fade;
}
`;
