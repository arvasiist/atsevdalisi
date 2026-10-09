import { describe, expect, it } from 'vitest';
import { loadAvatarConfig, loadCosmeticsConfig, type AvatarConfig } from '@at-sevdalisi/game-config';
import { AVATAR_CATALOG_KEYS, deriveDefaultAvatar } from '../../../src/domain/avatar/avatar';
import {
  assertAvatarCosmeticsOwned,
  cosmeticColor,
  optionRef,
  premiumOptionIndex,
  validateCosmeticsConfig,
} from '../../../src/domain/cosmetics/cosmetics';
import { CosmeticNotOwnedError } from '../../../src/domain/cosmetics/errors';

const avatar = loadAvatarConfig();
const cosmetics = loadCosmeticsConfig();
const premium = premiumOptionIndex(cosmetics);
const isLocked = (catalog: Parameters<typeof optionRef>[0], optionId: string) => premium.has(optionRef(catalog, optionId));

/** Kilitli seçenekler hiç eklenmemiş gibi katalog (09.10.2026 öncesi). */
function withoutPremium(config: AvatarConfig): AvatarConfig {
  const copy = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  for (const item of cosmetics.items) {
    const entry = copy[item.catalog];
    if (Array.isArray(entry)) copy[item.catalog] = entry.filter((option) => option !== item.optionId);
    else delete (entry as Record<string, string>)[item.optionId];
  }
  return copy as unknown as AvatarConfig;
}

describe('kozmetik mağaza (09.10.2026)', () => {
  it('gerçek config geçerli; her ürün kataloğun bir seçeneği ve renkler önizlenebilir', () => {
    expect(validateCosmeticsConfig(cosmetics, avatar)).toEqual([]);
    expect(cosmetics.items.length).toBeGreaterThan(0);
    for (const item of cosmetics.items) {
      expect(item.priceGems).toBeGreaterThan(0);
      if (item.catalog === 'silkColors') expect(cosmeticColor(item, avatar)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('varsayılan avatar kilitli seçeneği SEÇMEZ ve mağaza eklenmeden önceki varsayılanla birebir aynıdır', () => {
    const before = withoutPremium(avatar);
    for (let index = 0; index < 500; index += 1) {
      const id = `oyuncu-${index}`;
      const derived = deriveDefaultAvatar(id, avatar, isLocked);
      expect(derived).toEqual(deriveDefaultAvatar(id, before));
      for (const field of Object.keys(derived) as Array<keyof typeof derived>) {
        expect(isLocked(AVATAR_CATALOG_KEYS[field], derived[field])).toBe(false);
      }
    }
  });

  it('kilitli seçenek yalnızca sahibine: sahip değilse COSMETIC_NOT_OWNED, sahipse geçer', () => {
    const item = cosmetics.items[0]!;
    const appearance = { ...deriveDefaultAvatar('x', avatar, isLocked), silksPrimary: item.optionId };
    expect(() => assertAvatarCosmeticsOwned(appearance, AVATAR_CATALOG_KEYS, new Set(), cosmetics)).toThrow(CosmeticNotOwnedError);
    expect(() => assertAvatarCosmeticsOwned(appearance, AVATAR_CATALOG_KEYS, new Set([item.key]), cosmetics)).not.toThrow();
    // Aynı renk kataloğunu paylaşan ikinci alan da aynı kurala tabi.
    const secondary = { ...deriveDefaultAvatar('x', avatar, isLocked), silksSecondary: item.optionId };
    expect(() => assertAvatarCosmeticsOwned(secondary, AVATAR_CATALOG_KEYS, new Set(), cosmetics)).toThrow(CosmeticNotOwnedError);
  });

  it('bozuk config yakalanır: olmayan seçenek, tekrar eden anahtar, sıfır fiyat, ücretsizi kalmayan katalog', () => {
    const base = cosmetics.items[0]!;
    const problems = validateCosmeticsConfig(
      {
        items: [
          { ...base, optionId: 'yok-boyle-renk' },
          { ...base, key: base.key },
          { ...base, key: 'bedava-sey', priceGems: 0, optionId: 'gold' },
        ],
      },
      avatar,
    );
    expect(problems.join(' | ')).toContain('kataloğunda "yok-boyle-renk" yok');
    expect(problems.join(' | ')).toContain('anahtar tekrar ediyor');
    expect(problems.join(' | ')).toContain('priceGems pozitif');
    const allHats = { items: avatar.hats.map((hat, index) => ({ key: `hat-${index}`, name: 'Şapka', catalog: 'hats' as const, optionId: hat, priceGems: 10 })) };
    expect(validateCosmeticsConfig(allHats, avatar).join(' ')).toContain('en az bir ücretsiz seçenek');
  });
});
