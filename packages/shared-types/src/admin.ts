import type { Currency } from './currency';
import type { RaceStatus, RaceSurface } from './race';
import type { ReportCategory, ReportStatus } from './social';

/**
 * brief §34 "ADMIN PANEL" — yönetim uçlarının paylaşılan sözleşmesi
 * (§42 PHASE 15-B).
 *
 * **BU DOSYA PARA TAŞIMAZ.** Şikâyet kuyruğu bir MODERASYON görünümüdür;
 * §34 "Transactions / Wallet" ekranları AYRI bir dilimdir ve o ekranlar
 * `money`/`gems` göstermek zorunda olacaktır. O gün geldiğinde o alanlar
 * BURAYA değil, kendi tiplerine (`AdminWalletView` gibi) yazılmalıdır —
 * böylece "yönetim görebilir" istisnası, para taşımayan bir tipin içine
 * sessizce sızmaz (`PlayerProfileView`'in `Pick`/`Omit` yasağıyla AYNI
 * disiplin: alanlar AÇIKÇA yazılır, türetilmez).
 */

/** Yönetim görünümünde bir oyuncuya işaret eden minimal referans. */
export interface AdminPlayerRef {
  playerId: string;
  displayName: string;
}

/**
 * Moderasyon kuyruğundaki tek bir şikâyet.
 *
 * **NEDEN `reporter`/`reported` NESNE, DÜZ `reporterId` DEĞİL:** kuyruğu
 * gösteren ekran aksi hâlde her satır için iki ayrı oyuncu isteği atmak
 * zorunda kalırdı (N+1). Görünen ad zaten sunucuda JOIN ile elde
 * edilebiliyorken bunu istemciye bırakmak, `findBlockedPlayers`'ın
 * "JOIN şart, N+1 yasak" gerekçesiyle aynı kuralı çiğnerdi.
 */
export interface AdminReportView {
  reportId: string;
  reporter: AdminPlayerRef;
  reported: AdminPlayerRef;
  category: ReportCategory;
  /** Serbest metin gerekçe — oyuncu yazmadıysa `null` (`normalizeReportReason`). */
  reason: string | null;
  status: ReportStatus;
  createdAt: string;
  /**
   * Şikâyeti en son ELE ALAN yönetici — hiç ele alınmadıysa `null`.
   * `status`'tan TÜRETİLEMEZ: `reviewing` durumundaki bir kaydın kim
   * tarafından alındığı ayrı bir bilgidir.
   */
  reviewedBy: AdminPlayerRef | null;
  /** Durumun en son değiştiği an — hiç değişmediyse `null`. */
  reviewedAt: string | null;
}

/** `GET /admin/reports` yanıtı. */
export interface AdminReportListResult {
  reports: AdminReportView[];
}

/** `PATCH /admin/reports/:reportId` yanıtı — GÜNCELLENMİŞ satır. */
export interface UpdateReportStatusResult {
  reportId: string;
  status: ReportStatus;
  reviewedBy: AdminPlayerRef;
  reviewedAt: string;
}

/**
 * Denetim günlüğü kaydı — brief §34 "Finansal işlemler audit log'a
 * yazılmalı."
 *
 * `action` SERBEST METİNDİR (DB'de CHECK yoktur), `player_reports.status`
 * gibi kapalı bir küme DEĞİLDİR: her yeni yönetim işlemi kendi eylem adını
 * getirir ve her seferinde bir migration yazmak, denetimin amacına hizmet
 * etmeyen bir tören olurdu. Kapalı küme yalnızca DAVRANIŞI kısıtlaması
 * gereken yerlerde (şikâyet durumu) vardır.
 */
export interface AdminAuditLogView {
  id: string;
  admin: AdminPlayerRef;
  /** Örn. `report.status_changed`. */
  action: string;
  /** Örn. `player_report`. */
  targetType: string;
  /** Hedef satırın kimliği — hedef silinmiş olabileceği için FK DEĞİLDİR. */
  targetId: string | null;
  /** Eyleme özgü ayrıntı (örn. `{ "from": "open", "to": "resolved" }`). */
  details: Record<string, unknown>;
  createdAt: string;
}

/** `GET /admin/audit-log` yanıtı. */
export interface AdminAuditLogResult {
  entries: AdminAuditLogView[];
}

/**
 * Yönetim ekranlarındaki oyuncu satırı — brief §34'ün "Users" VE "Wallet"
 * başlıklarının ORTAK karşılığı.
 *
 * **NEDEN İKİ AYRI LİSTE DEĞİL:** cüzdan ayrı bir varlık DEĞİLDİR;
 * `players.money` / `players.gems` kolonlarıdır (migration 0001). Aynı
 * satırları ikinci bir uç noktadan da sunmak, iki yanıtın birbirinden
 * kaymasına (biri güncel, diğeri bayat bakiye) açık bir kapı olurdu.
 *
 * **BU TİP PARA TAŞIR — VE TAŞIMAK ZORUNDADIR.** `PlayerProfileView`in
 * aksine (bkz. `docs/API.md`: o uç `@Public()`tir ve bakiye SIZDIRMAZ)
 * buradaki her alan yalnızca yöneticiye açıktır; yetki kapısı
 * `players.is_admin`tir ve her istekte okunur. Yine de alanlar
 * `PlayerSummary`den `Pick`/`Omit` ile TÜRETİLMEZ: türetme, ileride
 * `PlayerSummary`ye eklenecek bir alanı sessizce buraya sokardı
 * (bkz. dosya başı notu — AUDIT Bulgu S4).
 */
export interface AdminPlayerAccountView {
  playerId: string;
  /** Giriş kimliği — görünen addan AYRI; ikisi çakışabilir (bkz. `PlayerProfileView`). */
  username: string;
  displayName: string;
  level: number;
  xp: number;
  money: number;
  gems: number;
  reputation: number;
  /**
   * Yönetici mi. **LİSTEDE GÖSTERİLİR ÇÜNKÜ PANELİN İLK SORUSU BUDUR:**
   * "bu hesap neden bu ekranı görebiliyor?" Ayrıca yetki verme/alma
   * işleminin bugün bir uç noktası YOKTUR (bilinçli — bkz. §13.17); bu
   * alan, o işlem yapılana kadar tek görünürlük kaynağıdır.
   */
  isAdmin: boolean;
  createdAt: string;
}

/** `GET /admin/players` yanıtı. */
export interface AdminPlayerListResult {
  players: AdminPlayerAccountView[];
}

/**
 * Yönetim ekranlarındaki yarış satırı — brief §34'ün "Races" başlığı.
 *
 * `joinedPlayers` GÖRÜNÜM İÇİN TÜRETİLMİŞ BİR SAYIDIR (iptal edilmiş
 * katılımlar HARİÇ), `maxPlayers` ise tavandır. İkisini birlikte
 * göstermek, "bu yarış neden başlamadı" sorusunu tek bakışta yanıtlar.
 */
export interface AdminRaceView {
  raceId: string;
  name: string;
  status: RaceStatus;
  raceType: 'free' | 'paid';
  surface: RaceSurface;
  distanceM: number;
  entryFee: number;
  prizePool: number;
  tribuneFee: number;
  /** Kaç AT koşabilir (`participant_limit`). */
  participantLimit: number;
  /** Kaç GERÇEK OYUNCU katılabilir (`max_players`). */
  maxPlayers: number;
  /** Şu an katılmış GERÇEK oyuncu sayısı — iptal edilmiş katılımlar sayılmaz. */
  joinedPlayers: number;
  startTime: string;
  createdAt: string;
  /**
   * Yarışı AÇAN oyuncu — sunucu üretimi yarışlarda (pratik/PvP) `null`dır
   * (migration 0036 notu). `AdminPlayerRef`in "yarısı dolu referans
   * üretme" kuralı burada da geçerlidir: görünen ad JOIN'de yoksa `null`.
   */
  createdBy: AdminPlayerRef | null;
}

/** `GET /admin/races` yanıtı. */
export interface AdminRaceListResult {
  races: AdminRaceView[];
}

/**
 * Yönetim ekranlarındaki defter satırı — brief §34'ün "Transactions" VE
 * "Gifts" başlıklarının ORTAK karşılığı.
 *
 * **NEDEN İKİ AYRI LİSTE DEĞİL:** hediye ayrı bir defter DEĞİLDİR; bir
 * `economy_transactions` satırıdır (`type = 'gift_send'`, migration 0034).
 * Süzgeç istemcinin işidir — sunucuda `type` süzgeci, `type`ın serbest
 * metin olması yüzünden (migration 0019 notu) sessizce EKSİK sonuç
 * döndürürdü ve denetim ekranında "eksik ama doğru görünen" bir liste,
 * hiç liste olmamasından kötüdür.
 *
 * `amount` İMZALIDIR: negatif = düşüm, pozitif = ekleme. İşaret
 * gizlenmez, çünkü yöneticinin sorduğu soru tam olarak "para hangi yöne
 * gitti"dir. `balanceBefore`/`balanceAfter` defterin kendi
 * `CHECK (balance_after = balance_before + amount)` kısıtından gelir —
 * yani bu üç alan sunucuda BİRBİRİNİ TUTMAK ZORUNDADIR (migration 0019).
 */
export interface AdminTransactionView {
  transactionId: string;
  /** Hareketin sahibi — transfer iki satır üretir, bu ikisinden BİRİDİR. */
  player: AdminPlayerRef;
  /** Örn. `gift_send`, `race_entry_refund`, `daily_reward` (serbest metin). */
  type: string;
  amount: number;
  currency: Currency;
  referenceType: string | null;
  referenceId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

/** `GET /admin/transactions` yanıtı. */
export interface AdminTransactionListResult {
  transactions: AdminTransactionView[];
}
