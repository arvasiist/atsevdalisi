import { describe, expect, it } from 'vitest';
import type { Horse } from '@at-sevdalisi/shared-types';
import { estimatePotentialRange, toPublicHorse } from '../../src/api/dto/horse.mapper';

/**
 * AUDIT_AND_HARDENING Öncelik 5 (bu oturum) — docs/SECURITY.md §9'un gizli
 * veri sızıntısı koruması kuralının GERÇEKTEN uygulandığını doğrular (bkz.
 * `horse.mapper.ts` doc yorumu — bu dosya/dizin bu oturumdan ÖNCE hiç
 * yoktu). Bu testler bir e2e-spec DEĞİLDİR (gerçek Postgres/HTTP GEREKMEZ)
 * — saf bir dönüşüm fonksiyonu test edilir.
 */
function createHorseFixture(overrides: Partial<Horse> = {}): Horse {
  return {
    id: 'h1',
    ownerId: 'p1',
    name: 'Test At',
    gender: 'mare',
    breed: 'Arabian',
    birthDate: '2020-01-01T00:00:00.000Z',
    level: 1,
    xp: 0,
    quality: 60,
    potential: 87,
    health: 100,
    fitness: 100,
    fatigue: 0,
    energy: 100,
    morale: 80,
    weightKg: null,
    status: 'active',
    sireId: null,
    damId: null,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('estimatePotentialRange', () => {
  it('gerçek değeri ondalık dilime (10 puanlık) yuvarlar', () => {
    expect(estimatePotentialRange(87)).toEqual({ min: 80, max: 89 });
    expect(estimatePotentialRange(80)).toEqual({ min: 80, max: 89 });
    expect(estimatePotentialRange(89)).toEqual({ min: 80, max: 89 });
    expect(estimatePotentialRange(0)).toEqual({ min: 0, max: 9 });
  });

  it('üst sınırda (100) [0,100] aralığına kırpar — ham değer sadece skalanın tavanında istisnai olarak tam belirlenir', () => {
    expect(estimatePotentialRange(100)).toEqual({ min: 100, max: 100 });
  });

  it('simetrik DEĞİLDİR — (min+max)/2 ham değere eşit OLMAMALIDIR (aritmetikle geri türetilebilir bir sızıntı olmasın diye)', () => {
    const { min, max } = estimatePotentialRange(87);
    expect((min + max) / 2).not.toBe(87);
  });
});

describe('toPublicHorse', () => {
  it('ham `potential` alanını TAMAMEN kaldırır — sonuç nesnesinde `potential` anahtarı bulunmamalıdır', () => {
    const horse = createHorseFixture({ potential: 92 });
    const publicHorse = toPublicHorse(horse);

    expect(publicHorse).not.toHaveProperty('potential');
    expect(publicHorse.potentialEstimate).toEqual({ min: 90, max: 99 });
    // Serialize edilmiş JSON'da da (gerçek HTTP yanıtının aynısı) `potential` GEÇMEMELİ.
    expect(JSON.stringify(publicHorse)).not.toContain('"potential"');
  });

  it('görünen (gizli olmayan) tüm alanları KORUR', () => {
    const horse = createHorseFixture({ name: 'Yıldız', quality: 71 });
    const publicHorse = toPublicHorse(horse);

    expect(publicHorse.id).toBe(horse.id);
    expect(publicHorse.name).toBe('Yıldız');
    expect(publicHorse.quality).toBe(71);
    expect(publicHorse.health).toBe(horse.health);
  });
});
