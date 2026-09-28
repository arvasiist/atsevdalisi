import { describe, expect, it } from 'vitest';
import { loadEconomyConfig, type MockDepositConfig } from '@at-sevdalisi/game-config';
import { assertValidMockDepositConfig, validateMockDeposit } from '../../../src/domain/economy/mock-deposit';

/**
 * SANAL para yatırma doğrulaması — brief §21/§41, §42 PHASE 4b.
 *
 * Bu dosya ÜÇ iddiayı kanıtlar:
 *
 *  1. **Gerçek config tutarlıdır.** `economy.config.json`'daki
 *     `mockDeposit` bloğu `assertValidMockDepositConfig`'ten geçer — yani
 *     depodaki yapılandırma gerçekten kullanılabilir durumdadır (bir
 *     `minAmount: 0` hatası burada kırılır).
 *  2. **Sınırlar KAPSAYICIDIR ve tam sınır değerleri geçerlidir.** `min`/
 *     `max` birer "dahil" sınırdır; `min - 1` ve `max + 1` reddedilir. Bu
 *     ayrım (`<` mi `<=` mi) sessizce ters çevrilebilecek bir ayrıntıdır
 *     ve para yolunda yanlış tarafa düşmesi gerçek sonuç doğurur.
 *  3. **Bozuk girdi ASLA fırlatmaz, hep bir `problem` döner.** Ham
 *     `amount` `unknown`'dur (CLAUDE.md kural 5: esbuild altında DTO
 *     doğrulaması atlanır, gövde çalışma anında her şey olabilir) — bu
 *     yüzden `undefined`/`null`/metin/dizi/nesne/`NaN`/`Infinity` gibi
 *     girdilerin HEPSİ 500 değil, 400 üretmelidir.
 */
describe('Sanal para yatırma doğrulaması (brief §21/§41)', () => {
  const config = loadEconomyConfig().mockDeposit;

  /** Testlerin config'e bağımlılığını açık tutar — bir gün `maxAmount` küçülürse sınır testleri sessizce anlamsızlaşmasın. */
  function withConfig(overrides: Partial<MockDepositConfig>): MockDepositConfig {
    return { ...config, ...overrides };
  }

  describe('config tutarlılığı', () => {
    it('depodaki gerçek config geçerlidir (min > 0, max >= min, ikisi de tam sayı)', () => {
      expect(() => assertValidMockDepositConfig(config)).not.toThrow();
      expect(Number.isInteger(config.minAmount)).toBe(true);
      expect(Number.isInteger(config.maxAmount)).toBe(true);
      expect(config.minAmount).toBeGreaterThan(0);
      expect(config.maxAmount).toBeGreaterThanOrEqual(config.minAmount);
    });

    it('minAmount = 0 → hata (deftere sıfır tutarlı satır yazılamaz, migration 0019)', () => {
      // `CHECK (amount <> 0)` zaten reddederdi; burada yakalanması hatayı
      // 500 yerine açık bir mesajla, yazmadan ÖNCE verir.
      expect(() => assertValidMockDepositConfig(withConfig({ minAmount: 0 }))).toThrow(/pozitif/);
    });

    it('negatif minAmount → hata', () => {
      expect(() => assertValidMockDepositConfig(withConfig({ minAmount: -100 }))).toThrow(/pozitif/);
    });

    it('maxAmount < minAmount → hata (hiçbir tutar geçerli olmazdı)', () => {
      expect(() =>
        assertValidMockDepositConfig(withConfig({ minAmount: 1000, maxAmount: 500 })),
      ).toThrow(/küçük olamaz/);
    });

    it('tam sayı OLMAYAN sınırlar → hata (NaN ile karşılaştırma HER ZAMAN false döner)', () => {
      // Bu, sessiz ve tehlikeli bir bozulmadır: `minAmount: NaN` olsaydı
      // `amount < NaN` her zaman `false` olurdu, yani aralık kontrolü
      // TAMAMEN devre dışı kalırdı ve uç nokta "her tutar geçerli"
      // hâline gelirdi.
      expect(() => assertValidMockDepositConfig(withConfig({ minAmount: Number.NaN }))).toThrow(/tam sayı/);
      expect(() => assertValidMockDepositConfig(withConfig({ maxAmount: 10.5 }))).toThrow(/tam sayı/);
    });

    it('maxAmount = minAmount geçerlidir (tek bir tutara izin veren bir config anlamsız değildir)', () => {
      expect(() => assertValidMockDepositConfig(withConfig({ minAmount: 500, maxAmount: 500 }))).not.toThrow();
    });
  });

  describe('geçerli girdiler', () => {
    it('alt sınırın KENDİSİ geçerlidir (sınırlar kapsayıcıdır)', () => {
      expect(validateMockDeposit(config.minAmount, config)).toEqual({ ok: true, amount: config.minAmount });
    });

    it('üst sınırın KENDİSİ geçerlidir', () => {
      expect(validateMockDeposit(config.maxAmount, config)).toEqual({ ok: true, amount: config.maxAmount });
    });

    it('aralığın ortasında bir değer geçerlidir ve AYNEN döner (kırpılmaz)', () => {
      const middle = Math.floor((config.minAmount + config.maxAmount) / 2);
      expect(validateMockDeposit(middle, config)).toEqual({ ok: true, amount: middle });
    });

    it('`enabled: false` tutarı ETKİLEMEZ — o karar sağlayıcınındır', () => {
      // `validateMockDeposit` bilerek `enabled` alanına BAKMAZ (bkz. dosya
      // doc yorumu): "kapalı mı" sorusunun tek cevap yeri
      // `PaymentProvider.isEnabled()`'dır. Bu test o sözleşmeyi sabitler —
      // biri buraya bir `enabled` kontrolü eklerse kırılır ve neden
      // eklendiğini sorgulatır.
      expect(validateMockDeposit(config.minAmount, withConfig({ enabled: false }))).toEqual({
        ok: true,
        amount: config.minAmount,
      });
    });
  });

  describe('geçersiz tutarlar → problem döner (ASLA fırlatmaz)', () => {
    it('alt sınırın BİR altı reddedilir', () => {
      expect(validateMockDeposit(config.minAmount - 1, config)).toEqual({
        ok: false,
        problem: 'below_minimum',
      });
    });

    it('üst sınırın BİR üstü reddedilir (SESSİZCE KIRPILMAZ)', () => {
      // Bu, `wallet-history.ts`'teki "sessizce kırp" kararından bilinçli
      // bir SAPMADIR: orada kırpılan şey bir görüntüleme tercihiydi,
      // burada kırpılan şey oyuncunun parası olurdu.
      expect(validateMockDeposit(config.maxAmount + 1, config)).toEqual({
        ok: false,
        problem: 'above_maximum',
      });
    });

    it('sıfır ve negatif tutarlar alt sınır kuralına takılır', () => {
      expect(validateMockDeposit(0, config)).toEqual({ ok: false, problem: 'below_minimum' });
      expect(validateMockDeposit(-500, config)).toEqual({ ok: false, problem: 'below_minimum' });
    });

    // Açık `Array<[string, unknown]>` — `it.each`'in çıkarımına
    // bırakılırsa karışık eleman tipleri birleşime dağılır ve callback
    // parametreleri `any`'ye kayar (bu projede AYNI desen
    // `wallet-history.spec.ts`/`race-ready.e2e-spec.ts`'te kullanıldı).
    const nonIntegerInputs: Array<[string, unknown]> = [
      ['metin sayı', '1000'],
      ['ondalık', 1000.5],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
      // `1e999` YAZILMAZ: eslint `no-loss-of-precision` bunu hata sayar
      // (literal, derleme anında Infinity'ye taşar). Aynı durum — "tam sayı
      // olmayan, aralığa sığmayan dev sayı" — taşmasız ifadeyle kurulur.
      ['taşan büyük sayı (MAX_VALUE * 2 → Infinity)', Number.MAX_VALUE * 2],
      ['undefined (gövde hiç gönderilmedi)', undefined],
      ['null', null],
      ['boolean', true],
      ['dizi', [1000]],
      ['nesne', { amount: 1000 }],
      ['tam sayı gibi görünen BigInt', BigInt(1000)],
    ];

    it.each(nonIntegerInputs)('%s → not_an_integer (500 DEĞİL)', (_label, raw) => {
      expect(validateMockDeposit(raw, config)).toEqual({ ok: false, problem: 'not_an_integer' });
    });

    it('sıra önemlidir: aralık dışı VE tam sayı olmayan bir girdi "not_an_integer" döner', () => {
      // `NaN < minAmount` HER ZAMAN `false` döner — yani aralık kontrolü
      // önce yapılsaydı `NaN` sessizce GEÇERDİ. Bu test o sırayı sabitler.
      expect(validateMockDeposit(Number.NaN, config)).toEqual({ ok: false, problem: 'not_an_integer' });
    });

    it('bozuk girdi HİÇBİR durumda fırlatmaz (çağıran karar verir)', () => {
      for (const [, raw] of nonIntegerInputs) {
        expect(() => validateMockDeposit(raw, config)).not.toThrow();
      }
    });
  });
});
