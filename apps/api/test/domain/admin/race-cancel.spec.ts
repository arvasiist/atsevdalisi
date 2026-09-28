import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RaceStatus } from '@at-sevdalisi/shared-types';
import {
  RACE_CANCEL_REFUSALS,
  checkRaceCancelable,
} from '../../../src/domain/admin/race-cancel';
import { RaceNotCancelableError } from '../../../src/domain/admin/errors';

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

const ALL_STATUSES: readonly RaceStatus[] = ['scheduled', 'in_progress', 'finished', 'cancelled'];

describe('RACE_CANCEL_REFUSALS', () => {
  it('TEKİLDİR', () => {
    expect(new Set(RACE_CANCEL_REFUSALS).size).toBe(RACE_CANCEL_REFUSALS.length);
  });

  it('`scheduled` İÇİN BİR RET NEDENİ YOKTUR (iptal edilebilir olan tek durum)', () => {
    expect(checkRaceCancelable('scheduled')).toBeNull();
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
      // `null` (izin) yalnızca `scheduled` için geçerlidir.
      // ⚠️ `toEqual`, `toBe` DEĞİL: `expect.any(String)` asimetrik bir
      // eşleştiricidir ve `toBe` onu Object.is ile karşılaştırdığı için
      // her zaman düşer (yaşandı, 28.09.2026).
      expect(checkRaceCancelable(status)).toEqual(status === 'scheduled' ? null : expect.any(String));
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
  const migration = readFileSync(
    join(
      process.cwd(),
      'database',
      'migrations',
      '0006_create_races_and_entries.up.sql',
    ),
    'utf-8',
  );

  it('`races.status` CHECK`inde `paused` YOKTUR', () => {
    const match = /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'scheduled'\s+CHECK\s*\(\s*status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(
      migration,
    );
    expect(match).not.toBeNull();
    const fromSql = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(fromSql).not.toContain('paused');
  });

  it('CHECK listesi ile `RaceStatus` tipi BİREBİR aynıdır', () => {
    const match = /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'scheduled'\s+CHECK\s*\(\s*status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(
      migration,
    );
    const fromSql = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(fromSql.sort()).toEqual([...ALL_STATUSES].sort());
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
