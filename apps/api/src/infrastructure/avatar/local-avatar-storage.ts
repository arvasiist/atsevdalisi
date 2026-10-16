import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { AVATAR_STORAGE_KEY_PATTERN, type AvatarStorage, type StoredObject } from '../../application/ports/avatar-storage';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  glb: 'model/gltf-binary',
};

/**
 * YEREL DİSK DEPOSU (07.10.2026) — geliştirme/test ve tek sunuculu kurulum
 * için. Çok örnekli üretimde paylaşılan nesne deposu (S3 uyumlu) gerekir;
 * o uygulama aynı `AvatarStorage` arayüzünü yazar. Anahtar YALNIZCA sunucu
 * kalıbına uyarsa kabul edilir ve çözülen yol kök dizinin İÇİNDE kalmalıdır
 * (yol geçişi ikinci kez engellenir).
 */
export class LocalAvatarStorage implements AvatarStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600 });
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const bytes = await readFile(this.pathFor(key));
      return { bytes: new Uint8Array(bytes), contentType: CONTENT_TYPES[key.split('.').pop()!]! };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    if (!AVATAR_STORAGE_KEY_PATTERN.test(key)) throw new Error('Geçersiz depo anahtarı.');
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error('Depo anahtarı kök dizinin dışına çıkıyor.');
    return path;
  }
}
