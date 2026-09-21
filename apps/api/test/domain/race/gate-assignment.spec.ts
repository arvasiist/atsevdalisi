import { describe, expect, it } from 'vitest';
import { assignGatePositions } from '../../../src/domain/race/gate-assignment';

/**
 * AUDIT_REPORT.md Bulgu R3 (bu oturum) — `assignGatePositions` için testler.
 * Bkz. `gate-assignment.ts` doc yorumu: bu fonksiyon SAF domain mantığıdır
 * (NestJS/DB bağımlılığı yok), bu yüzden bu sandbox'ta `tsx` ile GERÇEK
 * kod olarak da çalıştırılıp push ÖNCESİ doğrulandı (bkz. commit mesajı).
 */
describe('assignGatePositions', () => {
  it('her katılımcıya [1, N] aralığında BENZERSİZ bir kapı numarası atar', () => {
    const labels = ['horse-a', 'horse-b', 'bot-1', 'bot-2', 'bot-3', 'bot-4'];
    const result = assignGatePositions(labels, 'seed-1', 'race-1');

    expect(result.size).toBe(labels.length);
    const positions = [...result.values()].sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6]);
    for (const label of labels) {
      expect(result.has(label)).toBe(true);
    }
  });

  it('AYNI seed + raceId + katılımcı kümesi HER ZAMAN AYNI çekilişi üretir (determinizm)', () => {
    const labels = ['horse-a', 'horse-b', 'bot-1', 'bot-2'];
    const first = assignGatePositions(labels, 'seed-42', 'race-42');
    const second = assignGatePositions(labels, 'seed-42', 'race-42');

    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it('FARKLI bir seed/raceId (muhtemelen) FARKLI bir çekiliş üretir', () => {
    const labels = ['horse-a', 'horse-b', 'bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5', 'bot-6'];
    const first = assignGatePositions(labels, 'seed-1', 'race-1');
    const second = assignGatePositions(labels, 'seed-2', 'race-2');

    // 8! = 40320 olası permütasyon olduğundan, farklı seed'lerin AYNI
    // permütasyona denk gelmesi istatistiksel olarak ihmal edilebilir —
    // bu test yalnızca "seed GERÇEKTEN kullanılıyor, hardcoded değil"
    // regresyonunu yakalamak içindir.
    expect([...second.entries()]).not.toEqual([...first.entries()]);
  });

  it('FARKLI bir raceId (AYNI simulationSeed ile) de FARKLI bir çekiliş üretir — isim uzayı raceId İÇERİR', () => {
    const labels = ['horse-a', 'horse-b', 'bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5', 'bot-6'];
    const first = assignGatePositions(labels, 'shared-seed', 'race-a');
    const second = assignGatePositions(labels, 'shared-seed', 'race-b');

    expect([...second.entries()]).not.toEqual([...first.entries()]);
  });

  it('girdi dizisinin SIRASI sonucu ETKİLEMEZ (kanonik/alfabetik sıraya göre karıştırılır)', () => {
    const labelsInOrderA = ['bot-1', 'bot-2', 'horse-a', 'horse-b'];
    const labelsInOrderB = ['horse-b', 'horse-a', 'bot-2', 'bot-1'];

    const resultA = assignGatePositions(labelsInOrderA, 'seed-x', 'race-x');
    const resultB = assignGatePositions(labelsInOrderB, 'seed-x', 'race-x');

    expect([...resultB.entries()].sort()).toEqual([...resultA.entries()].sort());
  });

  it('tek katılımcılı bir yarışta (heads-up/edge case) tek kapı numarası 1 olur', () => {
    const result = assignGatePositions(['horse-a'], 'seed-solo', 'race-solo');
    expect(result.get('horse-a')).toBe(1);
  });

  /**
   * CI #128'in yakaladığı `noUncheckedIndexedAccess` hatasının (bkz.
   * AUDIT_REPORT.md R3/Draw bölümü — Fisher-Yates takas satırındaki
   * `string | undefined` derleme hatası ve `readIndexOrThrow` düzeltmesi)
   * regresyon testi: döngü büyük bir N için de HİÇBİR sınır ihlali
   * (dolayısıyla `readIndexOrThrow`'un fırlattığı hata) OLMADAN tamamlanmalı
   * ve yine geçerli, benzersiz bir [1,N] permütasyonu üretmeli.
   */
  it('büyük bir katılımcı kümesinde (N=20) sınır matematiği bozulmadan geçerli bir permütasyon üretir', () => {
    const labels = Array.from({ length: 20 }, (_, index) => `entrant-${index}`);
    const result = assignGatePositions(labels, 'seed-large', 'race-large');

    expect(result.size).toBe(20);
    const positions = [...result.values()].sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });
});
