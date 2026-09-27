/**
 * Oyunun para birimi modeli — brief §1 "ANA PARA BİRİMİ" ve §14
 * "MULTIPLE CURRENCY". TEK doğruluk kaynağı BURASIDIR: `apps/api` domain
 * katmanı (bkz. `domain/economy/wallet.ts` — yeniden dışa aktarır) ve
 * `apps/web` (bkz. `lib/currency.ts` — oyuncuya görünen adları buradan
 * türetir) aynı birleşimi buradan alır.
 *
 * Oyuncuya GÖRÜNEN adlar burada DEĞİL, UI katmanında yaşar (bu paket
 * tipler paketidir; `apps/web/src/lib/currency.ts`):
 * - `money` → **Çip**. Ana (yumuşak) para birimi: yarış giriş ücretleri,
 *   ahır yükseltmesi, pazar alım-satımı, günlük ödül.
 * - `gems`  → **Elmas**. Premium para birimi. Brief §14 "premium currency
 *   gerekiyorsa AYRI tutulmalı" der: ayrı `players` kolonu, ayrı defter
 *   satırı, Çip'e çevrilemez.
 *
 * NEDEN AYRI BİR DOSYA: bu birleşim daha önce `packages/shared-types`
 * içinde 4 dosyada 7 kez, `apps/api`'de 7+ dosyada ve `apps/web`'de 4 kez
 * ELLE yazılıydı. Brief §14'ün öngördüğü üçüncü/beşinci birim (TICKET,
 * EVENT_POINT) eklendiğinde birini güncellemeyi unutmak sessiz bir
 * tutarsızlık üretirdi — brief §29 "duplicate economy implementation
 * oluşturma" der.
 *
 * DEPOLAMA ADI (`money`) BİLİNÇLİ OLARAK DEĞİŞTİRİLMEDİ: brief §1 "yeni
 * currency oluşturmak yerine mevcut sistem uygunsa onu genişlet" der.
 * Kolonu yeniden adlandırmak her para yolunu, migration'ı ve mevcut defter
 * kayıtlarını riske atardı; değişen şey oyuncunun GÖRDÜĞÜ addır.
 */
export const CURRENCIES = ['money', 'gems'] as const;

export type Currency = (typeof CURRENCIES)[number];

/**
 * "Şu kadar şu birim" — fiyat/maliyet taşıyan her yerde AYNI şekil
 * (`care.ts`, `facility.ts`, `stable.ts` bunu daha önce satır satır
 * tekrarlıyordu).
 */
export interface CurrencyAmount {
  currency: Currency;
  amount: number;
}
