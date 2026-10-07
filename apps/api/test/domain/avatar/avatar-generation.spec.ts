import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_JOB_STATUSES } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { sanitizeReason } from '../../../src/application/use-cases/avatar-generation.use-case';
import {
  canTransitionAvatarJob,
  isTerminalAvatarJob,
  isValidGlb,
} from '../../../src/domain/avatar/generation-job';
import { SelfieRejectedError } from '../../../src/domain/avatar/errors';
import { detectImageType, readImageDimensions, validateSelfie } from '../../../src/domain/avatar/selfie';
import { LocalAvatarStorage } from '../../../src/infrastructure/avatar/local-avatar-storage';
import { glbBytes, jpegBytes, pngBytes, webpVp8xBytes } from './fixtures';

const rules = loadAvatarConfig().generation;
const reasonOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof SelfieRejectedError) return error.reason;
    throw error;
  }
  return 'GEÇTİ';
};

describe('selfie ön kontrolü (saf)', () => {
  it('biçim dosyanın baytlarından okunur (uzantı/bildirilen tür değil)', () => {
    expect(detectImageType(pngBytes(600, 600))).toBe('image/png');
    expect(detectImageType(jpegBytes(600, 600))).toBe('image/jpeg');
    expect(detectImageType(webpVp8xBytes(600, 600))).toBe('image/webp');
    expect(detectImageType(new TextEncoder().encode('GIF89a......'))).toBeNull();
  });

  it('çözünürlük başlıktan okunur (PNG, JPEG SOF, WebP VP8X)', () => {
    expect(readImageDimensions(pngBytes(640, 800), 'image/png')).toEqual({ width: 640, height: 800 });
    expect(readImageDimensions(jpegBytes(1024, 768), 'image/jpeg')).toEqual({ width: 1024, height: 768 });
    expect(readImageDimensions(webpVp8xBytes(700, 900), 'image/webp')).toEqual({ width: 700, height: 900 });
  });

  it('geçerli selfie GERÇEK türü döner; her ret nedeni ayrı', () => {
    expect(validateSelfie(jpegBytes(800, 800), 'image/jpeg', rules)).toBe('image/jpeg');
    expect(validateSelfie(pngBytes(800, 800), undefined, rules)).toBe('image/png');
    expect(reasonOf(() => validateSelfie(new Uint8Array(), 'image/png', rules))).toBe('EMPTY_FILE');
    expect(reasonOf(() => validateSelfie(new Uint8Array(rules.maxUploadBytes + 1), 'image/png', rules))).toBe('FILE_TOO_LARGE');
    expect(reasonOf(() => validateSelfie(new TextEncoder().encode('GIF89a......'), 'image/gif', rules))).toBe('UNSUPPORTED_FORMAT');
    expect(reasonOf(() => validateSelfie(pngBytes(800, 800), 'image/jpeg', rules))).toBe('TYPE_MISMATCH');
    expect(reasonOf(() => validateSelfie(pngBytes(800, 800).subarray(0, 12), 'image/png', rules))).toBe('CORRUPT_IMAGE');
    expect(reasonOf(() => validateSelfie(pngBytes(rules.minDimension - 1, 900), 'image/png', rules))).toBe('IMAGE_TOO_SMALL');
    expect(reasonOf(() => validateSelfie(pngBytes(rules.maxDimension + 1, 900), 'image/png', rules))).toBe('IMAGE_TOO_LARGE');
  });
});

describe('avatar işi durum makinesi + GLB doğrulama (saf)', () => {
  it('yalnızca ileri geçişler; ready/failed/cancelled çıkışsız; işlenirken iptal yok', () => {
    expect(canTransitionAvatarJob('requested', 'analyzing')).toBe(true);
    expect(canTransitionAvatarJob('generating', 'processing')).toBe(true);
    expect(canTransitionAvatarJob('processing', 'ready')).toBe(true);
    expect(canTransitionAvatarJob('processing', 'cancelled')).toBe(false);
    expect(canTransitionAvatarJob('ready', 'failed')).toBe(false);
    expect(canTransitionAvatarJob('generating', 'analyzing')).toBe(false);
    expect(AVATAR_JOB_STATUSES.filter(isTerminalAvatarJob)).toEqual(['ready', 'failed', 'cancelled']);
  });

  it('GLB: sihirli sayı + sürüm 2 + uzunluk + JSON parçası; sınır aşan reddedilir', () => {
    const glb = glbBytes();
    expect(isValidGlb(glb, 1_000_000)).toBe(true);
    expect(isValidGlb(glb, glb.length - 1)).toBe(false);
    expect(isValidGlb(glb.subarray(0, glb.length - 4), 1_000_000)).toBe(false);
    expect(isValidGlb(new TextEncoder().encode('{"asset":{}}'.padEnd(40)), 1_000_000)).toBe(false);
  });

  it('sağlayıcı neden kodu kısa ve güvenli koda indirgenir', () => {
    expect(sanitizeReason('face not found')).toBe('FACE_NOT_FOUND');
    expect(sanitizeReason('<script>alert(1)</script>')).toBe('SCRIPT_ALERT_1_SCRIPT');
    expect(sanitizeReason('!!!')).toBe('PROVIDER_FAILED');
    expect(sanitizeReason('x'.repeat(100))).toHaveLength(40);
  });
});

describe('yerel avatar deposu', () => {
  let root: string;
  let storage: LocalAvatarStorage;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'avatar-depo-'));
    storage = new LocalAvatarStorage(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('yaz/oku/sil; silme tekrarlanabilir; içerik türü uzantıdan', async () => {
    const key = 'models/11111111-1111-4111-8111-111111111111.glb';
    await storage.put(key, glbBytes(), 'model/gltf-binary');
    const object = await storage.get(key);
    expect(object?.contentType).toBe('model/gltf-binary');
    expect(Buffer.from(object!.bytes).equals(Buffer.from(glbBytes()))).toBe(true);
    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it('sunucu kalıbı dışındaki anahtar (yol geçişi, mutlak yol, kullanıcı adı) reddedilir', async () => {
    for (const key of ['../etc/passwd', '/etc/passwd', 'selfies/../../x.jpg', 'selfies/benim-fotom.jpg', 'models/x.exe']) {
      await expect(storage.put(key, new Uint8Array([1]), 'image/jpeg')).rejects.toThrow();
    }
  });
});
