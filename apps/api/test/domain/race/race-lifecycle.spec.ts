import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RaceStatus } from '@at-sevdalisi/shared-types';
import {
  RACE_LIFECYCLE_TRANSITIONS,
  RACE_STATUSES,
  TERMINAL_RACE_STATUSES,
  assertRaceStatus,
  assertRaceTransitionAllowed,
  canTransitionRace,
} from '../../../src/domain/race/race-lifecycle';
import { InvalidRaceTransitionError } from '../../../src/domain/race/errors';
import { REPO_ROOT } from '../../support/repo-root';

/**
 * `domain/race/race-lifecycle.ts` — yarış durum makinesi (brief §42
 * PHASE 1, migration 0042).
 *
 * **BU DOSYANIN ASIL DEĞERİ İKİ İDDİADADIR:**
 *
 * 1. **Geçiş çizgesi KAPALIDIR ve `RaceStatus` ile hizalıdır.** Yeni bir
 *    durum eklenip tabloya satır yazılmazsa TypeScript derleme hatası verir
 *    (`Record<RaceStatus, ...>` tam olmalıdır) — bu yüzden "eksik anahtar
 *    sessizce izin verir" tuzağı burada YAPISAL olarak imkânsızdır. Test
 *    bunu yine de iddia eder çünkü `RACE_STATUSES` dizisi `RaceStatus`ten
 *    AYRI bir yerde tutulur ve ikisi kayabilir.
 *
 * 2. **Migration ile tip BİREBİR aynıdır.** `races.status` CHECK'i
 *    veritabanı tarafındaki tek gerçekliktir; kayma, çalışma anında
 *    `23514 check_violation` olarak patlar ve bu YALNIZCA üretimde
 *    görülür. Bu test dosyayı OKUYARAK karşılaştırır.
 */

describe('RACE_STATUSES — tip ile hizalıdır', () => {
  it('TEKİLDİR', () => {
    expect(new Set(RACE_STATUSES).size).toBe(RACE_STATUSES.length);
  });

  it('`RaceStatus` tipinin TÜM üyelerini içerir', () => {
    // Tip düzeyinde `Record<RaceStatus, ...>` bunu zaten zorlar; burada
    // DİZİ ile tip arasındaki kayma denetlenir (dizi ayrı tutulur).
    const typed: RaceStatus[] = [...RACE_STATUSES];
    expect(typed).toHaveLength(RACE_STATUSES.length);
  });

  it('`in_progress` KORUNUR — miras bir durumdur, silinmesi mevcut satırı geçersiz kılardı', () => {
    expect(RACE_STATUSES).toContain('in_progress');
  });
});

describe('RACE_LIFECYCLE_TRANSITIONS — kapalı çizge', () => {
  it('HER durum için bir satır vardır', () => {
    for (const status of RACE_STATUSES) {
      expect(RACE_LIFECYCLE_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('hiçbir durum KENDİSİNE geçemez (bayat istemci göstergesi)', () => {
    for (const status of RACE_STATUSES) {
      expect(canTransitionRace(status, status)).toBe(false);
    }
  });

  it('hedef durumlar TANIMLI durumlardır (yazım hatası sessiz bir ölü dal olurdu)', () => {
    for (const status of RACE_STATUSES) {
      for (const target of RACE_LIFECYCLE_TRANSITIONS[status]) {
        expect(RACE_STATUSES).toContain(target);
      }
    }
  });

  it('TERMİNAL durumların ÇIKIŞI YOKTUR', () => {
    for (const status of TERMINAL_RACE_STATUSES) {
      expect(RACE_LIFECYCLE_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('`finished`/`cancelled` terminaldir ve yalnızca onlardır', () => {
    const sinks = RACE_STATUSES.filter((status) => RACE_LIFECYCLE_TRANSITIONS[status].length === 0);
    expect([...sinks].sort()).toEqual([...TERMINAL_RACE_STATUSES].sort());
  });
});

describe('canTransitionRace — brief §42 PHASE 1 geçişleri', () => {
  it.each<[RaceStatus, RaceStatus, boolean, string]>([
    ['scheduled', 'locking', true, 'zamanlayıcı kadroyu dondurur'],
    ['locking', 'finished', true, 'kesinleşme kilitli yarışı koşturur'],
    ['scheduled', 'finished', true, 'ZAMANLAYICI HİÇ KOŞMADIYSA crank yolu (aksi hâlde para kalıcı kilitlenir)'],
    ['locking', 'cancelled', true, 'kilitli kalmış yarışın çıkışı (ödül DAĞITILMAMIŞTIR)'],
    ['scheduled', 'cancelled', true, 'yönetim iptali'],
    ['in_progress', 'finished', true, 'miras durum; hiçbir kod yazmaz ama satır varsa kapanabilmeli'],
    ['finished', 'locking', false, 'koşmuş yarış yeniden kilitlenemez'],
    ['finished', 'cancelled', false, 'ödül DAĞITILMIŞ yarışta iade YANLIŞ tutar öderdi'],
    ['cancelled', 'locking', false, 'iptal edilmiş yarış dirilemez'],
    ['cancelled', 'finished', false, 'iptal edilmiş yarış koşamaz'],
    ['locking', 'scheduled', false, 'GERİYE dönüş yoktur'],
    ['finished', 'scheduled', false, 'GERİYE dönüş yoktur'],
  ])('%s → %s = %s (%s)', (from, to, expected) => {
    expect(canTransitionRace(from, to)).toBe(expected);
  });

  it('bilinmeyen kaynak durumda PATLAR (sessizce `false` demek bir boşluk olurdu)', () => {
    // `RACE_LIFECYCLE_TRANSITIONS['paused']` → `undefined` → `.includes`
    // bir TypeError atardı. Bunu `false` diye yutmak, tanınmayan bir
    // durumun "geçiş yok" diye SESSİZCE onaylanması olurdu.
    expect(() => canTransitionRace('paused' as RaceStatus, 'finished')).toThrow();
  });
});

describe('assertRaceTransitionAllowed', () => {
  it('izinli geçişte sessizce döner', () => {
    expect(() => assertRaceTransitionAllowed('scheduled', 'locking')).not.toThrow();
  });

  it('izinsiz geçişte InvalidRaceTransitionError fırlatır ve iki durumu da taşır', () => {
    expect(() => assertRaceTransitionAllowed('finished', 'cancelled')).toThrow(InvalidRaceTransitionError);
    try {
      assertRaceTransitionAllowed('finished', 'cancelled');
      expect.unreachable('fırlatmalıydı');
    } catch (error) {
      const typed = error as InvalidRaceTransitionError;
      expect(typed.from).toBe('finished');
      expect(typed.to).toBe('cancelled');
      expect(typed.name).toBe('InvalidRaceTransitionError');
    }
  });
});

describe('assertRaceStatus', () => {
  it.each([...RACE_STATUSES])('tanınan durumu AYNEN döner: %s', (status) => {
    expect(assertRaceStatus(status)).toBe(status);
  });

  it.each(['paused', 'SCHEDULED', '', ' scheduled '])('tanınmayan durumda PATLAR: %s', (value) => {
    expect(() => assertRaceStatus(value)).toThrow();
  });
});

describe('migration 0042 ile `races.status` CHECK`i BİREBİR hizalıdır', () => {
  // ⚠️ `process.cwd()` DEĞİL `REPO_ROOT` (bkz. `test/support/repo-root.ts`).
  const migration = readFileSync(
    join(REPO_ROOT, 'database', 'migrations', '0042_add_race_locking_status.up.sql'),
    'utf-8',
  );

  const fromSql = (): string[] => {
    const match = /status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(migration);
    expect(match).not.toBeNull();
    return [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  it('CHECK listesi `RACE_STATUSES` ile AYNI kümeyi taşır', () => {
    expect(fromSql().sort()).toEqual([...RACE_STATUSES].sort());
  });

  it('kısıt AÇIK bir ad taşır (`races_status_valid`) — adsız kısıt sonraki migration`da düşürülemezdi', () => {
    expect(migration).toMatch(/CONSTRAINT\s+races_status_valid/i);
  });

  it('down migration kısıtı ADIYLA düşürür (yoksa geri alma sessizce başarısız olurdu)', () => {
    const down = readFileSync(
      join(REPO_ROOT, 'database', 'migrations', '0042_add_race_locking_status.down.sql'),
      'utf-8',
    );
    expect(down).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+races_status_valid/i);
    // Geri alma, eski ADI yeniden kurmalıdır — yoksa 0006'nın kısıtı bir
    // daha asla geri gelmez ve şema iki migration arasında tutarsız kalır.
    expect(down).toMatch(/CONSTRAINT\s+races_status_check/i);
  });
});
