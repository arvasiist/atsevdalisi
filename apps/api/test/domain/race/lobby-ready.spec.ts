import { describe, expect, it } from 'vitest';
import {
  READY_SETTABLE_STATUSES,
  checkEntryReadyable,
  normalizeLobbyListLimit,
  validateEntryReady,
} from '../../../src/domain/race/lobby';

/**
 * READY DÜĞMESİ + LOBİ LİSTESİ — saf domain katmanı (brief §6, §42 PHASE 3).
 *
 * **NEDEN BU TESTLER DB OLMADAN KOŞAR:** `validateEntryReady`/
 * `checkEntryReadyable`/`normalizeLobbyListLimit` `domain/` katmanındadır ve
 * orası framework'süz saf TS'tir (CLAUDE.md kural 4). Karar mantığının
 * DB'ye hiç dokunmadan doğrulanabilmesi tesadüf değil, tasarımdır: kurallar
 * burada test edilir, DB'ye YAZILMA garantisi ayrıca e2e'de
 * (`race-ready.e2e-spec.ts`) sınanır.
 *
 * **BU DOSYANIN ASIL DEĞERİ İKİ KAPIDIR:**
 *  1. **"500 DEĞİL 400"** — CLAUDE.md kural 5: Vitest/esbuild
 *     `design:paramtypes` üretmediği için `ValidationPipe` gövdeyi HİÇ
 *     doğrulamaz; `dto.status` çalışma anında gerçekten bir sayı ya da dizi
 *     olabilir. `validateEntryReady` `typeof` kontrolü olmadan
 *     `status.trim()` çağırsaydı bu girdiler `TypeError` fırlatır ve
 *     kullanıcı 400 yerine **500** görürdü.
 *  2. **`cancelled` SEÇİLEMEZ** — katılım iptali bir iade politikası
 *     gerektirir; READY ucundan yazılabilseydi ücret ödemeden çıkmanın bir
 *     yolu doğardı.
 */
describe('validateEntryReady — gövde doğrulaması', () => {
  it('`ready` kabul edilir', () => {
    const result = validateEntryReady({ status: 'ready' });

    expect(result.problems).toEqual([]);
    expect(result.value).toEqual({ status: 'ready' });
  });

  it('`not_ready` kabul edilir', () => {
    expect(validateEntryReady({ status: 'not_ready' }).value).toEqual({ status: 'not_ready' });
  });

  it('`waiting` REDDEDİLİR — "henüz karar vermedim" geri dönülemez bir durumdur', () => {
    // Katılım anında yazılan başlangıç değeridir; oyuncunun kararını geri
    // almasının yolu `not_ready`'dir. `waiting` seçilebilseydi "hiç karar
    // vermemiş" ile "kararını geri almış" ayırt edilemezdi.
    const result = validateEntryReady({ status: 'waiting' });

    expect(result.value).toBeNull();
    expect(result.problems.length).toBe(1);
  });

  it('`cancelled` REDDEDİLİR — iptal bir PARA yoludur, bu uçtan yazılamaz', () => {
    const result = validateEntryReady({ status: 'cancelled' });

    expect(result.value).toBeNull();
    expect(result.problems[0]).toContain('ready');
  });

  it('`READY_SETTABLE_STATUSES` tam olarak ready + not_ready', () => {
    // Bu iddia, yukarıdaki iki RED testinin sessizce gevşemesini engeller:
    // listeye yanlışlıkla `waiting`/`cancelled` eklenirse burada kırmızı olur.
    expect([...READY_SETTABLE_STATUSES]).toEqual(['ready', 'not_ready']);
  });

  it('`status` YOKSA 400\'lük sorun döner (fırlatmaz)', () => {
    const result = validateEntryReady({ status: undefined });

    expect(result.value).toBeNull();
    expect(result.problems.length).toBe(1);
  });

  const wrongTypedStatuses: Array<[string, unknown]> = [
    ['sayı', 1],
    ['null', null],
    ['dizi', ['ready']],
    ['nesne', { status: 'ready' }],
    ['boolean', true],
  ];

  it.each(wrongTypedStatuses)('yanlış TİPTE `status` (%s) FIRLATMAZ, sorun döner', (_label, status) => {
    // BU TESTİN VARLIK SEBEBİ: `typeof` kontrolü olmadan `status.trim()`
    // `TypeError` fırlatır ve istemci 500 görürdü.
    const result = validateEntryReady({ status });

    expect(result.value).toBeNull();
    expect(result.problems.length).toBe(1);
  });
});

describe('checkEntryReadyable — pencere denetimi (brief §6)', () => {
  const startTime = new Date('2026-10-01T12:00:00.000Z');
  const before = new Date('2026-10-01T11:00:00.000Z');

  function race(override: Partial<{ status: string; startTime: Date }> = {}) {
    return { status: 'scheduled', startTime, ...override };
  }

  it('başlamamış yarışta `waiting` katılım KABUL edilir', () => {
    expect(checkEntryReadyable(race(), { status: 'waiting' }, before)).toBeNull();
  });

  it('ZATEN İSTENEN DURUMDA olmak RED NEDENİ DEĞİLDİR (idempotent)', () => {
    // İstemci aynı düğmeye iki kez basarsa sonuç aynı olmalıdır — READY bir
    // MUTASYON değil, bir DURUM BİLDİRİMİDİR.
    expect(checkEntryReadyable(race(), { status: 'ready' }, before)).toBeNull();
    expect(checkEntryReadyable(race(), { status: 'not_ready' }, before)).toBeNull();
  });

  it('`status` NULL olan satır da geçer (lobi dışı satırlar `finished` yarışa aittir)', () => {
    // migration 0037: `status` NULLABLE'dır çünkü pratik/PvP satırları
    // ZATEN KOŞMUŞ yarışların kayıtlarıdır. Kural burada açıkça durur.
    expect(checkEntryReadyable(race(), { status: null }, before)).toBeNull();
  });

  it('`scheduled` DIŞINDAKİ her durum reddedilir', () => {
    for (const status of ['in_progress', 'finished', 'cancelled']) {
      expect(checkEntryReadyable(race({ status }), { status: 'waiting' }, before)).toBe('NOT_SCHEDULED');
    }
  });

  it('başlangıç zamanı GEÇMİŞSE reddedilir', () => {
    expect(checkEntryReadyable(race(), { status: 'waiting' }, new Date('2026-10-01T13:00:00.000Z'))).toBe(
      'ALREADY_STARTED',
    );
  });

  it('TAM başlangıç anında pencere KAPALIDIR (sınırda kapalı)', () => {
    // Motorun snapshot'ı tam o anda alınır — `checkRaceJoinable` ile AYNI
    // kural; iki fonksiyonun sınır davranışı ayrışırsa katılım ile READY
    // arasında bir saniyelik tutarsız bir pencere doğardı.
    expect(checkEntryReadyable(race(), { status: 'waiting' }, startTime)).toBe('ALREADY_STARTED');
  });

  it('İPTAL edilmiş katılım reddedilir', () => {
    expect(checkEntryReadyable(race(), { status: 'cancelled' }, before)).toBe('CANCELLED');
  });

  it('ret nedeni ÖNCELİĞİ: durum > zaman > iptal', () => {
    // Üçü birden bozuksa kullanıcıya EN ANLAMLI neden gösterilmelidir:
    // "iptal edilmiş bir yarışta durum değiştirilemez" demek yanıltıcı olurdu.
    expect(
      checkEntryReadyable(race({ status: 'finished' }), { status: 'cancelled' }, new Date('2026-10-01T13:00:00.000Z')),
    ).toBe('NOT_SCHEDULED');
    expect(checkEntryReadyable(race(), { status: 'cancelled' }, new Date('2026-10-01T13:00:00.000Z'))).toBe(
      'ALREADY_STARTED',
    );
  });
});

describe('normalizeLobbyListLimit — sorgu parametresi (brief §18)', () => {
  const config = { lobbyListDefaultLimit: 20, lobbyListMaxLimit: 100 };

  it('geçerli bir sayı olduğu gibi geçer', () => {
    expect(normalizeLobbyListLimit('12', config)).toBe(12);
  });

  it('tavan AŞILIRSA 400 DEĞİL, tavan değerine KIRPILIR', () => {
    // İstemcinin "hepsini getir" demesi meşrudur; kırpmak hem isteği
    // karşılar hem sunucuyu korur.
    expect(normalizeLobbyListLimit('1000', config)).toBe(100);
  });

  const invalidInputs: Array<[string, unknown]> = [
    ['undefined (parametre hiç verilmemiş)', undefined],
    ['boş metin', ''],
    ['yalnızca boşluk', '   '],
    ['sayı olmayan metin', 'abc'],
    ['sıfır', '0'],
    ['negatif', '-5'],
    ['ondalık', '3.5'],
    ['sonsuz', 'Infinity'],
    ['NaN', 'NaN'],
    ['sayı tipi (sorgu parametresi metindir, ama savunma amaçlı)', 12],
    ['dizi', ['12']],
    ['null', null],
  ];

  it.each(invalidInputs)('geçersiz girdi (%s) VARSAYILANA düşer, fırlatmaz', (_label, raw) => {
    // Hatalı girdi 400 DEĞİL: bu bir LİSTELEME ucudur, mutasyon değil.
    // `?limit=abc` yüzünden tüm lobiyi göstermemek kullanıcıya hiçbir şey
    // kazandırmaz — ama fırlatmak da kabul edilemez (500 olurdu).
    expect(normalizeLobbyListLimit(raw, config)).toBe(20);
  });

  it('sınırda tavan değeri kabul edilir', () => {
    expect(normalizeLobbyListLimit('100', config)).toBe(100);
    expect(normalizeLobbyListLimit('101', config)).toBe(100);
  });

  it('baştaki/sondaki boşluk kabul edilir', () => {
    // `Number(' 12 ')` 12'dir — bu davranış bilinçli olarak korunur.
    expect(normalizeLobbyListLimit(' 12 ', config)).toBe(12);
  });
});
