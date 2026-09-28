import { describe, expect, it } from 'vitest';
import {
  assertRaceWatchable,
  assertTicketNotOwned,
  assertSpectatorCapacityIsValid,
  assertTicketPriceIsValid,
  assertTribuneHasRoom,
  assertTribuneIsPaid,
  canWatchRaceWithoutTicket,
  isWithinWatchWindow,
} from '../../../src/domain/grandstand/ticket';
import {
  RaceNotWatchableError,
  RaceTicketAlreadyOwnedError,
  RaceTribuneFreeError,
  TribuneFullError,
} from '../../../src/domain/grandstand/errors';

/**
 * Tribün (grandstand) domain testleri — proje sahibinin açık talebi
 * (27.09.2026): "yarış yapılan yerlerde tribüne ücretli girişler olsun
 * insanlar yarışları izleyebilsin".
 *
 * Bu dosya `domain/grandstand/ticket.ts`'in SAF kararlarını doğrular
 * (framework'süz, DB'siz — `domain/race/readiness.spec.ts` ile AYNI desen).
 * DB tarafı (kilit + defter) yalnızca CI'daki e2e ile kanıtlanabilir.
 */

const MS_PER_HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0); // 27.09.2026 12:00 UTC

describe('isWithinWatchWindow', () => {
  it('az önce biten yarış pencere İÇİNDEDİR', () => {
    expect(isWithinWatchWindow(NOW - 1000, NOW, 48)).toBe(true);
  });

  it('pencerenin TAM sınırındaki yarış içeridedir (kapsayıcı)', () => {
    expect(isWithinWatchWindow(NOW - 48 * MS_PER_HOUR, NOW, 48)).toBe(true);
  });

  it('pencerenin bir milisaniye DIŞINDAKİ yarış dışarıdadır', () => {
    expect(isWithinWatchWindow(NOW - 48 * MS_PER_HOUR - 1, NOW, 48)).toBe(false);
  });

  it('hiç bitmemiş (gelecekteki) yarış pencerededir — bu kontrol "çok eski mi" sorusudur', () => {
    // Yarışın GERÇEKTEN bitip bitmediği AYRI bir bayrakla (`isFinished`)
    // sorulur; bu fonksiyon yalnızca üst sınırı denetler.
    expect(isWithinWatchWindow(NOW + MS_PER_HOUR, NOW, 48)).toBe(true);
  });

  it('NaN girdilerde GÜVENLİ tarafta kalır (false döner, sessizce true DEĞİL)', () => {
    expect(isWithinWatchWindow(Number.NaN, NOW, 48)).toBe(false);
    expect(isWithinWatchWindow(NOW, Number.NaN, 48)).toBe(false);
    expect(isWithinWatchWindow(NOW, NOW, Number.NaN)).toBe(false);
  });
});

describe('assertRaceWatchable', () => {
  const base = {
    raceId: 'race-1',
    isFinished: true,
    finishedAtMs: NOW - MS_PER_HOUR,
    nowMs: NOW,
    windowHours: 48,
    isOwnRace: false,
  };

  it('bitmiş, penceredeki, başkasının yarışı geçer', () => {
    expect(() => assertRaceWatchable(base)).not.toThrow();
  });

  it('KENDİ yarışı → OWN_RACE (sıra: sahiplik ilk sorulur)', () => {
    try {
      assertRaceWatchable({ ...base, isOwnRace: true });
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect(error).toBeInstanceOf(RaceNotWatchableError);
      expect((error as RaceNotWatchableError).reason).toBe('OWN_RACE');
    }
  });

  it('KENDİ yarışı hem de bitmemişse yine OWN_RACE döner (sıra deterministiktir)', () => {
    try {
      assertRaceWatchable({ ...base, isOwnRace: true, isFinished: false });
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect((error as RaceNotWatchableError).reason).toBe('OWN_RACE');
    }
  });

  it('bitmemiş yarış → RACE_NOT_FINISHED', () => {
    try {
      assertRaceWatchable({ ...base, isFinished: false });
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect((error as RaceNotWatchableError).reason).toBe('RACE_NOT_FINISHED');
    }
  });

  it('pencere dışı yarış → WATCH_WINDOW_EXPIRED', () => {
    try {
      assertRaceWatchable({ ...base, finishedAtMs: NOW - 49 * MS_PER_HOUR });
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect((error as RaceNotWatchableError).reason).toBe('WATCH_WINDOW_EXPIRED');
    }
  });

  it('hata, sorgulanan yarışın id\'sini taşır (log/telemetri için)', () => {
    try {
      assertRaceWatchable({ ...base, raceId: 'race-42', isFinished: false });
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect((error as RaceNotWatchableError).raceId).toBe('race-42');
    }
  });
});

describe('assertTicketNotOwned', () => {
  it('bilet YOKSA geçer', () => {
    expect(() => assertTicketNotOwned(false, 'race-1')).not.toThrow();
  });

  it('bilet VARSA 409 sınıfı hata fırlatır', () => {
    expect(() => assertTicketNotOwned(true, 'race-1')).toThrow(RaceTicketAlreadyOwnedError);
  });
});

describe('assertTicketPriceIsValid', () => {
  it('pozitif tam sayı geçer', () => {
    expect(() => assertTicketPriceIsValid(25)).not.toThrow();
    expect(() => assertTicketPriceIsValid(1)).not.toThrow();
  });

  it('SIFIR reddedilir — ücretsiz bilet sessiz bir ekonomi sızıntısı olurdu', () => {
    expect(() => assertTicketPriceIsValid(0)).toThrow();
  });

  it('negatif reddedilir — bilet alana para ÖDEMEK anlamına gelirdi', () => {
    expect(() => assertTicketPriceIsValid(-25)).toThrow();
  });

  it('ondalıklı reddedilir — BIGINT sütununa kayan noktalı değer yazılamaz', () => {
    expect(() => assertTicketPriceIsValid(25.5)).toThrow();
  });

  it('NaN/Infinity reddedilir', () => {
    expect(() => assertTicketPriceIsValid(Number.NaN)).toThrow();
    expect(() => assertTicketPriceIsValid(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('assertSpectatorCapacityIsValid (PHASE 7.1)', () => {
  it('pozitif tam sayı geçer', () => {
    expect(() => assertSpectatorCapacityIsValid(500)).not.toThrow();
    expect(() => assertSpectatorCapacityIsValid(1)).not.toThrow();
  });

  it('SIFIR reddedilir — kapasitesi 0 olan tribüne hiç kimse giremez', () => {
    // Şemadaki `races_spectator_capacity_positive` CHECK'inin AYNISI.
    // Burada yakalanmazsa hata `23514` olarak, hangi dosyanın bozuk
    // olduğunu söylemeden çıkardı.
    expect(() => assertSpectatorCapacityIsValid(0)).toThrow();
  });

  it('negatif ve ondalıklı reddedilir (sütun INTEGER)', () => {
    expect(() => assertSpectatorCapacityIsValid(-1)).toThrow();
    expect(() => assertSpectatorCapacityIsValid(500.5)).toThrow();
  });

  it('NaN/Infinity reddedilir', () => {
    expect(() => assertSpectatorCapacityIsValid(Number.NaN)).toThrow();
    expect(() => assertSpectatorCapacityIsValid(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('canWatchRaceWithoutTicket (PHASE 7.1)', () => {
  it('POZİTİF ücretli yarışta false — bilet gerekir', () => {
    expect(canWatchRaceWithoutTicket(25)).toBe(false);
    expect(canWatchRaceWithoutTicket(1)).toBe(false);
  });

  it('SIFIR ücretli yarışta true — tribün ücretsizdir', () => {
    expect(canWatchRaceWithoutTicket(0)).toBe(true);
  });

  it('NEGATİF değer de true — bozuk veride "herkese açık" tarafına düşer', () => {
    // Şema `tribune_fee >= 0` der, yani bu görülemez; ama tersi yönde
    // (kapalı) düşmek yarışı KİMSEYE açmazdı. Kapı yarışın VARLIĞINI zaten
    // doğruladığı için bu yön bilgi sızdırmaz.
    expect(canWatchRaceWithoutTicket(-5)).toBe(true);
  });

  it('NaN (NULL okuma) da true — güvenli taraf "açık", çünkü yarış zaten doğrulandı', () => {
    expect(canWatchRaceWithoutTicket(Number.NaN)).toBe(true);
  });
});

describe('assertTribuneHasRoom (PHASE 7.1)', () => {
  it('boş tribünde geçer', () => {
    expect(() => assertTribuneHasRoom(0, 500, 'race-1')).not.toThrow();
  });

  it('kapasitenin BİR EKSİĞİNDE geçer — kapasite kapsayıcı üst sınırdır', () => {
    expect(() => assertTribuneHasRoom(499, 500, 'race-1')).not.toThrow();
  });

  it('kapasite DOLDUĞUNDA fırlatır (kapasite + 1 kabul edilmez)', () => {
    expect(() => assertTribuneHasRoom(500, 500, 'race-1')).toThrow(TribuneFullError);
  });

  it('kapasite AŞILMIŞSA da fırlatır', () => {
    expect(() => assertTribuneHasRoom(501, 500, 'race-1')).toThrow(TribuneFullError);
  });

  it('hata, yarışın id\'sini ve kapasiteyi taşır (log/telemetri için)', () => {
    try {
      assertTribuneHasRoom(1, 1, 'race-42');
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect((error as TribuneFullError).raceId).toBe('race-42');
      expect((error as TribuneFullError).capacity).toBe(1);
    }
  });
});

describe('assertTribuneIsPaid (PHASE 7.1)', () => {
  it('ücretli yarışta geçer — bilet satılabilir', () => {
    expect(() => assertTribuneIsPaid(25, 'race-1')).not.toThrow();
  });

  it('ÜCRETSİZ yarışta fırlatır — 0 tutarlı bir defter satırı üretemez', () => {
    // `economy_transactions.amount <> 0` kısıtı (migration 0019): bu yol
    // bulunmazsa ya 500'e düşerdi ya da biri "0 tutarlı bilet" yazardı.
    expect(() => assertTribuneIsPaid(0, 'race-1')).toThrow(RaceTribuneFreeError);
  });

  it('canWatchRaceWithoutTicket ile AYNI kararı verir (ikisi ayrışamaz)', () => {
    // Bu ikisi ayrışsaydı ya bedava yarışa bilet satılır ya da bedava
    // yarış kimseye açılmazdı — ikisi de sessiz bir hata olurdu.
    for (const fee of [-1, 0, 1, 25, Number.NaN]) {
      const watchable = canWatchRaceWithoutTicket(fee);
      let threw = false;
      try {
        assertTribuneIsPaid(fee, 'race-1');
      } catch {
        threw = true;
      }
      expect(threw).toBe(watchable);
    }
  });
});
