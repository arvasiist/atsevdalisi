import type { Currency, CurrencyAmount } from '@at-sevdalisi/shared-types';

/**
 * Oyuncuya GÖRÜNEN para birimi adları — brief §1 "ANA PARA BİRİMİ" ve §14
 * "MULTIPLE CURRENCY".
 *
 * - `money` → **Çip**: ana (yumuşak) para birimi. Yarış giriş ücretleri,
 *   ahır/tesis yükseltmesi, pazar alım-satımı, günlük ödül.
 * - `gems`  → **Elmas**: premium para birimi. Brief §14 gereği AYRI tutulur
 *   (ayrı sunucu kolonu, ayrı defter satırı) ve Çip'e çevrilemez.
 *
 * NEDEN BURADA: bu adlar daha önce 5 ayrı sayfada satır içi yazılıydı
 * (`₺` / `elmas`), iki sayfada da aynı `formatCost`/`formatCurrency`
 * yardımcısı kopyalanmıştı. `farm/page.tsx`'teki yorum "üçüncü bir sayfa
 * daha buna ihtiyaç duyarsa ortak bir modüle taşınmalıdır" diyordu — o
 * eşik geçildi. Adı bir kez değiştirmek yeterli olsun diye TEK yerde.
 *
 * `Record<Currency, string>` bilinçlidir: `CURRENCIES`'e yeni bir birim
 * (brief §14'ün TICKET / EVENT_POINT'i) eklendiğinde burası DERLEME HATASI
 * verir — sessizce boş etiket gösterilmez.
 */
export const CURRENCY_LABELS: Record<Currency, string> = {
  money: 'Çip',
  gems: 'Elmas',
};

/**
 * "5.000 çip" / "50 elmas" — sayı `tr-TR` biçiminde, birim KÜÇÜK harfle
 * (mevcut arayüzün "50 elmas" yazımıyla aynı). `tr-TR` yerel ayarı
 * bilinçlidir: 'Ç' → 'ç' dönüşümü Türkçe kurallarına göre yapılır.
 */
export function formatCurrency(currency: Currency, amount: number): string {
  return `${amount.toLocaleString('tr-TR')} ${CURRENCY_LABELS[currency].toLocaleLowerCase('tr-TR')}`;
}

/** `{ currency, amount }` taşıyan sunucu fiyat nesneleri için kısayol. */
export function formatCost(cost: CurrencyAmount): string {
  return formatCurrency(cost.currency, cost.amount);
}

/**
 * İstemci tarafı YALNIZCA bir kullanılabilirlik ön kontrolüdür (düğmeyi
 * boşuna açık tutmamak için). Gerçek kontrol SUNUCUDADIR — bakiye
 * `SELECT ... FOR UPDATE` ile kilitlenip aynı transaction'da düşülür
 * (CLAUDE.md "SUNUCU OTORİTESİ", "PARA/MUTASYON YOLU").
 */
export function hasEnoughFunds(player: { money: number; gems: number }, cost: CurrencyAmount): boolean {
  return player[cost.currency] >= cost.amount;
}
