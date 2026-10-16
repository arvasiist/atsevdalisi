/**
 * VARLIK DOSYASI İNCELEME (01.10.2026, 3D adım 4) — saf, bayt düzeyinde.
 * `scripts/check-assets.ts` ve testler kullanır; three.js yok.
 *
 * Amaç: bir dosya `public/` altına konduğunda "doğru biçimde mi, sahnede
 * kullanılabilir mi" sorusunu tarayıcı açmadan yanıtlamak. Biçim doğrulaması
 * başlık (magic) + GLB için JSON parçasıdır; görsel kaliteyi DEĞERLENDİRMEZ.
 */

import { resolveAnimationClips, type AssetRequirement } from './asset-manifest';

export interface GlbSummary {
  version: number;
  meshCount: number;
  skinCount: number;
  materialNames: string[];
  animationNames: string[];
  extensionsUsed: string[];
}

export interface AssetInspection {
  id: string;
  path: string;
  present: boolean;
  bytes: number;
  valid: boolean;
  problems: string[];
  notes: string[];
  glb?: GlbSummary;
}

/** Mobil indirme bütçesi (bayt) — aşılırsa uyarı. Brief: "mobilde at ≤ ~5 MB". */
export const MOBILE_BUDGET_BYTES: Partial<Record<AssetRequirement['kind'], number>> = {
  model_3d: 5 * 1024 * 1024,
  texture: 4 * 1024 * 1024,
  environment_map: 8 * 1024 * 1024,
};

/** Yerel çözücüsü olan uzantılar (`scripts/copy-3d-decoders.mjs`). */
const SUPPORTED_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_texture_basisu',
  'KHR_materials_emissive_strength',
  'KHR_materials_clearcoat',
  'KHR_materials_sheen',
  'KHR_materials_specular',
  'KHR_materials_ior',
  'KHR_materials_transmission',
  'KHR_texture_transform',
  'KHR_mesh_quantization',
]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

/** GLB 2.0 başlığını ve JSON parçasını okur; geçersizse açıklayıcı hata fırlatır. */
export function parseGlb(bytes: Uint8Array): GlbSummary {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'glTF')
    throw new Error('GLB değil (başlık "glTF" yok).');
  const version = readUint32(bytes, 4);
  if (version !== 2) throw new Error(`Desteklenmeyen glTF sürümü: ${version} (2 olmalı).`);
  const declared = readUint32(bytes, 8);
  if (declared !== bytes.length)
    throw new Error(
      `Bildirilen boyut (${declared}) dosya boyutuyla (${bytes.length}) uyuşmuyor — dosya kesik olabilir.`,
    );
  const chunkLength = readUint32(bytes, 12);
  if (ascii(bytes, 16, 4) !== 'JSON') throw new Error('İlk parça JSON değil.');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength))) as {
    meshes?: unknown[];
    skins?: unknown[];
    materials?: Array<{ name?: string }>;
    animations?: Array<{ name?: string }>;
    extensionsUsed?: string[];
  };
  return {
    version,
    meshCount: json.meshes?.length ?? 0,
    skinCount: json.skins?.length ?? 0,
    materialNames: (json.materials ?? []).map((material) => material.name ?? ''),
    animationNames: (json.animations ?? []).map(
      (animation, index) => animation.name ?? `animation_${index}`,
    ),
    extensionsUsed: json.extensionsUsed ?? [],
  };
}

function checkMagic(asset: AssetRequirement, bytes: Uint8Array): string | null {
  switch (asset.format) {
    case 'hdr':
      return ascii(bytes, 0, 10).startsWith('#?RADIANCE') || ascii(bytes, 0, 6).startsWith('#?RGBE')
        ? null
        : 'HDR değil (başlık "#?RADIANCE" yok).';
    case 'ktx2':
      return bytes[0] === 0xab && ascii(bytes, 1, 6) === 'KTX 20'
        ? null
        : 'KTX2 değil (başlık yok).';
    case 'png':
      return bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' ? null : 'PNG değil.';
    case 'mp3':
      return ascii(bytes, 0, 3) === 'ID3' ||
        (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
        ? null
        : 'MP3 değil (ID3/çerçeve başlığı yok).';
    case 'ogg':
      return ascii(bytes, 0, 4) === 'OggS' ? null : 'OGG değil.';
    default:
      return null;
  }
}

/** Bir manifest girdisini dosya içeriğiyle (yoksa `null`) inceler. */
export function inspectAsset(asset: AssetRequirement, bytes: Uint8Array | null): AssetInspection {
  const result: AssetInspection = {
    id: asset.id,
    path: asset.expectedPath,
    present: bytes !== null,
    bytes: bytes?.length ?? 0,
    valid: false,
    problems: [],
    notes: [],
  };
  if (bytes === null) return result;

  if (asset.format === 'glb') {
    try {
      const glb = parseGlb(bytes);
      result.glb = glb;
      if (glb.meshCount === 0) result.problems.push('Hiç mesh yok.');
      const unsupported = glb.extensionsUsed.filter(
        (extension) => !SUPPORTED_EXTENSIONS.has(extension),
      );
      if (unsupported.length > 0)
        result.notes.push(`Desteklenmeyebilecek uzantılar: ${unsupported.join(', ')}`);
      if (asset.animationClips) {
        const resolved = resolveAnimationClips(asset, glb.animationNames);
        const missing = Object.entries(resolved)
          .filter(([, name]) => name === null)
          .map(([role]) => role);
        if (missing.length > 0) {
          result.notes.push(
            `Eşlenmeyen animasyon rolleri: ${missing.join(', ')} (GLB klipleri: ${glb.animationNames.join(', ') || 'yok'}) — manifestteki takma adlara ekleyin.`,
          );
        }
        if (glb.skinCount === 0)
          result.notes.push('İskelet (skin) yok — iskelet animasyonu oynatılamaz.');
      }
      const tintRoles = Object.entries(asset.binding?.tintMaterials ?? {});
      for (const [role, keys] of tintRoles) {
        const hit = glb.materialNames.some((name) =>
          keys!.some((key) => name.toLowerCase().includes(key.toLowerCase())),
        );
        if (!hit)
          result.notes.push(
            `"${role}" rengi uygulanacak malzeme bulunamadı (malzemeler: ${glb.materialNames.join(', ') || 'yok'}).`,
          );
      }
    } catch (error) {
      result.problems.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    const magicProblem = checkMagic(asset, bytes);
    if (magicProblem) result.problems.push(magicProblem);
  }

  const budget = MOBILE_BUDGET_BYTES[asset.kind];
  if (budget && bytes.length > budget) {
    result.notes.push(
      `Boyut ${(bytes.length / 1048576).toFixed(1)} MB — mobil bütçe ${(budget / 1048576).toFixed(0)} MB. Draco/Meshopt + KTX2 sıkıştırma önerilir.`,
    );
  }
  result.valid = result.problems.length === 0;
  return result;
}
