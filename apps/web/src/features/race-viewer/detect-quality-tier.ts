import { classifyQualityTier, type QualityTier } from './quality-tier';

// 01.10.2026 — `RaceScene3D.tsx`ten çıkarıldı: ana sayfa 3D sahnesi de aynı
// algılamayı kullanır (iki kopya ayrışmasın).

/**
 * `navigator.userAgent`'ta yaygın mobil işletim sistemi/tarayıcı
 * imzalarını arar (Android telefon/tablet, iOS'un TÜM cihazları —
 * `iPhone`/`iPad`/`iPod`, ve daha az yaygın `Windows Phone`). Tablet/
 * masaüstü ayrımı GEREKMİYOR — Master Plan §46 yalnızca "Mobile" ile
 * "Desktop" ikilisini ayırıyor, `classifyQualityTier`'ın kendisi zaten
 * çekirdek sayısına göre bir mobil cihazı 'low'dan 'high'a kadar
 * kademeleyebiliyor (bkz. o dosyanın doc yorumu).
 */
const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|Windows Phone/i;

/**
 * `quality-tier.ts`'in saf `classifyQualityTier`'ını GERÇEK tarayıcı
 * sinyalleriyle besleyen ince, KASITLI OLARAK saf OLMAYAN sarmalayıcı —
 * bu dosyanın zaten `docs/ARCHITECTURE.md` §9 gereği yalnızca CI'da
 * doğrulanabildiğinden, `navigator` okuması buraya, `quality-tier.ts`'i
 * (ve onun bu sandbox'taki GERÇEK `tsc`/`tsx` doğrulamasını) DOM'a
 * bağımlı KILMADAN eklendi.
 */
export function detectQualityTier(): QualityTier {
  if (typeof navigator === 'undefined') {
    // SSR sırasında teorik olarak çağrılabilir (pratikte çağrılmaz, bkz.
    // `RaceViewer.tsx`'teki `next/dynamic({ssr:false})`) — güvenli bir
    // orta-üst varsayım, tarayıcıda GERÇEK değer HER ZAMAN client-side
    // mount sonrası hesaplanır.
    return 'high';
  }
  const isMobileUserAgent = MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);
  const hardwareConcurrencyCores =
    typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 0;
  return classifyQualityTier({ isMobileUserAgent, hardwareConcurrencyCores });
}
