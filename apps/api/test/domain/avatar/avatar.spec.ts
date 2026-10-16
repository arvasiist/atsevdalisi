import { describe, expect, it } from 'vitest';
import { AVATAR_FIELDS } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import {
  avatarOptions,
  deriveDefaultAvatar,
  validateAvatarAppearance,
  validateAvatarConfig,
  silkColorHex,
} from '../../../src/domain/avatar/avatar';
import { InvalidAvatarError } from '../../../src/domain/avatar/errors';

describe('avatar kuralları (saf)', () => {
  const config = loadAvatarConfig();

  it("üretim kataloğu geçerli; her alanın en az bir seçeneği var", () => {
    expect(validateAvatarConfig(config)).toEqual([]);
    for (const field of AVATAR_FIELDS) expect(avatarOptions(field, config).length).toBeGreaterThan(0);
  });

  it('varsayılan avatar kimlikten DETERMİNİSTTİR ve kataloğa uyar', () => {
    const a = deriveDefaultAvatar('11111111-1111-4111-8111-111111111111', config);
    expect(deriveDefaultAvatar('11111111-1111-4111-8111-111111111111', config)).toEqual(a);
    expect(validateAvatarAppearance(a, config)).toEqual(a);
    // Farklı kimlikler hep aynı avatarı üretmez (seçim gerçekten kimliğe bağlı).
    const many = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(deriveDefaultAvatar(`oyuncu-${i}`, config))),
    );
    expect(many.size).toBeGreaterThan(1);
  });

  it('doğrulama: nesne değil / eksik alan / fazla alan / katalog dışı değer reddedilir', () => {
    const valid = deriveDefaultAvatar('x', config);
    const reject = (raw: unknown) => expect(() => validateAvatarAppearance(raw, config)).toThrow(InvalidAvatarError);
    reject(null);
    reject([]);
    reject('saç');
    const missing: Partial<typeof valid> = { ...valid };
    delete missing.hat;
    reject(missing);
    reject({ ...valid, cape: 'red' });
    reject({ ...valid, hairColor: '#ff0000' });
    reject({ ...valid, skinTone: 42 });
  });

  it('bozuk katalog yakalanır: boş liste, tekrar, kalıp dışı kimlik, hex olmayan renk', () => {
    const problems = validateAvatarConfig({
      ...config,
      hats: [],
      shoes: ['boots', 'boots'],
      hairStyles: ['Kısa Saç'],
      silkColors: { gold: 'altın' },
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'hats: boş katalog',
        'shoes: tekrar eden kimlik',
        'hairStyles: kalıp dışı kimlik Kısa Saç',
        'silkColors.gold: hex değil',
      ]),
    );
  });

  it('silkColorHex: kayıtlı forma kimliği → hex; bilinmeyen/boş/prototip anahtarı → null', () => {
    const config = loadAvatarConfig();
    const [firstId, firstHex] = Object.entries(config.silkColors)[0]!;
    expect(silkColorHex(firstId, config)).toBe(firstHex);
    for (const missing of ['kaldirilmis-renk', 'constructor', '__proto__', null, undefined]) {
      expect(silkColorHex(missing, config)).toBeNull();
    }
  });
});
