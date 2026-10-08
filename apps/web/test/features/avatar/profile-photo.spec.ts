import { describe, expect, it } from 'vitest';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { formatMegabytes, photoPrecheckError } from '../../../src/features/avatar/profile-photo';
import { profilePhotoUrl } from '../../../src/lib/api-client';

/** Profil fotoğrafı ön kontrolü (08.10.2026) — sınırlar sunucuyla AYNI config'ten. */
describe('profil fotoğrafı ön kontrolü', () => {
  const rules = loadAvatarConfig().photo;

  it('kabul edilen tür ve sınır içindeki boyut geçer', () => {
    for (const type of rules.acceptedTypes) {
      expect(photoPrecheckError({ size: 1024, type })).toBeNull();
    }
  });

  it('boş, desteklenmeyen tür ya da büyük dosya mesajla reddedilir', () => {
    expect(photoPrecheckError({ size: 0, type: 'image/jpeg' })).toMatch(/boş/);
    expect(photoPrecheckError({ size: 1024, type: 'image/svg+xml' })).toMatch(/JPEG/);
    expect(photoPrecheckError({ size: 1024, type: 'image/gif' })).toMatch(/JPEG/);
    expect(photoPrecheckError({ size: rules.maxUploadBytes + 1, type: 'image/png' })).toContain(
      formatMegabytes(rules.maxUploadBytes),
    );
  });

  it('fotoğraf adresi kimliği kodlar', () => {
    expect(profilePhotoUrl('a/b')).toMatch(/\/avatar\/photos\/a%2Fb$/);
  });
});
