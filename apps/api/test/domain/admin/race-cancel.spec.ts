import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RaceStatus } from '@at-sevdalisi/shared-types';
import {
  RACE_CANCEL_REFUSALS,
  checkRaceCancelable,
} from '../../../src/domain/admin/race-cancel';
import { RaceNotCancelableError } from '../../../src/domain/admin/errors';
import { REPO_ROOT } from '../../support/repo-root';

/**
 * `domain/admin/race-cancel.ts` — yarış iptalinin durum kuralı (brief §34,
 * 28.09.2026).
 *
 * NEDEN DOMAIN'DE TEST EDİLİYOR: CLAUDE.md kural 5 "Kardeş tuzak" —
 * Vitest/esbuild altında DTO dekoratörleri (`@IsIn`) sessizce ATLANIR.
 * Bu dosya, CI'da gerçekten koşan kural katmanını doğrular.
 *
 * **ASIL DEĞER `finished` İDDİASINDADIR:** iptal `finished`e izin verseydi,
 * KOŞMUŞ ve ödülleri DAĞITILMIŞ bir yarışta iade çalışırdı — ve iade
 * tutarı defterden okunduğu için kazanana ödenen `race_prize` değil,
 * ödediği `lobby_race_entry_fee` bulunurdu. Yani sessizce YANLIŞ (ama
 * makul görünen) bir tutar ödenirdi; hiçbir yerde hata çıkmazdı.
 */

const ALL_STATUSES: readonly RaceStatus[] = ['scheduled', 'locking', 'in_progress', 'finished', 'cancelled'];

/**
 * İPTAL EDİLEBİLİR DURUMLAR — `locking` PHASE 1'DE (migration 0042)
 * eklendi.
 *
 * **NEDEN `locking` DE İPTAL EDİLEBİLİR:** `locking`in tek anlamı
 * "kadro+seed+snapshot donduruldu, henüz KOŞMADI"dır. Ödüller
 * DAĞITILMAMIŞTIR, yani `finished`ten temel farkı tam olarak budur ve
 * iade doğru tutarı bulur (defterdeki son `lobby_race_entry_fee`).
 * `locking`i kapatmak, zamanlayıcı bir yarışı kilitleyip kimse
 * kesinleştirmediğinde havuzun KALICI olarak kilitlenmesi demekti —
 * `scheduled`daki zaman kuralının yokluğuyla AYNI gerekçe.
 */
const CANCELABLE_STATUSES: readonly RaceStatus[] = ['scheduled', 'locking'];

describe('RACE_CANCEL_REFUSALS', () => {
  it('TEKİLDİR', () => {
    expect(new Set(RACE_CANCEL_REFUSALS).size).toBe(RACE_CANCEL_REFUSALS.length);
  });

  it.each(CANCELABLE_STATUSES)('`%s` İÇİN BİR RET NEDENİ YOKTUR', (status) => {
    expect(checkRaceCancelable(status)).toBeNull();
  });
});

describe('checkRaceCancelable — kapalı eşleme', () => {
  it.each<[RaceStatus, string]>([
    ['in_progress', 'ALREADY_STARTED'],
    ['finished', 'ALREADY_FINISHED'],
    ['cancelled', 'ALREADY_CANCELLED'],
  ])('%s → %s', (status, reason) => {
    expect(checkRaceCancelable(status)).toBe(reason);
  });

  it('HER durum için bir cevap vardır (eksik anahtar sessizce "iptal edilebilir" yapardı)', () => {
    for (const status of ALL_STATUSES) {
      // `null` (izin) yalnızca `CANCELABLE_STATUSES` için geçerlidir.
      // ⚠️ `toEqual`, `toBe` DEĞİL: `expect.any(String)` asimetrik bir
      // eşleştiricidir ve `toBe` onu Object.is ile karşılaştırdığı için
      // her zaman düşer (yaşandı, 28.09.2026).
      const cancelable = CANCELABLE_STATUSES.includes(status);
      expect(checkRaceCancelable(status)).toEqual(cancelable ? null : expect.any(String));
    }
  });

  it.each([
    ['', 'boş metin'],
    ['SCHEDULED', 'büyük harf — sözlük küçük harftir'],
    ['paused', 'DB CHECK`inde OLMAYAN bir durum'],
    ['  scheduled  ', 'kırpılmaz: eşleşme TAM olmalıdır'],
  ])('tanınmayan durumu UNKNOWN_STATUS ile REDDEDER: %s (%s)', (status) => {
    // "Tanımadığım durumu iptal edilebilir saymak" sessiz bir para hatası
    // olurdu; reddetmek güvenli taraftır.
    expect(checkRaceCancelable(status)).toBe('UNKNOWN_STATUS');
  });
});

describe('`paused` DURUMU YOKTUR — brief §34 "Pause" neden yapılamıyor', () => {
  /**
   * BU TEST BİR İDDİA DEĞİL, BİR KANITTIR: brief §34 "Cancel Pause Finish
   * işlemleri kontrollü şekilde yapılabilmeli" der, ama `Pause` bugün
   * İMKÂNSIZDIR — duraklatılacak bir durum yoktur. Bunu yorumda söylemek
   * yeterli değildir; kaynak (migration) okunarak KANITLANIR. Migration'a
   * `paused` eklenirse bu test kırılır ve o gün Pause YAZILABİLİR hâle
   * gelir — sessizce "yapılmış gibi" görünmez.
   */
  // ⚠️ `process.cwd()` DEĞİL `REPO_ROOT`: bu dosya CI'da `apps/api`
  // dizininden, yerel harness'te depo kökünden koşar (bkz.
  // `test/support/repo-root.ts`). `process.cwd()` ile yazılsaydı YERELDE
  // yeşil, CI'da ENOENT olurdu — yaşandı (28.09.2026).
  const readMigration = (name: string): string =>
    readFileSync(join(REPO_ROOT, 'database', 'migrations', name), 'utf-8');

  const ORIGINAL = readMigration('0006_create_races_and_entries.up.sql');
  const LOCKING = readMigration('0042_add_race_locking_status.up.sql');

  /**
   * ⚠️ **YÜRÜRLÜKTEKİ YETKİ ARTIK 0042'DİR, 0006 DEĞİL.** Bu test eskiden
   * yalnızca 0006'yı okuyordu; 0006'nın CHECK'i tabloya SATIR İÇİ
   * (`status TEXT ... CHECK (...)`) yazıldığı için PostgreSQL ona
   * `races_status_check` adını verir. 0042 o kısıtı DÜŞÜRÜP yerine
   * `races_status_valid` koyar. **İki kısıt birlikte yürürlükte olsaydı
   * `locking` ÇALIŞMA ANINDA reddedilirdi** ve bunu hiçbir derleyici
   * söylemezdi — bu yüzden düşürme İDDİA EDİLİR, varsayılmaz.
   */
  it('0042 ESKİ kısıtı DÜŞÜRÜR (düşürmeseydi `locking` çalışma anında reddedilirdi)', () => {
    expect(LOCKING).toMatch(/ALTER\s+TABLE\s+races\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+races_status_check/i);
  });

  it('`races.status` CHECK`inde `paused` YOKTUR (yürürlükteki kısıt: 0042)', () => {
    const match = /status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(LOCKING);
    expect(match).not.toBeNull();
    const fromSql = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(fromSql).not.toContain('paused');
  });

  it('0042`NİN listesi ile `RaceStatus` tipi BİREBİR aynıdır', () => {
    const match = /status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(LOCKING);
    const fromSql = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(fromSql.sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('0006`NIN özgün listesi KORUNUR — 0042 onu yalnızca GENİŞLETİR', () => {
    // 0042 bir değer SİLSEYDİ, o durumdaki mevcut satırlar geçersiz hâle
    // gelirdi. Yalnızca ekleme yapıldığını kanıtlar.
    const match = /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'scheduled'\s+CHECK\s*\(\s*status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(
      ORIGINAL,
    );
    expect(match).not.toBeNull();
    const fromSql = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    for (const status of fromSql) {
      expect(ALL_STATUSES).toContain(status);
    }
  });
});

describe('RaceNotCancelableError', () => {
  const RACE_ID = '00000000-0000-0000-0000-000000000000';

  it.each<[string, RegExp]>([
    ['ALREADY_STARTED', /başladı/i],
    ['ALREADY_FINISHED', /tamamlandı/i],
    ['ALREADY_CANCELLED', /zaten iptal/i],
    ['UNKNOWN_STATUS', /tanınmadı/i],
  ])('mesaj nedeni söyler: %s', (reason, pattern) => {
    const error = new RaceNotCancelableError(reason as 'ALREADY_STARTED', RACE_ID);
    expect(error.message).toMatch(pattern);
    expect(error.message).toContain(RACE_ID);
    expect(error.name).toBe('RaceNotCancelableError');
  });

  it('mesajda TUTAR geçmez — reddedilen iptal hiçbir para hareketi üretmemiştir', () => {
    // Mesaja bir tutar koymak, olmayan bir işlemi olmuş gibi gösterirdi.
    const error = new RaceNotCancelableError('ALREADY_FINISHED', RACE_ID);
    expect(error.message).not.toMatch(/\d+\s*(money|çip|chip|altın)/i);
  });
});
