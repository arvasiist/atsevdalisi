import { describe, expect, it } from 'vitest';
import {
  resolveFieldComposition,
  type FieldCompositionConfig,
} from '../../../src/domain/race/field-composition';

/**
 * SAHA KOMPOZİSYONU — `fieldSize` ≠ `humanPlayerCount` (§42 PHASE 2).
 *
 * **BU DOSYANIN KANITLADIĞI ASIL ŞEY, BİR CONFIG DEĞERİNİN ARTIK BİR
 * ETKİSİ OLMASIDIR.** `config/race-lobby.config.json` → `aiFillEnabled`
 * bu dilimden önce **HİÇBİR KOD TARAFINDAN OKUNMUYORDU**; `false` yapmak
 * sahada tek bir botu bile eksiltmiyordu ve bunu hiçbir derleyici, hiçbir
 * test söylemiyordu. Aşağıdaki matris bu değeri `true`/`false` olarak iki
 * kez koşar; ilk kez bir iddia ona bağlıdır.
 *
 * **SAF FONKSİYON — VERİTABANI GEREKMEZ.** Bu yüzden brief'in istediği
 * tam matris (8/10/12/14/16 × her oyuncu sayısı) burada, saniyeler içinde
 * ve gerçek Postgres olmadan koşar. Aynı matrisi e2e'de kurmak dakikalar
 * sürerdi ve asıl e2e'nin (uçtan uca zincir) kanıt gücünü sulandırırdı —
 * o yüzden e2e dosyası matrisin TAMAMINI değil, TEK bir karışık sahayı
 * (2 gerçek + 6 bot) uçtan uca doğrular.
 *
 * ⚠️ **BRIEF'İN "8/0/8" SENARYOSU SUNUCUDA İMKÂNSIZDIR** ve bu dosya onu
 * `NO_HUMAN_PLAYERS` olarak AÇIKÇA reddeder (aşağıda "sıfır gerçek oyuncu"
 * bloğu). Gerekçe: ödül havuzu gerçek giriş ücretlerinden oluşur —
 * `checkRaceSettleable`/`checkRaceLockable` de aynı durumu
 * `NO_PARTICIPANTS` ile keser (`lobby.ts`). Yani "8 bot, 0 oyuncu" diye
 * bir yarış ne kurulabilir ne koşulabilir; senaryoyu geçirmek için bu
 * kapıyı gevşetmek, ödülsüz/parasız bir yarışa izin vermek olurdu.
 */

/** `config/race-lobby.config.json` → `fieldSizes`. Tek doğruluk kaynağı. */
const FIELD_SIZES = [8, 10, 12, 14, 16] as const;

const AI_ON: FieldCompositionConfig = { fieldSizes: FIELD_SIZES, aiFillEnabled: true };
const AI_OFF: FieldCompositionConfig = { fieldSizes: FIELD_SIZES, aiFillEnabled: false };

describe('resolveFieldComposition — saha kompozisyonu (saf fonksiyon)', () => {
  describe('AI dolgusu AÇIK — saha her zaman `fieldSize`a tamamlanır', () => {
    // Brief §42 PHASE 2: "8/1/7", "8/4/4", "8/8/0" ve aynısı 10/12/14/16.
    // Bu döngü o tablonun TAMAMINI (her boyut × her oyuncu sayısı) kurar.
    for (const fieldSize of FIELD_SIZES) {
      for (let humans = 1; humans <= fieldSize; humans += 1) {
        it(`${fieldSize} atlı sahada ${humans} gerçek oyuncu → ${fieldSize - humans} bot, toplam ${fieldSize}`, () => {
          const result = resolveFieldComposition({ fieldSize, humanCount: humans }, AI_ON);

          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.composition).toEqual({
            humans,
            bots: fieldSize - humans,
            total: fieldSize,
            emptySeats: fieldSize - humans,
          });
        });
      }
    }

    it('brief\'in açık örneği 12 atlı saha: 4 gerçek + 8 bot', () => {
      const result = resolveFieldComposition({ fieldSize: 12, humanCount: 4 }, AI_ON);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.composition.humans).toBe(4);
      expect(result.composition.bots).toBe(8);
      expect(result.composition.total).toBe(12);
    });

    it('brief\'in açık örneği 16 atlı saha: 11 gerçek + 5 bot', () => {
      const result = resolveFieldComposition({ fieldSize: 16, humanCount: 11 }, AI_ON);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.composition.humans).toBe(11);
      expect(result.composition.bots).toBe(5);
      expect(result.composition.total).toBe(16);
    });
  });

  describe('AI dolgusu KAPALI — saha EKSİK koşar (bu, config değerinin TEK etkisidir)', () => {
    for (const fieldSize of FIELD_SIZES) {
      for (let humans = 1; humans <= fieldSize; humans += 1) {
        it(`${fieldSize} atlı sahada ${humans} gerçek oyuncu → 0 bot, ${fieldSize - humans} boş koltuk`, () => {
          const result = resolveFieldComposition({ fieldSize, humanCount: humans }, AI_OFF);

          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.composition).toEqual({
            humans,
            bots: 0,
            total: humans,
            emptySeats: fieldSize - humans,
          });
        });
      }
    }

    it('8 gerçek oyuncu zaten sahaya tam sığıyorsa iki ayar AYNI sonucu verir', () => {
      // Sınır durumu: dolgu açıkken de kapalıyken de eklenecek bot yoktur.
      // Bu iddia olmadan "kapalı" testinin yeşil olması, fonksiyonun
      // `aiFillEnabled`ı hiç okumadığı bir uygulamada da mümkün olurdu —
      // bu yüzden iki ayarın AYRIŞTIĞI bir örnek (yukarıdaki 2/8 gibi)
      // yukarıdaki matriste ayrıca vardır.
      const open = resolveFieldComposition({ fieldSize: 8, humanCount: 8 }, AI_ON);
      const closed = resolveFieldComposition({ fieldSize: 8, humanCount: 8 }, AI_OFF);

      expect(open).toEqual(closed);
    });
  });

  describe('ret yolları — geçersiz girdi ASLA sessizce geçmez', () => {
    it('desteklenmeyen saha büyüklüğü reddedilir (6/9/20/0)', () => {
      for (const fieldSize of [0, 6, 9, 20, -8]) {
        const result = resolveFieldComposition({ fieldSize, humanCount: 1 }, AI_ON);

        expect(result.ok, `fieldSize=${fieldSize} kabul edilmemeliydi`).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('UNSUPPORTED_FIELD_SIZE');
      }
    });

    it('gerçek oyuncu sayısı sahaya sığmıyorsa reddedilir', () => {
      const result = resolveFieldComposition({ fieldSize: 8, humanCount: 9 }, AI_ON);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('TOO_MANY_PLAYERS');
    });

    it('tam sayı olmayan / negatif oyuncu sayısı reddedilir', () => {
      // `races.field_size` doğrudan SQL ile bozulabilir; `humanCount` ise
      // `race_entries` sayımından gelir ve teorik olarak NaN olamaz — ama
      // bu fonksiyon saf bir kuraldır ve `NaN > fieldSize` FALSE döndüğü
      // için kapı olmadan `bots = NaN` üretilirdi.
      for (const humanCount of [1.5, -1, Number.NaN]) {
        const result = resolveFieldComposition({ fieldSize: 8, humanCount }, AI_ON);

        expect(result.ok, `humanCount=${String(humanCount)} kabul edilmemeliydi`).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('TOO_MANY_PLAYERS');
      }
    });

    it('⚠️ SIFIR gerçek oyuncu reddedilir — brief\'in "8/0/8" senaryosu sunucuda İMKÂNSIZDIR', () => {
      // Bu bir eksiklik DEĞİL, ürün kuralıdır: ödül havuzu gerçek giriş
      // ücretlerinden oluşur, boş sahanın havuzu yoktur. `aiFillEnabled`
      // açıkken bile "0 oyuncu" kabul edilseydi, hiç kimsenin ödemediği
      // bir havuzdan hiç kimseye ödeme yapılan bir yarış koşardı.
      const result = resolveFieldComposition({ fieldSize: 8, humanCount: 0 }, AI_ON);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('NO_HUMAN_PLAYERS');
    });
  });
});
