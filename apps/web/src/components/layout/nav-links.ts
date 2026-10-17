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
export type NavIconName =
  | 'home'
  | 'horse'
  | 'training'
  | 'care'
  | 'races'
  | 'grandstand'
  | 'market'
  | 'leaderboard'
  | 'friends'
  | 'club'
  | 'quests'
  | 'staff'
  | 'replays'
  | 'farm'
  | 'online'
  | 'wallet'
  | 'notifications'
  | 'account'
  | 'avatar'
  | 'store';

/**
 * Yerleşim (01.10.2026 tasarım yenilemesi):
 *  - `primary`: masaüstünde üst menüde simge + etiketle görünür.
 *  - `more`: masaüstünde "Daha fazla" açılır menüsünde.
 *  - `utility`: masaüstünde sağda yalnızca simge (bildirim zili).
 *  - `mobileTab`: telefonda alt sekme çubuğuna girer (en fazla 4; beşincisi
 *    "Menü"dür ve geri kalan HER bağlantıyı açar).
 * Simge adı saf veridir; bileşen eşlemesi `nav-icons.tsx`'tedir (bu dosya
 * React'ten bağımsız kalır).
 */
export interface NavLink {
  href: string;
  label: string;
  icon: NavIconName;
  placement: 'primary' | 'more' | 'utility';
  mobileTab?: boolean;
}

/**
 * 16.10.2026 — brief §3.2 (sahibinin kararı): üst menüde YALNIZCA dört ana
 * bölüm — Ana Sayfa, Ahır, Antrenman, Bakım. Bakım ahırın içindedir; `/care`
 * ahıra yönlenir ve paneli açar. Geri kalan her bölüm "Daha fazla"da (masaüstü)
 * ve "Menü"de (telefon) — Yarışlar listenin başında; ahır sahnesinde ayrıca
 * Yarışlar/Pazar kısayolları vardır (`StableActionDock`).
 */
export const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: '/', label: 'Ana Sayfa', icon: 'home', placement: 'primary', mobileTab: true },
  { href: '/stable', label: 'Ahır', icon: 'horse', placement: 'primary', mobileTab: true },
  { href: '/training', label: 'Antrenman', icon: 'training', placement: 'primary', mobileTab: true },
  { href: '/care', label: 'Bakım', icon: 'care', placement: 'primary', mobileTab: true },
  { href: '/races', label: 'Yarışlar', icon: 'races', placement: 'more' },
  { href: '/market', label: 'Pazar', icon: 'market', placement: 'more' },
  { href: '/grandstand', label: 'Tribün', icon: 'grandstand', placement: 'more' },
  { href: '/leaderboard', label: 'Sıralama', icon: 'leaderboard', placement: 'more' },
  { href: '/friends', label: 'Sosyal', icon: 'friends', placement: 'more' },
  // 16.10.2026 — sosyal brief §7: arkadaş daveti + davet ödülü.
  { href: '/invite', label: 'Arkadaş Davet Et', icon: 'friends', placement: 'more' },
  { href: '/quests', label: 'Görevler', icon: 'quests', placement: 'more' },
  { href: '/club', label: 'Kulüp', icon: 'club', placement: 'more' },
  { href: '/staff', label: 'Personel', icon: 'staff', placement: 'more' },
  { href: '/replays', label: 'Yarış Geçmişi', icon: 'replays', placement: 'more' },
  { href: '/farm', label: 'Çiftlik', icon: 'farm', placement: 'more' },
  { href: '/breeds', label: 'Yetiştirici', icon: 'horse', placement: 'more' },
  // 16.10.2026 — çiftleştirme merkezi (aygır ilanı, teklif, gebelik takvimi; brief §4–§5).
  { href: '/breeding', label: 'Çiftleştirme Merkezi', icon: 'horse', placement: 'more' },
  { href: '/online', label: 'Online', icon: 'online', placement: 'more' },
  { href: '/store', label: 'Mağaza', icon: 'store', placement: 'more' },
  { href: '/wallet', label: 'Cüzdan', icon: 'wallet', placement: 'more' },
  { href: '/avatar', label: 'Avatarım', icon: 'avatar', placement: 'more' },
  { href: '/account', label: 'Hesap', icon: 'account', placement: 'more' },
  // 16.10.2026 — KVKK aydınlatma, gizlilik ve kullanım şartları her yerden ulaşılabilir.
  { href: '/yasal', label: 'Gizlilik ve Şartlar', icon: 'account', placement: 'more' },
  { href: '/notifications', label: 'Bildirimler', icon: 'notifications', placement: 'utility' },
];

/** En fazla bu kadar bağlantı alt sekme çubuğuna girer (beşinci yuva "Menü"). */
export const MAX_MOBILE_TABS = 4;

/**
 * 08.10.2026 — bakiyenin yanındaki belirgin "+" (sahibinin isteği). 16.10.2026
 * (sosyal brief §6): çip paketleri mağazada olduğu için ikisi de mağazaya gider.
 * Yalnızca yönlendirir; satın alma kararı ve tutar her zaman o sayfada ve sunucuda.
 */
export const TOP_UP_HREF: Record<'money' | 'gems', string> = {
  money: '/store',
  gems: '/store',
};
