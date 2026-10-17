import type { FeedCategory, FeedItemView, FeedType } from '@at-sevdalisi/shared-types';

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
  yulaf: 'Yulaf',
  enerji_yemi: 'Enerji Yemi',
  kondisyon_yemi: 'Kondisyon Yemi',
  tay_yemi: 'Tay Yemi',
  elektrolit: 'Elektrolit',
  eklem_takviyesi: 'Eklem Takviyesi',
  agri_kesici: 'Ağrı Kesici',
};

/** 16.10.2026 — market kategorileri (brief §8); sıra ekranda bu sıradır. */
export const FEED_CATEGORY_LABELS: Record<FeedCategory, string> = {
  feed: 'Yem',
  foal: 'Tay',
  supplement: 'Takviye',
  medicine: 'İlaç',
};

export const FEED_QUALITY_LABELS: Record<FeedItemView['qualityTier'], string> = {
  basic: 'Temel',
  standard: 'Standart',
  premium: 'Premium',
};

/** Kalemin kısa etkisi (etki sayıları sunucu config'indedir; burada yalnızca anlatılır). */
export const FEED_TYPE_DESCRIPTIONS: Record<FeedType, string> = {
  saman: 'Bedava, enerji verir. At başına günde en fazla 3 kez.',
  arpa: 'Enerjiyi en çok artıran standart yem, kilo durumunu da destekler.',
  mama: 'Arpa’dan az enerji ama daha çok kondisyon verir.',
  havuc: 'Enerji vermez; moral ve toparlanma sağlar.',
  vitamin: 'Sağlık ve toparlanma için takviye.',
  yulaf: 'Ucuz standart yem: biraz enerji ve kondisyon.',
  enerji_yemi: 'Premium yem: yüksek enerji. Günde en fazla 2.',
  kondisyon_yemi: 'Premium yem: kondisyon geliştirir. Günde en fazla 2.',
  tay_yemi: 'Yalnızca tay ve gelişim çağındaki ata: sağlık + enerji ve yarış statına küçük, kalıcı katkı (ömür boyu sınırlı).',
  elektrolit: 'Takviye: yorgunluğu azaltır.',
  eklem_takviyesi: 'Takviye: eklem durumunu iyileştirir. Günde 1.',
  agri_kesici: 'İlaç: sakatlık riskini düşürür. Son 24 saatte veteriner kontrolü gerekir. Günde 1.',
};

/** Ekranda kategori sırası. */
export const FEED_CATEGORY_ORDER: readonly FeedCategory[] = ['feed', 'foal', 'supplement', 'medicine'];
