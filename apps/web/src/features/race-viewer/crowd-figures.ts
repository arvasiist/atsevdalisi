/**
 * TRİBÜN SEYİRCİ FİGÜRLERİ (08.10.2026, sahibinin isteği: "tribündeki
 * insanları gerçekçi yapalım"). Eskiden her seyirci tek renkli bir KUTUYDU.
 * Artık dört parçalı bir figürdür — gövde (giysi rengi), baş (ten rengi), saç
 * (saç rengi; bazıları şapkalı görünür) ve iki kol (giysi rengi, omuzdan
 * döner: heyecanda kalkar). Her parça tek `InstancedMesh`tir (parça başına
 * tek çizim çağrısı). Bu dosya yalnızca geometri ve matris kurar; renk/
 * konum seçimi tohumludur (`Math.random` yok).
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';

/** Figürün yerel ölçüleri (metre, oturan bir yetişkin). */
export const FIGURE = {
  torsoRadius: 0.17,
  torsoLength: 0.3,
  headRadius: 0.105,
  headY: 0.43,
  hairY: 0.455,
  shoulderY: 0.2,
  shoulderX: 0.205,
  armRadius: 0.045,
  armLength: 0.36,
} as const;

export const SKIN_TONES = ['#f1c9a5', '#e0ac82', '#d39a6a', '#b07a4c', '#8d5a36', '#6b4228'];
export const HAIR_COLORS = ['#1b1410', '#2b1d14', '#4a2e1b', '#7a3a1c', '#d8b26a', '#9a9a9a', '#1f2a44', '#c9a227'];

export interface CrowdFigureGeometries {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  hair: THREE.BufferGeometry;
  arms: THREE.BufferGeometry;
}

/** Dört parça geometrisi (çağıran `dispose` eder). */
export function createCrowdFigureGeometries(): CrowdFigureGeometries {
  // DÜŞÜK POLİGON (figür başına ~80 üçgen): tribünde binlerce figür var ve
  // ayrıntıyı uzaklık yutar. Gövde omuzda geniş, belde dar altıgen bir koni.
  const bodyHeight = FIGURE.torsoLength + FIGURE.torsoRadius * 2;
  const body = new THREE.CylinderGeometry(FIGURE.torsoRadius * 1.1, FIGURE.torsoRadius * 0.9, bodyHeight, 6, 1);
  body.scale(1, 1, 0.72);
  const head = new THREE.IcosahedronGeometry(FIGURE.headRadius, 0);
  head.scale(0.92, 1.05, 0.95);
  const hair = new THREE.SphereGeometry(FIGURE.headRadius * 1.06, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const arm = (side: number) => {
    const geometry = new THREE.BoxGeometry(FIGURE.armRadius * 2, FIGURE.armLength + FIGURE.armRadius * 2, FIGURE.armRadius * 2);
    // Omuz orijindedir: kol aşağı sarkar, omuzdan döner.
    geometry.translate(side * FIGURE.shoulderX, -(FIGURE.armLength / 2 + FIGURE.armRadius), 0);
    return geometry;
  };
  const left = arm(-1);
  const right = arm(1);
  const arms = mergeBufferGeometries([left, right]) ?? left;
  if (arms !== left) {
    left.dispose();
  }
  right.dispose();
  return { body, head, hair, arms };
}

export interface CrowdPose {
  x: number;
  y: number;
  z: number;
  /** Seyircinin hafif dönük oturuşu (radyan). */
  yaw: number;
  /** Boy farkı (0.9-1.1). */
  scale: number;
}

const scratch = {
  base: new THREE.Matrix4(),
  part: new THREE.Matrix4(),
  rotation: new THREE.Matrix4(),
  quaternion: new THREE.Quaternion(),
  euler: new THREE.Euler(),
  position: new THREE.Vector3(),
  scale: new THREE.Vector3(),
};

/**
 * Bir figürün dört parça matrisini yazar. `lift` ayağa kalkma/zıplama
 * (metre), `armRaise` kol açısı (radyan, 0 = aşağıda). Kollar ÖNE ve yukarı
 * kalkar (seyirciler +Z'ye, piste bakar).
 */
export function writeCrowdFigure(
  meshes: { body: THREE.InstancedMesh; head: THREE.InstancedMesh; hair: THREE.InstancedMesh; arms: THREE.InstancedMesh },
  index: number,
  pose: CrowdPose,
  lift: number,
  armRaise: number,
  /** `false`: kollara dokunulmaz (coşku yokken kol matrisi yeniden yüklenmesin). */
  includeArms = true,
): void {
  const { base, part, rotation, quaternion, euler, position, scale } = scratch;
  euler.set(0, pose.yaw, 0);
  quaternion.setFromEuler(euler);
  position.set(pose.x, pose.y + lift, pose.z);
  scale.setScalar(pose.scale);
  base.compose(position, quaternion, scale);

  meshes.body.setMatrixAt(index, base);
  part.makeTranslation(0, FIGURE.headY, 0).premultiply(base);
  meshes.head.setMatrixAt(index, part);
  part.makeTranslation(0, FIGURE.hairY, 0).premultiply(base);
  meshes.hair.setMatrixAt(index, part);
  if (!includeArms) return;
  rotation.makeRotationX(-armRaise);
  part.makeTranslation(0, FIGURE.shoulderY, 0).multiply(rotation).premultiply(base);
  meshes.arms.setMatrixAt(index, part);
}
