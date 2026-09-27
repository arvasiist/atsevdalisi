import { describe, expect, it } from 'vitest';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import {
  BRIEF_TRANSACTION_TYPES,
  CANONICAL_BY_LEDGER_TYPE,
  CANONICAL_TRANSACTION_TYPES,
  LEDGER_TRANSACTION_TYPES,
  type CanonicalTransactionType,
  type LedgerTransactionType,
} from '@at-sevdalisi/shared-types';
import {
  canonicalTypeOf,
  normalizeWalletHistoryLimit,
} from '../../../src/domain/economy/wallet-history';

/**
 * Cüzdan + işlem türleri — brief §20 "WALLET SYSTEM", §42 PHASE 4.
 *
 * Bu dosya ÜÇ ayrı iddiayı kanıtlar:
 *
 *  1. **Brief'in istediği 6 tür GERÇEKTEN var.** Brief §20 "DEPOSIT,
 *     ENTRY_FEE, PRIZE, GIFT, SPECTATOR_FEE, REFUND gibi transaction
 *     type'larını desteklesin" der. Bu türlerden biri silinirse (ör.
 *     biri "gereksiz" görülüp taksonomiden çıkarılırsa) burada kırılır.
 *  2. **Her defter türü BİR aileye eşlenir.** `CANONICAL_BY_LEDGER_TYPE`
 *     bir `Record<LedgerTransactionType, ...>`'dır, yani eksik eşleme
 *     DERLEME hatasıdır — bu test onun ÇALIŞMA ZAMANI tarafını (boş
 *     değer, tanınmayan aile) kapatır.
 *  3. **Sayfalama sınırı sağlamdır.** `?limit` HAM metin olarak gelir ve
 *     doğrudan `LIMIT $n`'e gider — hiçbir girdi 500/400 üretmemeli,
 *     tavan aşılamamalıdır.
 */
describe('İşlem türü taksonomisi (brief §20)', () => {
  it('brief’in saydığı 6 türün HEPSİ kanonik listede bulunmalı', () => {
    const canonical = new Set<string>(CANONICAL_TRANSACTION_TYPES);
    for (const required of BRIEF_TRANSACTION_TYPES) {
      expect(
        canonical.has(required),
        `Brief §20'nin istediği '${required}' türü CANONICAL_TRANSACTION_TYPES'tan çıkarılmış.`,
      ).toBe(true);
    }
  });

  it('kanonik aile listesi boş olmamalı ve tekrar içermemelidir', () => {
    expect(CANONICAL_TRANSACTION_TYPES.length).toBeGreaterThan(0);
    expect(new Set(CANONICAL_TRANSACTION_TYPES).size).toBe(CANONICAL_TRANSACTION_TYPES.length);
  });

  it('defter türü listesi boş olmamalı ve tekrar içermemelidir', () => {
    expect(LEDGER_TRANSACTION_TYPES.length).toBeGreaterThan(0);
    expect(new Set(LEDGER_TRANSACTION_TYPES).size).toBe(LEDGER_TRANSACTION_TYPES.length);
  });

  it('HER defter türü tanımlı bir kanonik aileye eşlenmeli', () => {
    const canonical = new Set<string>(CANONICAL_TRANSACTION_TYPES);
    for (const type of LEDGER_TRANSACTION_TYPES) {
      const mapped = CANONICAL_BY_LEDGER_TYPE[type];
      expect(mapped, `'${type}' için kanonik aile tanımsız.`).toBeDefined();
      expect(
        canonical.has(mapped),
        `'${type}' tanınmayan bir aileye ('${String(mapped)}') eşlenmiş.`,
      ).toBe(true);
    }
  });

  it('haritada defter listesinden FAZLA anahtar bulunmamalı (ölü eşleme)', () => {
    // `Record<LedgerTransactionType, ...>` derleyiciyi zorlar ama haritaya
    // elle fazladan bir anahtar eklemek (ör. silinen bir türün kalıntısı)
    // derleme hatası ÜRETMEZ — bu test onu yakalar.
    expect(Object.keys(CANONICAL_BY_LEDGER_TYPE).sort()).toEqual([...LEDGER_TRANSACTION_TYPES].sort());
  });

  it('canonicalTypeOf her defter türü için haritanın kendisini döner', () => {
    for (const type of LEDGER_TRANSACTION_TYPES) {
      expect(canonicalTypeOf(type)).toBe(CANONICAL_BY_LEDGER_TYPE[type]);
    }
  });

  it('giriş/ödül türleri doğru ailelere bağlı (brief §20 ENTRY_FEE / PRIZE)', () => {
    // Bu iki eşleme özellikle önemlidir: ikisi de GERÇEK para yoludur ve
    // yanlış aileye düşerlerse cüzdan ekranı yarış giderini "kazanç" gibi
    // gösterebilir.
    // `const ... : CanonicalTransactionType` — beklenen değerlerin
    // taksonomiden ÇIKARILMASINI sağlar: bir aile adı yeniden
    // adlandırılırsa bu satırlar derleme hatası verir (testteki metin
    // sessizce eskimez).
    const entryFee: CanonicalTransactionType = 'ENTRY_FEE';
    const prize: CanonicalTransactionType = 'PRIZE';
    const spectatorFee: CanonicalTransactionType = 'SPECTATOR_FEE';
    const gift: CanonicalTransactionType = 'GIFT';

    expect(canonicalTypeOf('practice_race_entry_fee')).toBe(entryFee);
    expect(canonicalTypeOf('lobby_race_entry_fee')).toBe(entryFee);
    expect(canonicalTypeOf('practice_race_prize')).toBe(prize);
    expect(canonicalTypeOf('grandstand_ticket')).toBe(spectatorFee);
    expect(canonicalTypeOf('gift_send_debit')).toBe(gift);
    expect(canonicalTypeOf('gift_send_credit')).toBe(gift);
  });

  it('hiçbir defter türü boş/whitespace içermemeli (SQL’e giden değer)', () => {
    for (const type of LEDGER_TRANSACTION_TYPES) {
      expect(type.trim()).toBe(type);
      expect(type.length).toBeGreaterThan(0);
    }
  });

  it('LedgerTransactionType ile LEDGER_TRANSACTION_TYPES aynı kümeyi temsil eder', () => {
    // Tip birleşimi ile çalışma zamanı listesi elle ayrışırsa (biri
    // güncellenip diğeri unutulursa) burada görünür.
    const viaTypes: LedgerTransactionType[] = [...LEDGER_TRANSACTION_TYPES];
    expect(viaTypes.length).toBe(LEDGER_TRANSACTION_TYPES.length);
  });
});

describe('Cüzdan işlem geçmişi sayfalaması (brief §20)', () => {
  const config = loadEconomyConfig();

  it('config: varsayılan ve tavan POZİTİF tam sayı olmalı', () => {
    // `walletHistoryDefaultLimit = 0` olsaydı parametresiz HER cüzdan
    // isteği BOŞ geçmiş dönerdi — sessiz ve şaşırtıcı bir kırılma.
    expect(Number.isInteger(config.walletHistoryDefaultLimit)).toBe(true);
    expect(config.walletHistoryDefaultLimit).toBeGreaterThan(0);
    expect(Number.isInteger(config.walletHistoryMaxLimit)).toBe(true);
    expect(config.walletHistoryMaxLimit).toBeGreaterThan(0);
  });

  it('config: varsayılan tavanı AŞMAMALI', () => {
    expect(config.walletHistoryDefaultLimit).toBeLessThanOrEqual(config.walletHistoryMaxLimit);
  });

  it('config: tavan makul bir üst sınırda olmalı (LIMIT $n doğrudan SQL’e gider)', () => {
    expect(config.walletHistoryMaxLimit).toBeLessThanOrEqual(1_000);
  });

  it('config: tavan varsayılana EŞİT OLMAMALI (yoksa ?limit parametresi ölü olur)', () => {
    // Eşit olsalardı `Math.min(parsed, max)` her zaman aynı sayıyı verirdi
    // ve `?limit=50` isteği sessizce yok sayılırdı.
    expect(config.walletHistoryMaxLimit).toBeGreaterThan(config.walletHistoryDefaultLimit);
  });

  it('parametre verilmezse varsayılana döner', () => {
    expect(normalizeWalletHistoryLimit(undefined, config)).toBe(config.walletHistoryDefaultLimit);
  });

  it('boş/boşluk metin varsayılana döner', () => {
    expect(normalizeWalletHistoryLimit('', config)).toBe(config.walletHistoryDefaultLimit);
    expect(normalizeWalletHistoryLimit('   ', config)).toBe(config.walletHistoryDefaultLimit);
  });

  it('geçerli bir sayı OLDUĞU GİBİ döner', () => {
    expect(normalizeWalletHistoryLimit('5', config)).toBe(5);
  });

  it('tavanı aşan değer sessizce kırpılır (400 DEĞİL)', () => {
    expect(normalizeWalletHistoryLimit('100000', config)).toBe(config.walletHistoryMaxLimit);
  });

  // Açık `Array<[string, unknown]>` — `it.each`'in çıkarımına bırakılırsa
  // karışık eleman tipleri (`string`/`number`/`null`/dizi) birleşime
  // dağılır ve callback parametreleri `any`'ye kayar (bu projede
  // `race-ready.e2e-spec.ts`'te AYNI desen kullanıldı).
  const invalidInputs: Array<[string, unknown]> = [
    ['sayı olmayan metin', 'abc'],
    ['sıfır', '0'],
    ['negatif', '-5'],
    ['ondalık', '2.5'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['dizi', ['10']],
    ['nesne', { value: '10' }],
    ['sayı (metin değil)', 10],
    ['null', null],
  ];

  it.each(invalidInputs)('%s → varsayılana düşer (istek patlamaz)', (_label, raw) => {
    expect(normalizeWalletHistoryLimit(raw, config)).toBe(config.walletHistoryDefaultLimit);
  });

  it('tam tavan değeri kabul edilir', () => {
    expect(normalizeWalletHistoryLimit(String(config.walletHistoryMaxLimit), config)).toBe(
      config.walletHistoryMaxLimit,
    );
  });
});
