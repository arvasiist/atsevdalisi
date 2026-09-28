import { describe, expect, it } from 'vitest';
import { CannotInviteSelfError } from '../../../src/domain/social/errors';
import {
  RACE_INVITE_ACTIONS,
  assertInviteNotSelf,
  checkInviteable,
  parseRaceInviteAction,
} from '../../../src/domain/social/invite';

/**
 * `domain/social/invite.ts` birim testleri (brief §16 RACE INVITE, §42
 * PHASE 11).
 *
 * Bu dosyanın ASIL DEĞERİ iki tanesidir:
 *
 * 1. `checkInviteable`ın SINIR davranışını sabitlemesi — `startTime` TAM
 *    OLARAK `now` iken ne olacağı. `checkRaceJoinable` (katılım) ile
 *    arasındaki farkın tek kanıtı budur: katılım `maxPlayers`ı denetler,
 *    davet denetlemez (davet edilen katılmak zorunda değildir). İki kural
 *    bir gün "aynı" sanılıp birleştirilirse, buradaki testler kırılır.
 * 2. `parseRaceInviteAction`ın esbuild altında ATLANAN `@IsIn`
 *    dekoratörünün yerini gerçekten tuttuğunu kanıtlaması (CLAUDE.md kural
 *    5 — "Kardeş tuzak"). DTO dekoratörüne güvenen bir dilim, bu testler
 *    olmadan yalnızca CI'da patlar.
 */

const NOW = new Date('2026-09-28T12:00:00.000Z');

/** Test kolaylığı: `startTime`ı `NOW`a göre dakika cinsinden kaydırır. */
function raceMinutesFromNow(minutes: number, status = 'scheduled') {
  return { status, startTime: new Date(NOW.getTime() + minutes * 60_000) };
}

describe('checkInviteable — yarış davet edilebilir mi', () => {
  it('`scheduled` ve başlangıcı gelecekte olan yarış davet edilebilir', () => {
    expect(checkInviteable(raceMinutesFromNow(60), NOW)).toBeNull();
  });

  it('`scheduled` olmayan her durum NOT_SCHEDULED döner', () => {
    // `status` alanı serbest metindir; listeyi burada TEK TEK saymak
    // bilinçlidir — yeni bir yarış durumu eklenip davet kapısının
    // güncellenmemesi, sessizce "her durumda davet edilebilir" demek olurdu.
    for (const status of ['running', 'finished', 'cancelled', 'lobby', 'full']) {
      expect(checkInviteable(raceMinutesFromNow(60, status), NOW)).toBe('NOT_SCHEDULED');
    }
  });

  it('başlama zamanı GEÇMİŞ bir `scheduled` yarış ALREADY_STARTED döner', () => {
    expect(checkInviteable(raceMinutesFromNow(-1), NOW)).toBe('ALREADY_STARTED');
  });

  it('başlama zamanı TAM `now` olan yarış ALREADY_STARTED döner (sınır kapalı)', () => {
    // `<=` bilinçlidir: `checkRaceJoinable` ile aynı sınır. Tam başlangıç
    // anında gönderilen davet, karşı tarafa tıklanamayan bir [JOIN] düğmesi
    // gösterirdi.
    expect(checkInviteable(raceMinutesFromNow(0), NOW)).toBe('ALREADY_STARTED');
  });

  it('durum ÖNCE, zaman SONRA denetlenir (başlamış VE `finished` bir yarış NOT_SCHEDULED der)', () => {
    // Sıra önemlidir: ters sırada olsaydı bitmiş bir yarış "henüz
    // başlamamış gibi" görünen bir zamanla ALREADY_STARTED dönebilirdi ve
    // istemciye yanlış sebep giderdi.
    expect(checkInviteable(raceMinutesFromNow(-60, 'finished'), NOW)).toBe('NOT_SCHEDULED');
  });

  it('`now`u MUTASYONA uğratmaz (saf fonksiyon)', () => {
    const now = new Date(NOW.getTime());
    checkInviteable(raceMinutesFromNow(60), now);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});

describe('parseRaceInviteAction — gövde doğrulaması (esbuild güvenliği)', () => {
  it('kabul edilen iki değeri döndürür', () => {
    expect(parseRaceInviteAction('accept')).toBe('accept');
    expect(parseRaceInviteAction('decline')).toBe('decline');
  });

  it('kabul edilen değerler KÜMESİ `RACE_INVITE_ACTIONS` ile birebir aynıdır', () => {
    // Testi elle `['accept','decline']` yazmak yerine sabitten türetmek
    // bilinçli DEĞİL: liste sabit yazılır ki sabitin kendisi yanlışlıkla
    // değiştirilirse test kırılsın (aksi hâlde test sabitle birlikte
    // kayar ve hiçbir şeyi korumazdı).
    expect([...RACE_INVITE_ACTIONS]).toEqual(['accept', 'decline']);
  });

  it('geçersiz değerlerde `null` döner (fırlatmaz)', () => {
    // `@IsIn` esbuild altında atlanır; bu fonksiyon onun yerini tutar.
    // Fırlatmak yerine `null` dönmesi, kararın HTTP'ye çevrilmesini
    // (400 `INVALID_RACE_INVITE_ACTION`) application katmanına bırakır.
    for (const value of ['ACCEPT', 'Accept', 'accept ', 'join', '', null, undefined, 42, {}, []]) {
      expect(parseRaceInviteAction(value)).toBeNull();
    }
  });

  it('prototip zincirinden gelen değerleri kabul ETMEZ', () => {
    // `includes` kullanıldığı için `toString` gibi kalıtılmış üyeler
    // eşleşmez. `in` operatörüyle yazılmış bir kontrol burada patlardı.
    expect(parseRaceInviteAction('toString')).toBeNull();
    expect(parseRaceInviteAction('constructor')).toBeNull();
  });
});

describe('assertInviteNotSelf — kendini davet', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('aynı oyuncu için CannotInviteSelfError fırlatır', () => {
    expect(() => assertInviteNotSelf(id, id)).toThrow(CannotInviteSelfError);
  });

  it('farklı oyuncular için sessizce döner', () => {
    expect(() => assertInviteNotSelf(id, '22222222-2222-4222-8222-222222222222')).not.toThrow();
  });

  it('fırlatılan hata `CannotFriendSelfError`DEN AYRI bir sınıftır', () => {
    // Bu ayrım bilinçlidir (bkz. `invite.ts` doc yorumu): davet edilen
    // işlem DAVETTİR, arkadaşlık değil — istemciye "arkadaşlık isteği
    // gönderemezsin" dedirtmek yanlış olurdu. İki hata sınıfı bir gün
    // birleştirilirse bu test kırılır.
    try {
      assertInviteNotSelf(id, id);
      throw new Error('Hata fırlatılmadı — test kurgusu bozuk.');
    } catch (error) {
      expect(error).toBeInstanceOf(CannotInviteSelfError);
      expect((error as Error).name).toBe('CannotInviteSelfError');
    }
  });
});
