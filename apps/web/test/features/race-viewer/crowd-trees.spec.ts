import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE, createCrowdFigureGeometries, writeCrowdFigure } from '../../../src/features/race-viewer/crowd-figures';
import { createConiferCrown, createDeciduousCrown } from '../../../src/features/race-viewer/tree-geometry';

/**
 * Ortam gerçekçiliği (08.10.2026): seyirci figürü (gövde + baş + saç +
 * kollar) ve iki ağaç türü. Görsel doğrulama tarayıcıdadır; burada yalnızca
 * kırılmaması gerekenler: kol omuzdan ÖNE ve YUKARI kalkar (seyirci piste,
 * +Z'ye bakar), baş gövdenin üstündedir, ağaç geometrisi determinist ve
 * köşe rengi taşır.
 */
describe('seyirci figürü', () => {
  function meshes() {
    const geometries = createCrowdFigureGeometries();
    const make = (geometry: THREE.BufferGeometry) => new THREE.InstancedMesh(geometry, undefined, 1);
    return { body: make(geometries.body), head: make(geometries.head), hair: make(geometries.hair), arms: make(geometries.arms) };
  }
  const pose = { x: 10, y: 2, z: -30, yaw: 0, scale: 1 };

  it('baş gövdenin üstünde, saç başın üstündedir; kalkma (lift) hepsini taşır', () => {
    const m = meshes();
    writeCrowdFigure(m, 0, pose, 0.25, 0);
    const at = (mesh: THREE.InstancedMesh) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      return new THREE.Vector3().setFromMatrixPosition(matrix);
    };
    expect(at(m.body).y).toBeCloseTo(2.25);
    expect(at(m.head).y).toBeCloseTo(2.25 + FIGURE.headY);
    expect(at(m.hair).y).toBeGreaterThan(at(m.head).y);
  });

  it('kollar aşağıdayken el omzun altında; kalkınca omzun üstünde ve önde (+Z)', () => {
    const m = meshes();
    const handOf = (armRaise: number) => {
      writeCrowdFigure(m, 0, pose, 0, armRaise);
      const matrix = new THREE.Matrix4();
      m.arms.getMatrixAt(0, matrix);
      // Kolun ucu: omuzdan kol boyu kadar aşağı (yerel).
      return new THREE.Vector3(FIGURE.shoulderX, -(FIGURE.armLength + 2 * FIGURE.armRadius), 0).applyMatrix4(matrix);
    };
    const shoulderY = pose.y + FIGURE.shoulderY;
    expect(handOf(0).y).toBeLessThan(shoulderY);
    const raised = handOf(2.6);
    expect(raised.y).toBeGreaterThan(shoulderY);
    expect(raised.z).toBeGreaterThan(pose.z);
  });
});

describe('ağaç geometrisi', () => {
  it('iki tür de determinist, köşe rengi taşır ve renk alttan üste açılır', () => {
    for (const build of [createDeciduousCrown, createConiferCrown]) {
      const a = build();
      const b = build();
      expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
      const position = a.getAttribute('position');
      const color = a.getAttribute('color');
      expect(color.count).toBe(position.count);
      let lowest = 0;
      let highest = 0;
      for (let i = 1; i < position.count; i += 1) {
        if (position.getY(i) < position.getY(lowest)) lowest = i;
        if (position.getY(i) > position.getY(highest)) highest = i;
      }
      expect(color.getX(highest)).toBeGreaterThan(color.getX(lowest));
    }
  });
});
