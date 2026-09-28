import { describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import {
  checkRaceJoinable,
  checkRaceSettleable,
  normalizeRaceName,
  validateRaceCreation,
  type RaceCreationInput,
  type ValidatedRaceCreation,
} from '../../../src/domain/race/lobby';

/**
 * `domain/race/lobby.ts` — yarış tanımı doğrulaması (brief §1-§11, §42 PHASE 1).
 *
 * **BU DOSYANIN ASIL İŞİ, "GEÇERSİZ GİRDİ 500 FIRLATMASIN" İDDİASINI
 * KANITLAMAKTIR.** `RaceCreationInput`'un tüm alanları `unknown`'dır çünkü
 * gövde doğrulaması esbuild altında atlanır (CLAUDE.md kural 5) — yani
 * `name: 42` gibi bir değer gerçekten gelebilir. Naif bir uygulama
 * (`name.trim()`) burada `TypeError` fırlatır ve istemci 400 yerine **500**
 * görür. Aşağıdaki "yanlış tipte girdi" testleri bu yüzden VAR'dır: her
 * alan, yanlış tipte geldiğinde bir SORUN üretmeli — bir istisna DEĞİL.
 */
const config = loadRaceLobbyConfig();

/** Sabit bir "şimdi" — `validateRaceCreation` saf olduğu için test deterministiktir (bkz. doc yorumu). */
const NOW = new Date('2026-09-27T12:00:00.000Z');

/** Geçerli bir taban girdi; her test yalnızca ilgilendiği alanı bozar. */
function validInput(): RaceCreationInput {
  return {
    name: 'Boğaziçi Kupası',
    fieldSize: 12,
    maxPlayers: 8,
    entryFee: 500,
    raceType: 'paid',
    // NOW + 1 saat → `startDelaySeconds` [60, 604800] aralığının içinde.
    startTime: '2026-09-27T13:00:00.000Z',
    surface: 'grass',
    weather: 'sunny',
    distanceMeters: 1_600,
    tribuneFee: 25,
    spectatorCapacity: 1_000,
  };
}

/** Geçerli olduğu KANITLANMIŞ değeri döner; değilse testi anlaşılır biçimde düşürür. */
function expectValid(input: RaceCreationInput): ValidatedRaceCreation {
  const { problems, value } = validateRaceCreation(input, config, NOW);
  expect(problems).toEqual([]);
  expect(value).not.toBeNull();
  return value as ValidatedRaceCreation;
}

/** Sorun üretildiğini VE değer ÜRETİLMEDİĞİNİ doğrular — ikisi ayrılmaz (bkz. `RaceCreationValidation`). */
function expectInvalid(input: RaceCreationInput, expectedFragment: string): string[] {
  const { problems, value } = validateRaceCreation(input, config, NOW);
  expect(value).toBeNull();
  expect(problems.length).toBeGreaterThan(0);
  expect(problems.join(' | ')).toContain(expectedFragment);
  return problems;
}

describe('validateRaceCreation — geçerli girdi', () => {
  it('geçerli bir tanım HİÇBİR sorun üretmez', () => {
    expectValid(validInput());
  });

  it('adı `trim()` eder (DB\'ye boşluklu ad yazılmaz)', () => {
    const value = expectValid({ ...validInput(), name: '   Boğaziçi Kupası   ' });
    expect(value.name).toBe('Boğaziçi Kupası');
  });

  it('`startTime` metnini `Date`\'e çevirir', () => {
    const value = expectValid(validInput());
    expect(value.startTime).toBeInstanceOf(Date);
    expect(value.startTime.toISOString()).toBe('2026-09-27T13:00:00.000Z');
  });

  it('`prizePool` HER ZAMAN 0\'dır (brief §3 — havuz katılımcılarla büyür)', () => {
    // Ücretli bir yarışta bile 0: yarış açıldığı anda ortada katılımcı
    // yoktur, dolayısıyla `entryFee × participantCount = 0`dır.
    expect(expectValid({ ...validInput(), entryFee: 1_000 }).prizePool).toBe(0);
  });

  it('`free` yarış (entryFee = 0) geçerlidir', () => {
    const value = expectValid({ ...validInput(), raceType: 'free', entryFee: 0 });
    expect(value.raceType).toBe('free');
    expect(value.entryFee).toBe(0);
  });

  it('ücretsiz tribün (tribuneFee = 0) geçerlidir (brief §9 FREE)', () => {
    expect(expectValid({ ...validInput(), tribuneFee: 0 }).tribuneFee).toBe(0);
  });

  it('`maxPlayers` tam olarak `fieldSize` olabilir (AI koltuğu kalmaz)', () => {
    expect(expectValid({ ...validInput(), fieldSize: 8, maxPlayers: 8 }).maxPlayers).toBe(8);
  });

  it('`maxPlayers` tam olarak `minPlayers` olabilir (brief §6 sınır durumu)', () => {
    expect(expectValid({ ...validInput(), maxPlayers: config.minPlayers }).maxPlayers).toBe(config.minPlayers);
  });
});

describe('validateRaceCreation — ad (brief §1)', () => {
  it('çok kısa ad reddedilir', () => {
    expectInvalid({ ...validInput(), name: 'ab' }, 'Yarış adı');
  });

  it('çok uzun ad reddedilir', () => {
    expectInvalid({ ...validInput(), name: 'a'.repeat(config.nameLength.max + 1) }, 'Yarış adı');
  });

  it('yalnızca boşluklardan oluşan ad reddedilir (trim SONRASI uzunluk sayılır)', () => {
    // Kritik: `trim()` edilmeden sayılsaydı `'        '` 8 karakter görünür
    // ve `min = 3` kontrolünü GEÇERDİ — DB'ye ise boş bir ad yazılırdı.
    expectInvalid({ ...validInput(), name: '        ' }, 'Yarış adı');
  });

  it('tam olarak `nameLength.min` ve `max` uzunluktaki adlar geçerlidir', () => {
    expectValid({ ...validInput(), name: 'a'.repeat(config.nameLength.min) });
    expectValid({ ...validInput(), name: 'a'.repeat(config.nameLength.max) });
  });

  it.each([
    ['sayı', 42],
    ['null', null],
    ['undefined', undefined],
    ['dizi', ['ad']],
    ['nesne', { ad: 'x' }],
    ['boolean', true],
  ])('ad %s ise SORUN üretilir (istisna DEĞİL)', (_label, name) => {
    // Bu testin varlık sebebi 500 regresyonudur: `typeof` kontrolü
    // olmadan `name.trim()` bir `TypeError` fırlatırdı.
    expectInvalid({ ...validInput(), name }, 'Yarış adı');
  });
});

describe('validateRaceCreation — at sayısı ve oyuncu tavanı (brief §1, §6, §7)', () => {
  it('`fieldSizes` dışındaki bir at sayısı reddedilir', () => {
    expectInvalid({ ...validInput(), fieldSize: 9, maxPlayers: 8 }, 'At sayısı');
  });

  it('metin olarak gönderilen at sayısı reddedilir ("8" ≠ 8)', () => {
    // JSON gövdesinden `"8"` gelmesi gerçek bir senaryodur (istemci
    // hatası). `config.fieldSizes.includes('8')` → false; sessizce
    // `Number()` dönüşümü YAPILMAZ çünkü o, istemci hatasını gizlerdi.
    expectInvalid({ ...validInput(), fieldSize: '8' }, 'At sayısı');
  });

  it('`maxPlayers`, `fieldSize`\'ı aşamaz (brief §6)', () => {
    expectInvalid({ ...validInput(), fieldSize: 8, maxPlayers: 10 }, 'aşamaz');
  });

  it('`maxPlayers`, `config.maxPlayers`\'ı aşamaz', () => {
    expectInvalid({ ...validInput(), fieldSize: 16, maxPlayers: config.maxPlayers + 1 }, 'aşamaz');
  });

  it('`maxPlayers`, `minPlayers`\'ın altına inemez (aksi hâlde yarış hiç başlayamaz)', () => {
    expectInvalid({ ...validInput(), maxPlayers: config.minPlayers - 1 }, 'en az');
  });

  it('`maxPlayers` tam sayı değilse reddedilir', () => {
    expectInvalid({ ...validInput(), maxPlayers: 8.5 }, 'tam sayı');
  });

  it('`maxPlayers` 0 ise reddedilir', () => {
    expectInvalid({ ...validInput(), maxPlayers: 0 }, 'en az 1');
  });

  it('`fieldSize` GEÇERSİZKEN `maxPlayers` için ANLAMSIZ bir karşılaştırma mesajı üretilmez', () => {
    // `fieldSize = 9` (geçersiz) + `maxPlayers = 10` olsaydı, naif bir
    // uygulama "10, at sayısını (9) aşamaz" derdi — kullanıcıya hiçbir
    // şey söylemeyen, üstelik geçersiz bir sayıya atıf yapan bir mesaj.
    const problems = expectInvalid({ ...validInput(), fieldSize: 9, maxPlayers: 10 }, 'At sayısı');
    expect(problems.join(' | ')).not.toContain('aşamaz');
  });
});

describe('validateRaceCreation — yarış tipi ve giriş ücreti (brief §1, §2, §41)', () => {
  it('bilinmeyen yarış tipi reddedilir', () => {
    expectInvalid({ ...validInput(), raceType: 'premium' }, "Yarış tipi");
  });

  it('ücretsiz yarışta giriş ücreti 0 değilse reddedilir', () => {
    expectInvalid({ ...validInput(), raceType: 'free', entryFee: 50 }, 'giriş ücreti 0');
  });

  it('ücretli yarışta giriş ücreti seçeneklerden biri değilse reddedilir', () => {
    expectInvalid({ ...validInput(), raceType: 'paid', entryFee: 75 }, 'Giriş ücreti');
  });

  it('ücretli yarışta giriş ücreti 0 ise reddedilir', () => {
    // `races_race_type_matches_fee` kısıtının domain karşılığı: DB'ye
    // gitseydi `23514 check_violation` → istemci 500 görürdü.
    expectInvalid({ ...validInput(), raceType: 'paid', entryFee: 0 }, 'Giriş ücreti');
  });

  it('giriş ücreti metin olarak gönderilirse reddedilir', () => {
    expectInvalid({ ...validInput(), raceType: 'paid', entryFee: '500' }, 'Giriş ücreti');
  });
});

describe('validateRaceCreation — tribün (brief §9, §10, §11)', () => {
  it('seçenek dışı tribün ücreti reddedilir', () => {
    expectInvalid({ ...validInput(), tribuneFee: 15 }, 'Tribün ücreti');
  });

  it('negatif tribün ücreti reddedilir', () => {
    expectInvalid({ ...validInput(), tribuneFee: -1 }, 'Tribün ücreti');
  });

  it('seçenek dışı izleyici kapasitesi reddedilir', () => {
    expectInvalid({ ...validInput(), spectatorCapacity: 999 }, 'Tribün kapasitesi');
  });

  it('sıfır izleyici kapasitesi reddedilir', () => {
    // `races_spectator_capacity_positive` (migration 0036) `> 0` der.
    expectInvalid({ ...validInput(), spectatorCapacity: 0 }, 'Tribün kapasitesi');
  });
});

describe('validateRaceCreation — mesafe, pist, hava (brief §1)', () => {
  it('aralığın altındaki mesafe reddedilir', () => {
    expectInvalid({ ...validInput(), distanceMeters: config.distanceMeters.min - 1 }, 'Mesafe');
  });

  it('aralığın üstündeki mesafe reddedilir', () => {
    expectInvalid({ ...validInput(), distanceMeters: config.distanceMeters.max + 1 }, 'Mesafe');
  });

  it('ondalıklı mesafe reddedilir', () => {
    expectInvalid({ ...validInput(), distanceMeters: 1_600.5 }, 'tam sayı');
  });

  it('sınır değerleri (min ve max) geçerlidir', () => {
    expectValid({ ...validInput(), distanceMeters: config.distanceMeters.min });
    expectValid({ ...validInput(), distanceMeters: config.distanceMeters.max });
  });

  it('bilinmeyen pist yüzeyi reddedilir', () => {
    expectInvalid({ ...validInput(), surface: 'sand' }, 'Pist yüzeyi');
  });

  it('bilinmeyen hava durumu reddedilir', () => {
    expectInvalid({ ...validInput(), weather: 'snowy' }, 'Hava durumu');
  });

  it('pist/hava metin değilse reddedilir', () => {
    expectInvalid({ ...validInput(), surface: 1 }, 'Pist yüzeyi');
    expectInvalid({ ...validInput(), weather: null }, 'Hava durumu');
  });
});

describe('validateRaceCreation — başlangıç zamanı (brief §1)', () => {
  it('ayrıştırılamayan tarih reddedilir', () => {
    expectInvalid({ ...validInput(), startTime: 'gelecek hafta' }, 'ISO 8601');
  });

  it('metin olmayan başlangıç zamanı reddedilir', () => {
    expectInvalid({ ...validInput(), startTime: 1_790_000_000_000 }, 'ISO 8601 metni');
  });

  it('çok yakın başlangıç zamanı reddedilir (lobi dolmaz)', () => {
    const tooSoon = new Date(NOW.getTime() + (config.startDelaySeconds.min - 1) * 1_000).toISOString();
    expectInvalid({ ...validInput(), startTime: tooSoon }, 'en az');
  });

  it('geçmiş bir başlangıç zamanı reddedilir', () => {
    expectInvalid({ ...validInput(), startTime: '2020-01-01T00:00:00.000Z' }, 'en az');
  });

  it('çok uzak başlangıç zamanı reddedilir', () => {
    const tooFar = new Date(NOW.getTime() + (config.startDelaySeconds.max + 1) * 1_000).toISOString();
    expectInvalid({ ...validInput(), startTime: tooFar }, 'en fazla');
  });

  it('SINIR DEĞERLERİ geçerlidir — tam `min` ve tam `max` saniye', () => {
    // Sınır davranışı `<=`/`>=` yönünde olmalıdır; `<`/`>` olsaydı
    // config'teki değerler "kullanılamaz" hâle gelirdi.
    const atMin = new Date(NOW.getTime() + config.startDelaySeconds.min * 1_000).toISOString();
    const atMax = new Date(NOW.getTime() + config.startDelaySeconds.max * 1_000).toISOString();
    expectValid({ ...validInput(), startTime: atMin });
    expectValid({ ...validInput(), startTime: atMax });
  });
});

describe('validateRaceCreation — saf fonksiyon sözleşmesi', () => {
  it('TÜM sorunları TEK seferde toplar (ilk hatada durmaz)', () => {
    // Brief §1 dokuz alan ister; bir form gönderiminde birkaçı aynı anda
    // hatalı olabilir. İlk hatada durmak kullanıcıyı "düzelt-gönder"
    // döngüsüne sokardı.
    //
    // Aşağıda **TAM OLARAK 10 ALAN** bozulur (gövdenin 11 alanından 10'u;
    // `maxPlayers: 3` + `fieldSize: 9` birlikte verildiğinde "tavan at
    // sayısını aşamaz" karşılaştırması ANLAMSIZ olduğu için atlanır —
    // bkz. `validateRaceCreation` içindeki not — ve geriye yalnızca
    // "en az 8 olmalı" kontrolü kalır, yani o ikili YİNE TEK sorun üretir).
    const problems = expectInvalid(
      {
        ...validInput(),
        name: 'a',
        fieldSize: 9,
        maxPlayers: 3,
        raceType: 'free',
        entryFee: 500,
        tribuneFee: 15,
        spectatorCapacity: 999,
        distanceMeters: 10,
        surface: 'sand',
        weather: 'snowy',
        startTime: 'geçersiz',
      },
      'Yarış adı',
    );

    // Sayı TAM olarak sabitlenir (>= değil): "hepsini toplar" iddiasının
    // anlamı, hatalı alan sayısı ile sorun sayısının EŞİT olmasıdır. Alt
    // sınır kontrolü, bir alan atlanıp başka bir alan iki kez sayılsa da
    // geçerdi. Yeni bir alan eklenirse bu sayı ve aşağıdaki liste birlikte
    // güncellenmelidir.
    expect(problems).toHaveLength(10);

    // Sayı tek başına yetmez: yanlış 10 alan da bu testi geçerdi. Her
    // hatalı alanın KENDİ mesajıyla temsil edildiği ayrıca doğrulanır.
    const joined = problems.join(' | ');
    for (const fragment of [
      'Yarış adı',
      'At sayısı',
      'Maksimum oyuncu',
      'giriş ücreti 0',
      'Tribün ücreti',
      'Tribün kapasitesi',
      'Mesafe',
      'Pist yüzeyi',
      'Hava durumu',
      'ISO 8601',
    ]) {
      expect(joined).toContain(fragment);
    }
  });

  it('DEĞİŞMEZ: sorun varsa `value` null, sorun yoksa `value` dolu', () => {
    // `RaceCreationValidation`'ın tüm amacı bu iki alanın ayrışmamasıdır
    // (bkz. o tipin doc yorumu). `!` ile yapılan daraltma (lobby.ts'in
    // sonundaki) BU iddiaya dayanır.
    expect(validateRaceCreation({ ...validInput(), name: 'a' }, config, NOW).value).toBeNull();
    expect(validateRaceCreation(validInput(), config, NOW).value).not.toBeNull();
  });

  it('AYNI girdi + AYNI `now` = AYNI sonuç (determinizm)', () => {
    // CLAUDE.md "DETERMİNİZM" ilkesinin bu fonksiyondaki karşılığı:
    // içeride `new Date()` çağrılsaydı bu test geçmezdi.
    const first = validateRaceCreation(validInput(), config, NOW);
    const second = validateRaceCreation(validInput(), config, NOW);
    expect(second).toEqual(first);
  });

  it('`now` PARAMETREDİR: yalnızca zaman kararını etkiler', () => {
    // Aynı `startTime`, farklı `now`: biri aralığın içinde, diğeri
    // dışında olmalı. Bu, fonksiyonun gizli bir küresel zaman kaynağı
    // OLMADIĞININ kanıtıdır.
    const input = validInput();
    expectValid(input);
    const lateNow = new Date('2026-09-27T14:00:00.000Z'); // startTime artık geçmişte
    expect(validateRaceCreation(input, config, lateNow).problems.length).toBeGreaterThan(0);
  });

  it('girdi nesnesini DEĞİŞTİRMEZ (yan etkisiz)', () => {
    const input = validInput();
    const snapshot = JSON.stringify(input);
    validateRaceCreation(input, config, NOW);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('normalizeRaceName', () => {
  it('baştaki/sondaki boşlukları atar, İÇTEKİLERİ korur', () => {
    expect(normalizeRaceName('  Boğaziçi   Kupası  ')).toBe('Boğaziçi   Kupası');
  });

  it('boşluk olmayan metni değiştirmez', () => {
    expect(normalizeRaceName('Kupa')).toBe('Kupa');
  });
});

/**
 * `checkRaceSettleable` — ÖDÜL DAĞITIMI kapısı (§42 PHASE 13.14).
 *
 * **BU BLOĞUN ASIL İDDİASI, KAPININ `checkRaceJoinable` İLE TAM TERS
 * OLDUĞUDUR.** İki fonksiyon AYNI sınırı (`startTime`) iki yönden
 * yorumlar: o anda el değiştirme kapanır, koşma açılır. Aşağıdaki "sınır"
 * testi bunu AYNI `now` değeriyle iki fonksiyonu yan yana çağırarak
 * kanıtlar — ikisi bir gün ayrışırsa (ör. biri `<=`, diğeri `<` yaparsa)
 * arada, bir yarışın ne katılıma ne koşmaya açık olduğu bir an doğardı ve
 * orada kaybedilen şey PARADIR.
 */
describe('checkRaceSettleable — ödül dağıtımı kapısı (§42 PHASE 13.14)', () => {
  const startTime = new Date('2026-09-27T12:00:00.000Z');

  /** Yalnızca ilgilenilen alanı bozmak için taban nesne. */
  function race(overrides: Partial<{ status: string; startTime: Date; joinedPlayers: number }> = {}) {
    return { status: 'scheduled', startTime, joinedPlayers: 3, ...overrides };
  }

  it('başlamış ve katılımcısı olan yarış kesinleştirilebilir', () => {
    expect(checkRaceSettleable(race(), new Date('2026-09-27T12:00:01.000Z'))).toBeNull();
  });

  it('TAM BAŞLANGIÇ ANINDA açıktır (sınır dahil)', () => {
    // Sınır `startTime <= now` → AÇIK. `checkRaceJoinable`ın AYNI anda
    // verdiği cevap ise `ALREADY_STARTED`'dır; aşağıdaki test bunu birlikte
    // doğrular.
    expect(checkRaceSettleable(race(), startTime)).toBeNull();
  });

  it('sınır İKİ FONKSİYONDA TAM TERS: aynı anda katılım KAPALI, koşma AÇIK', () => {
    const now = startTime;
    expect(checkRaceSettleable(race(), now)).toBeNull();
    // `checkRaceJoinable` AYNI anda `ALREADY_STARTED` döner — iki kural
    // arasında boşluk da çakışma da YOKTUR.
    expect(checkRaceJoinable({ status: 'scheduled', startTime, maxPlayers: 8, joinedPlayers: 3 }, now)).toBe(
      'ALREADY_STARTED',
    );
  });

  it('henüz başlamamışsa NOT_STARTED', () => {
    expect(checkRaceSettleable(race(), new Date('2026-09-27T11:59:59.000Z'))).toBe('NOT_STARTED');
  });

  it('scheduled değilse NOT_SCHEDULED (zaten koşulmuş / iptal)', () => {
    expect(checkRaceSettleable(race({ status: 'finished' }), new Date('2026-09-27T13:00:00.000Z'))).toBe(
      'NOT_SCHEDULED',
    );
    expect(checkRaceSettleable(race({ status: 'cancelled' }), new Date('2026-09-27T13:00:00.000Z'))).toBe(
      'NOT_SCHEDULED',
    );
  });

  it('hiç GERÇEK oyuncu yoksa NO_PARTICIPANTS', () => {
    expect(checkRaceSettleable(race({ joinedPlayers: 0 }), new Date('2026-09-27T13:00:00.000Z'))).toBe(
      'NO_PARTICIPANTS',
    );
  });

  it('TEK oyuncu YETERLİDİR — minPlayers (8) burada ZORLANMAZ', () => {
    // Bilinçli ürün kararı (bkz. fonksiyonun doc yorumu): `startTime`
    // geçtikten sonra ayrılma da kapandığından "8 dolmadı, koşmaz" demek
    // ödenen ücreti kalıcı olarak yakardı. Kalan koltuklar botlarla dolar.
    expect(checkRaceSettleable(race({ joinedPlayers: 1 }), new Date('2026-09-27T13:00:00.000Z'))).toBeNull();
    expect(checkRaceSettleable(race({ joinedPlayers: 7 }), new Date('2026-09-27T13:00:00.000Z'))).toBeNull();
  });

  it('DURUM, ZAMANDAN ÖNCE gelir — `finished` bir yarış geç başlangıçla bile NOT_SCHEDULED', () => {
    // Kontrol sırası testi: aksi hâlde `startTime`'ı geçmiş bir `finished`
    // yarış "başlamış" sayılıp İKİNCİ KEZ ödeme yapılırdı.
    expect(checkRaceSettleable(race({ status: 'finished', joinedPlayers: 0 }), new Date('2026-09-27T13:00:00.000Z'))).toBe(
      'NOT_SCHEDULED',
    );
  });

  it('saf fonksiyondur: girdiyi DEĞİŞTİRMEZ', () => {
    const input = race();
    const snapshot = JSON.stringify(input);
    checkRaceSettleable(input, new Date('2026-09-27T13:00:00.000Z'));
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
