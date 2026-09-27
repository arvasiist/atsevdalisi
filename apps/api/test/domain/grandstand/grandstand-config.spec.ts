import { describe, expect, it } from 'vitest';
import { CURRENCIES } from '@at-sevdalisi/shared-types';
import { loadGrandstandConfig } from '@at-sevdalisi/game-config';

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

describe('grandstand.config.json — bilet fiyatı', () => {
  it('para birimi `CURRENCIES` içindedir (DB CHECK kısıtıyla aynı liste)', () => {
    expect(CURRENCIES).toContain(config.ticketPrice.currency);
  });

  it('tutar POZİTİF bir tam sayıdır', () => {
    // `race_tickets.price` BIGINT + `CHECK (price >= 0)`; 0 ise bilet
    // ÜCRETSİZ olurdu ve tribün bir ekonomi SINK'i olmaktan çıkardı.
    expect(Number.isInteger(config.ticketPrice.amount)).toBe(true);
    expect(config.ticketPrice.amount).toBeGreaterThan(0);
  });

  it('tutar `economy_transactions.amount <> 0` kısıtını ihlal edemez', () => {
    // Defter satırı `-amount` olarak yazılır; `amount = 0` olsaydı
    // defter kaydı CHECK'e takılır ve bilet satın alma HER ZAMAN düşerdi.
    expect(-config.ticketPrice.amount).not.toBe(0);
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
