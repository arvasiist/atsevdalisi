import { describe, expect, it } from 'vitest';
import {
  getAssetById,
  type AssetRequirement,
} from '../../../src/features/race-viewer/assets/asset-manifest';
import {
  inspectAsset,
  parseGlb,
  MOBILE_BUDGET_BYTES,
} from '../../../src/features/race-viewer/assets/asset-inspect';
import {
  computeModelFit,
  findMountBoneName,
  forwardAxisRotation,
  materialMatchesRole,
} from '../../../src/features/race-viewer/assets/model-fit';
import { pickGaitClip } from '../../../src/features/race-viewer/HorseAvatar3D';

const horse = getAssetById('HORSE_MODEL_REQUIRED')!;
const jockey = getAssetById('JOCKEY_MODEL_REQUIRED')!;

/** Testte bellekte sentetik GLB üretir (diske YAZILMAZ — sahte varlık yok). */
function makeGlb(json: object, overrideVersion = 2): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const total = 12 + 8 + jsonBytes.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode('glTF'), 0);
  view.setUint32(4, overrideVersion, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  out.set(new TextEncoder().encode('JSON'), 16);
  out.set(jsonBytes, 20);
  return out;
}

describe('computeModelFit (01.10.2026)', () => {
  it('+Z ileri bakan modeli +X yönüne döndürür, uzunluğu hedefe ölçekler, tabanı y=0a oturtur', () => {
    // 5 birim uzun (Z), 3 yüksek, 1 geniş; taban y=1'de.
    const fit = computeModelFit([-0.5, 1, -2.5], [0.5, 4, 2.5], {
      forwardAxis: '+z',
      targetLengthMeters: 2.5,
    });
    expect(fit.rotationY).toBeCloseTo(Math.PI / 2);
    expect(fit.scale).toBeCloseTo(0.5);
    expect(fit.offset[1]).toBeCloseTo(-0.5); // -minY * scale
    expect(fit.offset[0]).toBeCloseTo(0);
    expect(fit.offset[2]).toBeCloseTo(0);
  });

  it('uzunluk verilmemişse yüksekliğe ölçekler; hiçbiri yoksa ölçek 1', () => {
    expect(
      computeModelFit([0, 0, 0], [1, 2, 1], { forwardAxis: '+x', targetHeightMeters: 1 }).scale,
    ).toBeCloseTo(0.5);
    expect(computeModelFit([0, 0, 0], [1, 2, 1], { forwardAxis: '+x' }).scale).toBe(1);
  });

  it('eksen dönüşleri', () => {
    expect(forwardAxisRotation('+x')).toBe(0);
    expect(forwardAxisRotation('-x')).toBeCloseTo(Math.PI);
    expect(forwardAxisRotation('-z')).toBeCloseTo(-Math.PI / 2);
  });
});

describe('malzeme/kemik eşleme', () => {
  it('don/yele/forma malzemesi adın içinde, büyük/küçük harf duyarsız eşleşir', () => {
    expect(materialMatchesRole('Horse_Coat_MAT', horse.binding, 'coat')).toBe(true);
    expect(materialMatchesRole('ManeHair', horse.binding, 'mane')).toBe(true);
    expect(materialMatchesRole('Hoof', horse.binding, 'coat')).toBe(false);
    expect(materialMatchesRole('Jersey_01', jockey.binding, 'silk')).toBe(true);
    expect(materialMatchesRole('anything', undefined, 'coat')).toBe(false);
  });

  it('jokey kemiği manifest sırasıyla bulunur', () => {
    expect(findMountBoneName(['Root', 'spine_02', 'Saddle'], jockey.binding)).toBe('Saddle');
    expect(findMountBoneName(['Root', 'SPINE_02'], jockey.binding)).toBe('SPINE_02');
    expect(findMountBoneName(['Root'], jockey.binding)).toBeNull();
  });
});

describe('pickGaitClip', () => {
  it('istenen yürüyüş yoksa en yakın tempoya düşer', () => {
    expect(pickGaitClip({ gallop: 'Run', idle: 'Idle' }, 'gallop')).toBe('Run');
    expect(pickGaitClip({ canter: 'Canter', idle: 'Idle' }, 'gallop')).toBe('Canter');
    expect(pickGaitClip({ walk: 'Walk' }, 'idle')).toBe('Walk');
    expect(pickGaitClip({}, 'gallop')).toBeNull();
  });
});

describe('GLB inceleme (npm run assets:check)', () => {
  const validHorse = {
    asset: { version: '2.0' },
    meshes: [{}],
    skins: [{}],
    materials: [{ name: 'Coat' }, { name: 'Mane' }],
    animations: [
      { name: 'Idle' },
      { name: 'Walk' },
      { name: 'Trot' },
      { name: 'Canter' },
      { name: 'Gallop' },
    ],
    extensionsUsed: ['KHR_draco_mesh_compression'],
  };

  it("geçerli bir at GLB'sinde hata yok, klipler ve malzemeler eşleşir", () => {
    const report = inspectAsset(horse, makeGlb(validHorse));
    expect(report.valid).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.notes).toEqual([]);
    expect(report.glb?.animationNames).toContain('Gallop');
  });

  it('eksik klip, iskeletsiz model ve bulunamayan don malzemesi NOT olarak raporlanır', () => {
    const report = inspectAsset(
      horse,
      makeGlb({
        ...validHorse,
        skins: [],
        materials: [{ name: 'Hoof' }],
        animations: [{ name: 'Idle' }],
      }),
    );
    expect(report.valid).toBe(true);
    expect(report.notes.join('\n')).toMatch(/Eşlenmeyen animasyon rolleri: .*gallop/);
    expect(report.notes.join('\n')).toMatch(/İskelet/);
    expect(report.notes.join('\n')).toMatch(/"coat" rengi/);
  });

  it('bozuk/yanlış dosyalar HATA verir', () => {
    expect(() => parseGlb(new TextEncoder().encode('not a glb file at all'))).toThrow(/GLB değil/);
    expect(() => parseGlb(makeGlb(validHorse, 1))).toThrow(/sürüm/);
    const truncated = makeGlb(validHorse).subarray(0, 40);
    expect(inspectAsset(horse, truncated).valid).toBe(false);
    const hdri = getAssetById('HDRI_SKY_REQUIRED') as AssetRequirement;
    expect(
      inspectAsset(hdri, new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe')).valid,
    ).toBe(true);
    expect(inspectAsset(hdri, new TextEncoder().encode('JPEG')).valid).toBe(false);
  });

  it('mobil bütçeyi aşan model not alır; eksik dosya mevcut değildir', () => {
    const big = makeGlb(validHorse);
    const padded = new Uint8Array((MOBILE_BUDGET_BYTES.model_3d ?? 0) + 1);
    padded.set(big);
    new DataView(padded.buffer).setUint32(8, padded.length, true);
    expect(inspectAsset(horse, padded).notes.join('\n')).toMatch(/mobil bütçe/);
    expect(inspectAsset(horse, null).present).toBe(false);
  });
});
