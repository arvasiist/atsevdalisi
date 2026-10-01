/**
 * ÜST BAR GEZİNME ŞERİDİNİN bağlantı listesi (28.09.2026).
 *
 * **NEDEN AYRI BİR MODÜL (TopBar.tsx içinde değil):** bu liste `TopBar.tsx`
 * içinde kalsaydı, onu doğrulayan test de o bileşeni import etmek zorunda
 * kalırdı — ve `TopBar.tsx` React, `next/link` ve `player-context` çeker.
 * Liste ise SAF VERİDİR; onu React'ten ayırmak, testin DOM'suz (varsayılan
 * `node` ortamında) ve tek bir bileşen yükleme hatasına bağlı olmadan
 * koşmasını sağlar. Aynı ayrım `features/race/race-entry.ts` gibi saf
 * mantık modüllerinde de uygulanıyor.
 *
 * **YALNIZCA GERÇEK SAYFALAR LİSTELENİR.** Brief §35'in henüz yazılmamış
 * sayfaları (`/messages`, `/profile/:username`, `/gifts`, `/races/:id`,
 * `/races/:id/spectate`) buraya KONULMADI — kırık bir bağlantı ya da sahte
 * bir "yakında" satırı, listenin geri kalanına duyulan güveni bozardı.
 * Sayfa yazıldıkça buraya eklenir; sayfası olmayan bir bağlantı eklenirse
 * `top-bar-nav.spec.ts` KIRILIR.
 *
 * `/profile/:username` buraya **hiçbir zaman** giremez ve bu bir eksiklik
 * değildir: dinamik bir segmenttir, statik bir gezinme hedefi olamaz —
 * kullanıcı adı ancak oyuncunun kendisinden bilinir. Keşif yolu üst
 * bardaki profil bağlantısıdır (`TopBar.tsx`).
 */
export const NAV_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/', 'Panel'],
  ['/stable', 'Ahır'],
  ['/races', 'Yarışlar'],
  ['/grandstand', 'Tribün'],
  ['/replays', 'Yarış Geçmişi'],
  ['/market', 'Pazar'],
  ['/leaderboard', 'Sıralama'],
  ['/wallet', 'Cüzdan'],
  ['/friends', 'Arkadaşlar'],
  ['/notifications', 'Bildirimler'],
  ['/account', 'Hesap'],
];
