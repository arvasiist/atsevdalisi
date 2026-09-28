import { describe, expect, it } from 'vitest';
import { checkRaceLeavable, type RaceLeaveRejection } from '../../../src/domain/race/lobby';

/**
 * Yarıştan AYRILMA durum denetimi — brief §20 `REFUND`, §42 PHASE 4c.
 *
 * `checkRaceLeavable` SAF bir fonksiyondur: DB'ye dokunmaz, hata FIRLATMAZ,
 * ret nedenini döndürür. Bu dosya o sözleşmeyi Postgres olmadan sabitler —
 * nedeni domain hatasına çevirmek ve iade tutarını belirlemek
 * `leave-race.use-case`/`leaveLobbyRace`'in işidir.
 *
 * Buradaki testlerin ASIL değeri SINIRLARDADIR: "ayrılma yarış başlayana
 * kadar açıktır" kuralının `<` mi `<=` mi olduğu, ve "zaten iptal edilmiş
 * katılım" durumunun ayrı bir ret nedeni olup olmadığı — ikisi de sessizce
 * yanlış tarafa düşebilecek kararlardır ve ikisi de PARA ile ilgilidir
 * (yanlış tarafa düşerse koşmuş bir yarıştan para iade edilir).
 */
describe('Yarıştan ayrılma durum denetimi (brief §20/§42 PHASE 4c)', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  /** Yarış `now`'dan bir saat SONRA başlıyor — normal (ayrılabilir) durum. */
  const futureStart = new Date('2026-09-28T13:00:00.000Z');
  /** Yarış `now`'dan bir saat ÖNCE başladı. */
  const pastStart = new Date('2026-09-28T11:00:00.000Z');

  function race(overrides: Partial<{ status: string; startTime: Date }> = {}) {
    return { status: 'scheduled', startTime: futureStart, ...overrides };
  }

  function entry(status: string | null) {
    return { status };
  }

  describe('ayrılmaya izin verilen durumlar', () => {
    // `waiting`/`ready`/`not_ready` ÜÇÜ DE ayrılabilir olmalıdır: oyuncunun
    // "hazırım" demesi ile "bu yarıştan çıkıyorum" demesi AYRI kararlardır ve
    // hiçbiri diğerini kilitlemez. `not_ready` durumundan ayrılamamak, kararını
    // geri almış bir oyuncuyu yarışta kalmaya zorlamak olurdu.
    it.each(['waiting', 'ready', 'not_ready'])('yarış scheduled + gelecekte + katılım %s → ayrılabilir', (status) => {
      expect(checkRaceLeavable(race(), entry(status), now)).toBeNull();
    });

    it('katılım durumu NULL ise de ayrılabilir (lobi dışı satır ayrımı burada yapılmaz)', () => {
      // `checkEntryReadyable` ile AYNI tercih: tek AÇIK ret nedeni
      // `cancelled`'dır. `status IS NULL` pratik/PvP satırlarının işaretidir
      // ve o satırlar zaten KOŞMUŞ yarışlara aittir — yani pratikte
      // yukarıdaki `race.status !== 'scheduled'` kontrolüne takılırlar.
      // Burada ikinci bir kural kaynağı yaratmak yerine aynı tercih korunur.
      expect(checkRaceLeavable(race(), entry(null), now)).toBeNull();
    });
  });

  describe('ret nedenleri', () => {
    it('yarış `scheduled` değilse → NOT_SCHEDULED (koşan/bitmiş yarıştan para iadesi olmaz)', () => {
      for (const status of ['running', 'finished', 'cancelled']) {
        expect(checkRaceLeavable(race({ status }), entry('ready'), now)).toBe('NOT_SCHEDULED');
      }
    });

    it('başlangıç zamanı geçmişse → ALREADY_STARTED', () => {
      expect(checkRaceLeavable(race({ startTime: pastStart }), entry('ready'), now)).toBe('ALREADY_STARTED');
    });

    it('SINIR: `startTime === now` → ALREADY_STARTED (ayrılma KAPALI)', () => {
      // `checkRaceJoinable`/`checkEntryReadyable` ile BİREBİR aynı sınır
      // tercihi: motorun snapshot'ı tam o anda alınır, yani `now === startTime`
      // anında yarış BAŞLAMIŞ sayılır. Üç fonksiyonun aynı tarafta olması
      // şarttır — biri diğerinden farklı düşünürse "katılamazsın ama
      // ayrılabilirsin" gibi tutarsız bir aralık doğardı.
      expect(checkRaceLeavable(race({ startTime: now }), entry('ready'), now)).toBe('ALREADY_STARTED');
    });

    it('katılım zaten iptal edilmişse → ALREADY_CANCELLED', () => {
      // Ayrı bir ret nedeni olması bilinçlidir: aynı isteğin tekrarı
      // (istemci yanıtı kaybetti) 500 ya da İKİNCİ bir iade değil, anlamlı
      // bir 409 üretmelidir. İkinci iadeyi engelleyen ASIL mekanizma
      // idempotency + defterdir; bu kontrol kullanıcıya doğru mesajı verir.
      expect(checkRaceLeavable(race(), entry('cancelled'), now)).toBe('ALREADY_CANCELLED');
    });

    it('durum kontrolü ÖNCE gelir: iptal edilmiş katılım + başlamış yarış → ALREADY_STARTED', () => {
      // İki ret nedeni de geçerliyken hangisinin döndüğü sırayı sabitler.
      // `checkEntryReadyable` ile AYNI sıra (durum → zaman → katılım):
      // "yarış başladı" mesajı, "zaten iptal edilmiş" mesajından daha
      // açıklayıcıdır, çünkü oyuncunun asıl şaşkınlığı yarışın başlamış
      // olmasıdır.
      expect(checkRaceLeavable(race({ startTime: pastStart }), entry('cancelled'), now)).toBe('ALREADY_STARTED');
      expect(checkRaceLeavable(race({ status: 'finished' }), entry('cancelled'), now)).toBe('NOT_SCHEDULED');
    });
  });

  describe('sözleşme', () => {
    it('HİÇBİR durumda fırlatmaz', () => {
      const statuses = ['scheduled', 'running', 'finished', 'cancelled', ''];
      const entryStatuses = ['waiting', 'ready', 'not_ready', 'cancelled', null, ''];
      const starts = [futureStart, pastStart, now];

      for (const status of statuses) {
        for (const entryStatus of entryStatuses) {
          for (const startTime of starts) {
            expect(() => checkRaceLeavable({ status, startTime }, { status: entryStatus }, now)).not.toThrow();
          }
        }
      }
    });

    it('ret nedenleri YALNIZCA üç değerden biridir (kapalı küme)', () => {
      const allowed: RaceLeaveRejection[] = ['NOT_SCHEDULED', 'ALREADY_STARTED', 'ALREADY_CANCELLED'];
      const observed = [
        checkRaceLeavable(race({ status: 'finished' }), entry('ready'), now),
        checkRaceLeavable(race({ startTime: pastStart }), entry('ready'), now),
        checkRaceLeavable(race(), entry('cancelled'), now),
      ];

      for (const reason of observed) {
        expect(reason === null || allowed.includes(reason)).toBe(true);
      }
    });
  });
});
