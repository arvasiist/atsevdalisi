import { describe, expect, it } from 'vitest';
import {
  checkRaceJoinable,
  nextGatePosition,
  validateRaceJoin,
  DEFAULT_RISK_LEVEL,
  DEFAULT_TACTICAL_STYLE,
} from '../../../src/domain/race/lobby';

/**
 * YARIŞA KATILMA — saf domain katmanı (brief §2/§3/§6, §42 PHASE 1b).
 *
 * **NEDEN BU TESTLER DB OLMADAN KOŞAR:** `validateRaceJoin`/`checkRaceJoinable`/
 * `nextGatePosition` `domain/` katmanındadır ve orası framework'süz saf
 * TS'tir (CLAUDE.md kural 4). Karar mantığının DB'ye hiç dokunmadan
 * doğrulanabilmesi tesadüf değil, tasarımdır: kurallar burada test edilir,
 * DB'ye YAZILMA garantisi ayrıca e2e'de (`race-join.e2e-spec.ts`) sınanır.
 *
 * **BU DOSYANIN ASIL DEĞERİ "500 DEĞİL 400" KAPISIDIR.** CLAUDE.md kural
 * 5: Vitest/esbuild `design:paramtypes` üretmediği için `ValidationPipe`
 * gövdeyi HİÇ doğrulamaz — yani `horseId` çalışma anında gerçekten bir
 * sayı, bir dizi ya da `null` olabilir. `validateRaceJoin` `typeof`
 * kontrolü olmadan `horseId.trim()` çağırsaydı bu girdiler `TypeError`
 * fırlatır ve kullanıcı 400 yerine **500** görürdü.
 */
const VALID_HORSE_ID = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

describe('validateRaceJoin — gövde doğrulaması', () => {
  it('geçerli bir gövdeyi daraltır ve sorun döndürmez', () => {
    const result = validateRaceJoin({
      horseId: VALID_HORSE_ID,
      tacticalStyle: 'front_runner',
      riskLevel: 'high',
    });

    expect(result.problems).toEqual([]);
    expect(result.value).toEqual({
      horseId: VALID_HORSE_ID,
      tacticalStyle: 'front_runner',
      riskLevel: 'high',
    });
  });

  it('taktik/risk VERİLMEZSE güvenli varsayılanlar yazılır (brief §14.2)', () => {
    // Zorunlu tutmak istemciyi katılım anında henüz karar vermediği bir
    // seçime mecbur bırakırdı; brief §6 zaten katılımdan SONRA ayrı bir
    // READY adımı öngörür (PHASE 3).
    const result = validateRaceJoin({ horseId: VALID_HORSE_ID });

    expect(result.value).toEqual({
      horseId: VALID_HORSE_ID,
      tacticalStyle: DEFAULT_TACTICAL_STYLE,
      riskLevel: DEFAULT_RISK_LEVEL,
    });
  });

  it('`horseId` YOKSA 400\'lük sorun döner (fırlatmaz)', () => {
    const result = validateRaceJoin({ horseId: undefined });

    expect(result.value).toBeNull();
    expect(result.problems.length).toBe(1);
    expect(result.problems[0]).toContain('At kimliği');
  });

  it('`horseId` UUID DEĞİLSE reddedilir', () => {
    // `@IsUUID()` DTO dekoratörü esbuild altında atlanır; biçim burada
    // BAĞIMSIZ doğrulanmazsa değer DB'ye ulaşır ve `22P02` ile 500 döner.
    const result = validateRaceJoin({ horseId: 'at-1' });

    expect(result.value).toBeNull();
    expect(result.problems[0]).toContain('UUID');
  });

  const wrongTypedHorseIds: Array<[string, unknown]> = [
    ['sayı', 42],
    ['null', null],
    ['dizi', [VALID_HORSE_ID]],
    ['nesne', { id: VALID_HORSE_ID }],
    ['boolean', true],
  ];

  it.each(wrongTypedHorseIds)('yanlış TİPTE `horseId` (%s) FIRLATMAZ, sorun döner', (_label, horseId) => {
    // BU TESTİN VARLIK SEBEBİ: `typeof` kontrolü olmadan `horseId.trim()`
    // `TypeError` fırlatır ve istemci 500 görürdü.
    const result = validateRaceJoin({ horseId });

    expect(result.value).toBeNull();
    expect(result.problems.length).toBe(1);
  });

  const invalidTactics: Array<[string, Record<string, unknown>]> = [
    ['bilinmeyen taktik', { tacticalStyle: 'sprint' }],
    ['taktik sayı', { tacticalStyle: 1 }],
    ['bilinmeyen risk', { riskLevel: 'extreme' }],
    ['risk null', { riskLevel: null }],
  ];

  it.each(invalidTactics)('geçersiz taktik/risk (%s) reddedilir', (_label, override) => {
    const result = validateRaceJoin({ horseId: VALID_HORSE_ID, ...override });

    expect(result.value).toBeNull();
    expect(result.problems.length).toBe(1);
  });

  it('birden fazla hatalı alan TEK seferde toplanır', () => {
    // İlk hatada durmak kullanıcıyı "düzelt, gönder, ikinci hatayı gör"
    // döngüsüne sokardı — `validateRaceCreation` ile AYNI gerekçe.
    const result = validateRaceJoin({ horseId: 'at-1', tacticalStyle: 'sprint', riskLevel: 'extreme' });

    expect(result.value).toBeNull();
    expect(result.problems.length).toBe(3);
  });

  it('`undefined` taktik/risk HATA değildir, `null` İSE hatadır', () => {
    // Ayrım önemlidir: alan hiç gönderilmemişse varsayılan uygulanır,
    // ama açıkça `null` gönderilmişse istemci "bu alanı boşalt" demiştir
    // ve bu bilinen bir değer değildir.
    expect(validateRaceJoin({ horseId: VALID_HORSE_ID, tacticalStyle: undefined }).value?.tacticalStyle).toBe(
      DEFAULT_TACTICAL_STYLE,
    );
    expect(validateRaceJoin({ horseId: VALID_HORSE_ID, tacticalStyle: null }).value).toBeNull();
  });

  it('gövdedeki `playerId` YOK SAYILIR (sunucu otoritesi)', () => {
    // `RaceJoinInput`'ta böyle bir alan YOKTUR — bu test o kararın
    // görünür hâlidir: gövdeye `playerId` konulsa bile daraltılmış
    // sonuçta BELİRMEZ, çünkü katılan kişi `CurrentPlayer()`'dan gelir.
    const result = validateRaceJoin({
      horseId: VALID_HORSE_ID,
      playerId: 'baska-oyuncu',
    } as never);

    expect(result.value).not.toBeNull();
    expect(result.value).not.toHaveProperty('playerId');
  });
});

describe('checkRaceJoinable — durum denetimi (brief §2/§6)', () => {
  const startTime = new Date('2026-10-01T12:00:00.000Z');
  const before = new Date('2026-10-01T11:00:00.000Z');

  function race(override: Partial<{ status: string; startTime: Date; maxPlayers: number; joinedPlayers: number }> = {}) {
    return { status: 'scheduled', startTime, maxPlayers: 8, joinedPlayers: 0, ...override };
  }

  it('planlanmış, başlamamış ve kontenjanı olan yarış KABUL edilir', () => {
    expect(checkRaceJoinable(race(), before)).toBeNull();
  });

  it('`scheduled` DIŞINDAKİ her durum reddedilir', () => {
    for (const status of ['running', 'finished', 'cancelled']) {
      expect(checkRaceJoinable(race({ status }), before)).toBe('NOT_SCHEDULED');
    }
  });

  it('başlangıç zamanı GEÇMİŞSE reddedilir', () => {
    expect(checkRaceJoinable(race(), new Date('2026-10-01T13:00:00.000Z'))).toBe('ALREADY_STARTED');
  });

  it('TAM başlangıç anında katılım KAPALIDIR (sınırda kapalı)', () => {
    // Motorun snapshot'ı tam o anda alınır; sonradan gelen katılım
    // KOŞULMUŞ bir yarışa girmek olurdu.
    expect(checkRaceJoinable(race(), startTime)).toBe('ALREADY_STARTED');
  });

  it('kontenjan dolduğunda FULL döner', () => {
    expect(checkRaceJoinable(race({ maxPlayers: 8, joinedPlayers: 8 }), before)).toBe('FULL');
  });

  it('kontenjan SON boş koltukta hâlâ açıktır', () => {
    // `joinedPlayers (7) >= maxPlayers (8)` YANLIŞ olduğundan 8. oyuncu
    // girebilmelidir — sınır hatası (off-by-one) tam burada oluşur.
    expect(checkRaceJoinable(race({ maxPlayers: 8, joinedPlayers: 7 }), before)).toBeNull();
  });

  it('ret nedeni ÖNCELİĞİ: durum > zaman > kontenjan', () => {
    // Üçü birden bozuksa kullanıcıya EN ANLAMLI neden gösterilmelidir:
    // "iptal edilmiş bir yarış dolu" demek yanıltıcı olurdu.
    const broken = race({ status: 'cancelled', joinedPlayers: 99 });
    expect(checkRaceJoinable(broken, new Date('2026-10-01T13:00:00.000Z'))).toBe('NOT_SCHEDULED');
    expect(checkRaceJoinable(race({ joinedPlayers: 99 }), new Date('2026-10-01T13:00:00.000Z'))).toBe('ALREADY_STARTED');
  });
});

describe('nextGatePosition — kulvar ataması (brief §7)', () => {
  it('boş listede 1 döner (kulvarlar 1\'den başlar)', () => {
    expect(nextGatePosition([])).toBe(1);
  });

  it('sıralı dolu listede bir sonraki numarayı verir', () => {
    expect(nextGatePosition([1, 2, 3])).toBe(4);
  });

  it('ARADAKİ boşluğu yeniden kullanır', () => {
    // `used.length + 1` bu durumda 3 verirdi ve 2 numaralı kulvar
    // sonsuza kadar boş kalırdı — `participant_limit`'e gereksiz yer.
    expect(nextGatePosition([1, 3])).toBe(2);
    expect(nextGatePosition([2, 3])).toBe(1);
  });

  it('girdi dizisini DEĞİŞTİRMEZ', () => {
    const used = [1, 3];
    nextGatePosition(used);
    expect(used).toEqual([1, 3]);
  });

  it('tekrarlı değerlerde çakışma üretmez', () => {
    expect(nextGatePosition([1, 1, 2])).toBe(3);
  });
});
