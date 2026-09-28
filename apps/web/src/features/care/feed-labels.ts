import type { FeedType } from '@at-sevdalisi/shared-types';

/**
 * Yem kalemlerinin oyuncuya görünen adları (28.09.2026).
 *
 * **NEDEN BURAYA TAŞINDI:** bu harita önceden `app/care/page.tsx` içinde
 * yereldi. `/wallet` ekranı günlük ödülün yanında verilen bedava yemleri
 * (`ClaimDailyRewardResult.grantedFeed`) göstermeye başlayınca İKİNCİ bir
 * tüketici doğdu ve kopyalamak, bir kalemin adını değiştirmek için iki
 * dosyayı bilmeyi gerektirirdi. Aynı eşik `lib/currency.ts`'te de
 * yaşandı (bkz. o dosyanın doc yorumu) — kural aynı: ikinci tüketici
 * çıktığında ortak modüle taşı.
 *
 * `Record<FeedType, string>` bilinçlidir: `FeedType` birleşimine yeni bir
 * kalem eklenirse (ör. yulaf) burası DERLEME HATASI verir — ekranda
 * sessizce boş bir ad gösterilmez.
 *
 * Açıklama metinleri (`FEED_TYPE_DESCRIPTIONS`) BİLEREK burada değil:
 * yalnızca bakım ekranında kullanılıyorlar ve tek tüketicili bir metni
 * ortak modüle taşımak, modülü kullanıldığı bağlamdan koparırdı.
 */
export const FEED_TYPE_LABELS: Record<FeedType, string> = {
  saman: 'Saman',
  arpa: 'Arpa',
  mama: 'Mama',
  havuc: 'Havuç',
  vitamin: 'Vitamin',
};
