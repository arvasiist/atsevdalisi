import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HORSE_ANATOMY,
  JOCKEY_POSE,
  buildLoftGeometry,
  gallopLegPose,
  getHorseGeometries,
  getJockeyGeometries,
  pollInNeckFrame,
} from '../../../src/features/race-viewer/horse-geometry';

/**
 * Prosedürel at (10.10.2026, görsel C1): ölçüler gerçeğe yakın, toynaklar
 * zemine basar, geometri paylaşılır, dörtnal pozu eklem kuralına uyar.
 */
function box(geometry: THREE.BufferGeometry): THREE.Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.clone();
}

describe('prosedürel at geometrisi', () => {
  const g = getHorseGeometries();

  it('geometriler paylaşılır (her at aynı nesneyi kullanır)', () => {
    expect(getHorseGeometries()).toBe(g);
    expect(getJockeyGeometries()).toBe(getJockeyGeometries());
  });

  it('gövde ölçüleri gerçeğe yakın: sırt ~1.6 m, karın ~0.85 m, boy ~1.8 m, en ~0.7 m', () => {
    const torso = box(g.torso);
    expect(torso.max.y).toBeGreaterThan(1.5);
    expect(torso.max.y).toBeLessThan(1.7);
    expect(torso.min.y).toBeGreaterThan(0.75);
    expect(torso.min.y).toBeLessThan(0.95);
    expect(torso.max.x - torso.min.x).toBeGreaterThan(1.6);
    expect(torso.max.x - torso.min.x).toBeLessThan(2.1);
    expect(torso.max.z - torso.min.z).toBeGreaterThan(0.55);
    expect(torso.max.z - torso.min.z).toBeLessThan(0.8);
  });

  it('ense cidagodan yüksekte ve önde; baş burna doğru iner', () => {
    const [pollX, pollY] = pollInNeckFrame();
    const pollWorldY = HORSE_ANATOMY.neckPivot[1] + pollY;
    expect(pollWorldY).toBeGreaterThan(1.8);
    expect(HORSE_ANATOMY.neckPivot[0] + pollX).toBeGreaterThan(0.83);
    const head = box(g.head);
    expect(head.min.y).toBeLessThan(-0.3);
    expect(head.max.x).toBeGreaterThan(0.5);
  });

  it('dört toynak da zemine basar (taban y ≈ 0)', () => {
    const fore = HORSE_ANATOMY.foreLeg;
    const hind = HORSE_ANATOMY.hindLeg;
    const foreBottom = fore.pivot[1] - fore.upperLength + box(g.foreHoof).min.y;
    const hindBottom = hind.pivot[1] + hind.hock[1] + box(g.hindHoof).min.y;
    expect(Math.abs(foreBottom)).toBeLessThan(0.02);
    expect(Math.abs(hindBottom)).toBeLessThan(0.02);
  });

  it('jokeyin elleri dizginlerin ucunda (atın gövde çerçevesinde)', () => {
    const mount = [0.15, 1.75];
    const handWorld = [mount[0]! + JOCKEY_POSE.hand[0], mount[1]! + JOCKEY_POSE.hand[1]];
    const reins = box(g.reins);
    const reinEndWorld = [HORSE_ANATOMY.neckPivot[0] + reins.min.x, HORSE_ANATOMY.neckPivot[1] + reins.max.y];
    expect(Math.hypot(handWorld[0]! - reinEndWorld[0]!, handWorld[1]! - reinEndWorld[1]!)).toBeLessThan(0.15);
  });

  it('jokey eyerin üstünde: ayak (üzengi) karnın üstünde, baş atın sırtının üstünde', () => {
    const boots = box(getJockeyGeometries().boots);
    expect(1.75 + boots.min.y).toBeGreaterThan(box(g.torso).min.y);
    expect(1.75 + JOCKEY_POSE.head[1]).toBeGreaterThan(box(g.torso).max.y + 0.3);
  });

  it('loft geometrisi geçerli: NaN yok, normal ve uv var, kapalı uçlar', () => {
    const geometry = buildLoftGeometry(HORSE_ANATOMY.tail, 8, 3);
    const positions = geometry.getAttribute('position').array as Float32Array;
    expect(positions.every((value) => Number.isFinite(value))).toBe(true);
    expect(geometry.getAttribute('normal')).toBeDefined();
    expect(geometry.getAttribute('uv')).toBeDefined();
    expect(geometry.getIndex()!.count % 3).toBe(0);
  });
});

describe('dörtnal bacak pozu', () => {
  it('diz/sekiz yalnızca salınım evresinde bükülür; destek evresinde bacak düz', () => {
    for (let step = 0; step < 100; step += 1) {
      const phase = step / 100;
      const angle = phase * Math.PI * 2;
      const fore = gallopLegPose(phase, false);
      const hind = gallopLegPose(phase, true);
      if (Math.cos(angle) <= 0) {
        expect(fore.flex).toBeCloseTo(0);
        expect(hind.flex).toBeCloseTo(0);
      } else {
        // Ön diz toynağı geri (−), arka sekiz ileri (+) katlar.
        expect(fore.flex).toBeLessThan(0);
        expect(hind.flex).toBeGreaterThan(0);
      }
      expect(Math.abs(fore.swing)).toBeLessThanOrEqual(0.6);
      expect(Math.abs(hind.swing)).toBeLessThanOrEqual(0.6);
    }
  });
});
