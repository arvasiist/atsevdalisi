import type { AnnouncementLevel, AssignableRole, ModerationRole, SanctionKind } from '@at-sevdalisi/shared-types';

/**
 * MODERASYON + DUYURU PORTU (02.10.2026, Faz 10 + 11-A, migration 0060).
 * Her YAZMA yolu, denetim kaydını (`admin_audit_log`) AYNI transaction'da
 * yazar (kural: ayrı bir INSERT geri alınmış işin kaydını bırakırdı). Kural
 * kontrolleri `check`/`mutate` geri çağrılarıyla KİLİT ALTINDA koşar.
 */
export interface SanctionRecord {
  id: string;
  playerId: string;
  kind: SanctionKind;
  reason: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  liftedAt: Date | null;
  liftedBy: string | null;
  liftReason: string | null;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  startsAt: Date;
  endsAt: Date | null;
  createdBy: string;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface ModerationRepository {
  /** Silinmemiş oyuncunun yönetim rolü; oyuncu yoksa/rolsüzse `null`. Önbelleksiz. */
  findRole(playerId: string): Promise<ModerationRole | null>;
  /** Etkin yaptırım (en kısıtlayıcısı); yoksa `null`. */
  findActiveSanction(playerId: string, now: Date): Promise<SanctionRecord | null>;
  listSanctions(playerId: string, limit: number): Promise<SanctionRecord[]>;
  /**
   * Hedef oyuncu `FOR UPDATE`; `check(hedefRolü)` kilit altında (kendine/
   * personele yaptırım yok). Yasakta oyuncunun TÜM oturumları kapanır. Hedef
   * yoksa `null`.
   */
  createSanction(input: {
    actorId: string;
    playerId: string;
    kind: SanctionKind;
    reason: string;
    expiresAt: Date | null;
    now: Date;
    check: (targetRole: ModerationRole | null) => void;
  }): Promise<SanctionRecord | null>;
  /** Yaptırım `FOR UPDATE`; `check(yaptırım)` kilit altında. Yoksa/kaldırılmışsa `null`. */
  liftSanction(input: {
    actorId: string;
    sanctionId: string;
    reason: string;
    now: Date;
    check: (sanction: SanctionRecord) => void;
  }): Promise<SanctionRecord | null>;
  /** Hedef `FOR UPDATE`; eski → yeni rol denetime yazılır. Hedef yoksa `null`. */
  setRole(input: {
    actorId: string;
    playerId: string;
    role: AssignableRole;
    now: Date;
  }): Promise<{ from: AssignableRole; to: AssignableRole } | null>;
  /**
   * Duyuru açar. Yayındaki duyuru sayısı `maxLive`a ulaşmışsa (yeni duyuru
   * şu an yayına giriyorsa) `limit_reached` döner — sayım danışma kilidi
   * altında (eşzamanlı iki açılış sınırı aşamasın).
   */
  createAnnouncement(input: {
    actorId: string;
    title: string;
    body: string;
    level: AnnouncementLevel;
    startsAt: Date;
    endsAt: Date | null;
    maxLive: number;
    now: Date;
  }): Promise<AnnouncementRecord | 'limit_reached'>;
  /** Arşivler; yoksa/arşivliyse `null`. */
  archiveAnnouncement(actorId: string, announcementId: string, now: Date): Promise<AnnouncementRecord | null>;
  listLiveAnnouncements(now: Date): Promise<AnnouncementRecord[]>;
  listAnnouncements(limit: number): Promise<AnnouncementRecord[]>;
}

export const MODERATION_REPOSITORY = Symbol('MODERATION_REPOSITORY');
