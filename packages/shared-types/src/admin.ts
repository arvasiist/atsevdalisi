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
