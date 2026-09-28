import { describe, expect, it } from 'vitest';
import { CURRENCIES } from '@at-sevdalisi/shared-types';
import { loadGrandstandConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';

/**
 * `config/grandstand.config.json` DEĞİŞMEZLERİ (invariants).
 *
 * NEDEN AYRI BİR TEST: `packages/game-config/src/index.ts`'teki
 * `load*Config()` fonksiyonları, `JSON` import'unu tip iddiasıyla
 * (`as unknown as X`) döndüren SAF cast'lerdir — ÇALIŞMA ZAMANI
 * DOĞRULAMASI YOKTUR. Yani `config/grandstand.config.json`'a yazılan bir
 * yazım hatası (`"amount": "25"` gibi) ne TypeScript'te ne de derlemede
 * yakalanır; yalnızca ÜRETİMDE, para yolunda patlar. Bu dosya o boşluğu
 * kapatır: config değişmezi ihlal edilirse test kırmızıya döner.
 *
 * (Aynı gerekçe `domain/grandstand/ticket.ts`'teki
 * `assertTicketPriceIsValid` için de geçerlidir — o, ÇALIŞMA ZAMANI
 * savunmasıdır; bu ise DERLEME/CI savunmasıdır. İkisi birbirinin yerine
 * geçmez.)
 */
const config = loadGrandstandConfig();
const lobbyConfig = loadRaceLobbyConfig();

describe('grandstand.config.json — varsayılan tribün ücreti', () => {
  it('para birimi `CURRENCIES` içindedir (DB CHECK kısıtıyla aynı liste)', () => {
    expect(CURRENCIES).toContain(config.defaultTribuneFee.currency);
  });

  it('tutar POZİTİF bir tam sayıdır', () => {
    // `races.tribune_fee` BIGINT + `CHECK (tribune_fee >= 0)`. 0 OLMAMALI:
    // bu değer sunucu üretimi (pratik/PvP) yarışlara yazılır ve
    // `tribune_fee = 0` "tribün ÜCRETSİZ" demektir — o zaman
    // `POST /races/:id/tickets` her zaman 409 `RACE_TRIBUNE_FREE` dönerdi
    // ve tribün bir ekonomi SINK'i olmaktan çıkardı.
    expect(Number.isInteger(config.defaultTribuneFee.amount)).toBe(true);
    expect(config.defaultTribuneFee.amount).toBeGreaterThan(0);
  });

  it('tutar `economy_transactions.amount <> 0` kısıtını ihlal edemez', () => {
    // Defter satırı `-amount` olarak yazılır; `amount = 0` olsaydı
    // defter kaydı CHECK'e takılır ve bilet satın alma HER ZAMAN düşerdi.
    expect(-config.defaultTribuneFee.amount).not.toBe(0);
  });

  it('varsayılan ücret, oyuncunun LOBİDE seçebildiği seçeneklerden biridir', () => {
    // `race-lobby.config.json → tribuneFeeOptions` oyuncunun seçebileceği
    // ücretlerdir; bu ise seçim yapılmadığında uygulanandır. İkisi
    // ayrışırsa, oyuncunun hiç seçemeyeceği bir ücret sunucu üretimi
    // yarışlarda görünür ve oyuncu için AÇIKLANAMAZ olurdu.
    expect(lobbyConfig.tribuneFeeOptions).toContain(config.defaultTribuneFee.amount);
  });
});

describe('grandstand.config.json — varsayılan tribün kapasitesi', () => {
  it('POZİTİF bir tam sayıdır', () => {
    // `races.spectator_capacity` INTEGER + `CHECK (spectator_capacity > 0)`.
    expect(Number.isInteger(config.defaultSpectatorCapacity)).toBe(true);
    expect(config.defaultSpectatorCapacity).toBeGreaterThan(0);
  });

  it('oyuncunun LOBİDE seçebildiği kapasitelerden biridir', () => {
    // Yukarıdaki ücret gerekçesiyle AYNI: ayrışırlarsa oyuncunun
    // seçemediği bir kapasite sunucu üretimi yarışlarda görünür.
    expect(lobbyConfig.spectatorCapacityOptions).toContain(config.defaultSpectatorCapacity);
  });
});

describe('grandstand.config.json — izleme penceresi ve limitler', () => {
  it('watchWindowHours pozitif bir tam sayıdır', () => {
    expect(Number.isInteger(config.watchWindowHours)).toBe(true);
    expect(config.watchWindowHours).toBeGreaterThan(0);
  });

  it('watchWindowHours makul bir üst sınırdadır (bir yıldan kısa)', () => {
    // Bu sınır, yanlışlıkla `48` yerine `48 * 365` gibi bir değer
    // yazılmasını yakalar: pencere ne kadar genişse `races` taraması o
    // kadar büyür ve "canlı tribün" hissi o kadar kaybolur.
    expect(config.watchWindowHours).toBeLessThanOrEqual(24 * 30);
  });

  it('liste limitleri pozitif tam sayıdır', () => {
    expect(Number.isInteger(config.watchableRacesLimit)).toBe(true);
    expect(config.watchableRacesLimit).toBeGreaterThan(0);
    expect(Number.isInteger(config.myTicketsLimit)).toBe(true);
    expect(config.myTicketsLimit).toBeGreaterThan(0);
  });

  it('liste limitleri SQL `LIMIT` için güvenli aralıktadır', () => {
    // Sınırsız büyüyen bir LIMIT, tek istekte tüm `races` tablosunu
    // taratabilirdi; bu üst sınır onu engeller.
    expect(config.watchableRacesLimit).toBeLessThanOrEqual(200);
    expect(config.myTicketsLimit).toBeLessThanOrEqual(500);
  });
});
