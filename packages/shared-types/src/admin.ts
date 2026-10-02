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
  /**
   * Bu durumdan ÇIKILABİLECEK durumlar — sunucudan gelir, istemcide
   * TÜRETİLMEZ (28.09.2026, yönetim paneli dilimi).
   *
   * **NEDEN BİR ALAN, NEDEN İSTEMCİDE `if` DEĞİL:** geçiş çizgesi
   * (`REPORT_STATUS_TRANSITIONS`) kapalı bir DAG'dır ve terminal
   * durumların (`resolved`/`dismissed`) çıkışı YOKTUR. İstemciye "şu
   * düğmeleri göster" demek için çizgeyi ORADA ikinci kez yazmak, iki
   * kaynağın çeliştiği bir an üretirdi — ve o an, sunucunun reddettiği bir
   * düğmeyi "geçerli" gösterir (kullanıcı basar, 409 alır, panel bozuk
   * görünür). Alternatif olan "hepsini göster, geçersizse hata çıkar" ise
   * kapanmış bir kayda üç tane asla çalışmayacak düğme koyardı.
   *
   * **TEK KAYNAK KORUNUR:** bu alan sunucuda `REPORT_STATUS_TRANSITIONS`ten
   * ÜRETİLİR, oradan kopyalanmaz; `admin.e2e-spec.ts` yanıttaki değeri
   * çizgenin kendisiyle karşılaştırır. Terminal durumda `[]`dir — istemci
   * "boş dizi = eylem yok" diye okur, "bilinmiyor" diye değil.
   */
  allowedTransitions: ReportStatus[];
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
  /** 02.10.2026 (Faz 10) — moderatör mü (`is_moderator`). */
  isModerator: boolean;
  /** 02.10.2026 (Faz 10) — şu an etkin yaptırım (en kısıtlayıcı); yoksa `null`. */
  activeSanction: AdminActiveSanction | null;
  createdAt: string;
}

/** `GET /admin/players` yanıtı. */
export interface AdminPlayerListResult {
  players: AdminPlayerAccountView[];
}

/**
 * Yarış iptalinin REDDEDİLME nedenleri — kapalı küme (28.09.2026, yönetim
 * paneli dilimi).
 *
 * **NEDEN BURADA, `domain/admin/race-cancel.ts`TE DEĞİL:** kural
 * (hangi durumun iptal edilebilir olduğu) DOMAIN'de kalır
 * (`REFUSAL_BY_STATUS`); buradaki yalnızca **sözleşmedir** — sunucunun
 * istemciye döndürebileceği değerlerin listesi. `AdminRaceView` bu
 * değerlerden birini taşıdığı için tipin API sınırını geçmesi gerekir ve
 * `shared-types` tam olarak o sınırdır (`ERROR_CODES` ile AYNI gerekçe).
 * Domain dosyası bu sabiti İTHAL EDİP yeniden ihraç eder; yani liste TEK
 * yerde durur, kopyası yoktur.
 *
 * **NEDEN KOD, NEDEN `canCancel: boolean` DEĞİL:** "iptal edilemez" tek
 * başına yöneticiye hiçbir şey söylemez. `ALREADY_FINISHED` ("yarış koştu,
 * ödüller dağıtıldı") ile `ALREADY_STARTED` ("yarış şu an koşuyor") aynı
 * düğmenin yokluğunda ayırt edilemez hâle gelirdi — oysa biri kalıcı,
 * diğeri geçicidir. Ekran bu kodu Türkçe bir gerekçeye çevirir.
 */
export const RACE_CANCEL_REFUSALS = [
  'ALREADY_STARTED',
  'ALREADY_FINISHED',
  'ALREADY_CANCELLED',
  'UNKNOWN_STATUS',
] as const;

export type RaceCancelRefusal = (typeof RACE_CANCEL_REFUSALS)[number];

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
  /**
   * `null` = **İPTAL EDİLEBİLİR**, aksi hâlde reddin nedeni.
   *
   * Sunucudaki `checkRaceCancelable`in sonucudur — istemci "hangi durum
   * iptal edilebilir" sorusunu KENDİ SORMAZ. `allowedTransitions` ile AYNI
   * gerekçe: kuralı istemcide ikinci kez yazmak, iki kaynağın çeliştiği bir
   * an üretir — ve burada sonuç yalnızca bozuk bir düğme değil, **para
   * yolunda yanlış bir işlem vaadidir** (`finished` bir yarışı iptal etmek,
   * kazanana ödenmiş `race_prize` yerine ödediği giriş ücretini iade
   * etmek olurdu).
   */
  cancelRefusal: RaceCancelRefusal | null;
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
 * `POST /admin/races/:raceId/cancel` yanıtı — brief §34 "Cancel"
 * (28.09.2026).
 *
 * **BU BİR PARA YOLUDUR.** İptal, katılım ücreti ödemiş HER oyuncuya
 * parasını geri verir ve `races.prize_pool`'u sıfırlar. Bu yüzden yanıt
 * yalnızca "iptal edildi" demez; **KAÇ OYUNCUYA NE KADAR İADE EDİLDİĞİNİ**
 * de söyler. Yönetici ekranının ihtiyacı olan sayı budur: "iptal ettim"
 * tek başına, iadenin gerçekten yapıldığını kanıtlamaz.
 *
 * `refundedTotal` = iade edilen tutarların TOPLAMI. İade tutarı defterden
 * okunur (`lobby_race_entry_fee` satırı), `races.entry_fee`'den DEĞİL —
 * gerekçe `LeaveRaceUseCase` ile AYNIdır: "o an geçerli ücret" üzerinden
 * iade hesaplamak, ücret güncellenebilir hâle geldiğinde sessizce yanlış
 * tutar öderdi.
 *
 * **BOTLARA İADE YOKTUR ve `refundedPlayers`a GİRMEZLER.** Botların
 * `player_id`'si yoktur, dolayısıyla ödedikleri bir para da yoktur —
 * onları saymak, iade edilmiş gibi görünen ama edilmemiş bir tutar
 * üretirdi (ödül dağıtımındaki "bot payı yanar" kuralının iade
 * tarafındaki karşılığı).
 */
export interface AdminRaceCancelResult {
  raceId: string;
  name: string;
  /** İadesi yapılan GERÇEK oyuncu sayısı — ücretsiz yarışta `0`dır. */
  refundedPlayers: number;
  /** İade edilen toplam tutar (para birimi: `money`). */
  refundedTotal: number;
  cancelledAt: string;
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

/* ------------------------------------------------------------------ */
/* 02.10.2026 — FAZ 10 + 11-A: roller, yaptırımlar, duyurular           */
/* ------------------------------------------------------------------ */

/** Yönetim rolü (moderasyon); oyuncu için `null`. Personel (seyis vb.) `StaffRole` İLE KARIŞTIRMA. */
export type ModerationRole = 'admin' | 'moderator';
/** `PUT /admin/players/:id/role` gövdesi. */
export type AssignableRole = 'player' | ModerationRole;

/** Askı SÜRELİ, yasak SÜRESİZ (migration 0060 CHECK). */
export type SanctionKind = 'suspend' | 'ban';

export interface PlayerSanctionView {
  id: string;
  playerId: string;
  kind: SanctionKind;
  reason: string;
  createdBy: string;
  createdAt: string;
  /** Askıda bitiş; yasakta `null`. */
  expiresAt: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftReason: string | null;
  /** Sunucunun "şu an" ile hesapladığı durum (istemci saatine güvenilmez). */
  active: boolean;
}

export interface AdminActiveSanction {
  id: string;
  kind: SanctionKind;
  expiresAt: string | null;
}

export type AnnouncementLevel = 'info' | 'warning' | 'maintenance';

/** Oyuncuya görünen duyuru (`GET /announcements`). */
export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  startsAt: string;
  endsAt: string | null;
}

/** Yönetim listesi satırı — arşiv bilgisiyle. */
export interface AdminAnnouncementView extends AnnouncementView {
  createdBy: string;
  createdAt: string;
  archivedAt: string | null;
  /** Şu an oyunculara görünüyor mu (sunucu hesaplar). */
  live: boolean;
}
