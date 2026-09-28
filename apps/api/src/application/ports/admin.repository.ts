import type { ReportCategory, ReportStatus } from '@at-sevdalisi/shared-types';

/**
 * `AdminRepository` — yönetim (admin) uçlarının Infrastructure'a bağlandığı
 * PORT (brief §34, §42 PHASE 15-B). `PlayerRepository`/`SocialRepository`
 * ile AYNI desen ve AYNI gerekçe (bkz. `player.repository.ts` doc yorumu).
 *
 * **NEDEN AYRI BİR PORT, `PlayerRepository`'ye METOD EKLEMEK DEĞİL:**
 * yönetim okumaları başka bir ERİŞİM SINIFIDIR — bir oyuncunun kendi
 * verisini okuması değil, BAŞKALARININ verisini okumaktır. Aynı arayüze
 * koymak, her yönetim metodunun yanında "bunu çağıran yönetici mi"
 * sorusunu taşımak zorunda bırakırdı; ayrı portta ise yetki kapısı
 * use-case'lerin ilk satırındadır ve portu yanlışlıkla çağıran bir
 * oyuncu yolu YOKTUR (bkz. `AdminModule` — bu portu yalnızca yönetim
 * use-case'leri enjekte eder).
 */
export interface AdminRepository {
  /**
   * Oyuncunun yönetici olup olmadığı — TEK kolonluk sorgu.
   *
   * **HER İSTEKTE OKUNUR, ÖNBELLEĞE ALINMAZ.** Yetki iptalinin ANINDA
   * etki etmesi bunu gerektirir (bkz. `players.is_admin` migration notu:
   * rol token'a gömülmez). Bu sorgu birincil anahtar üzerinden tek
   * satırdır; önbelleğin kazandıracağı şey ölçülemez, kaybettireceği şey
   * ise "yetkisi alınmış yönetici hâlâ içeride"dir.
   */
  isAdmin(playerId: string): Promise<boolean>;

  /**
   * Moderasyon kuyruğu — TÜM şikâyetler, EN YENİDEN eskiye.
   *
   * **YALNIZCA `open` ŞİKÂYETLER DEĞİL:** kuyruk bir İŞ LİSTESİ değil,
   * bir KAYIT GÖRÜNÜMÜdür; yönetici "bu oyuncu daha önce şikâyet edilmiş
   * miydi" sorusunu ancak kapanmış kayıtları da görerek yanıtlayabilir.
   * Süzgeç istemcinin işidir; sunucu tarafında `status` süzgeci eklemek,
   * "tekrarlayan şikâyet" tespitini imkânsız kılardı.
   *
   * Görünen adlar JOIN ile gelir (N+1 yasak —
   * `findBlockedPlayers` ile AYNI gerekçe).
   */
  listReports(limit: number): Promise<AdminReportRecord[]>;

  /**
   * Şikâyet durumunu DEĞİŞTİRİR ve denetim kaydını **AYNI transaction'da**
   * yazar.
   *
   * **`withReportLock` DESENİ (`PlayerRepository.updateWithLock` ile
   * AYNI):** satır `FOR UPDATE` ile kilitlenir, `mutate` GÜNCEL satırla
   * çağrılır, dönüşü aynı transaction'da yazılır. Kilit olmasaydı iki
   * yönetici aynı anda farklı durumlar yazabilir ve GEÇİŞ KURALI
   * (`assertReportTransitionAllowed`) yarış koşuluna düşerdi: ikisi de
   * `open` okur, ikisi de geçerli bir geçiş hesaplar, son yazan kazanır —
   * arada bir geçiş KAYBOLUR ve denetim günlüğü gerçekleşmemiş bir
   * sırayı anlatırdı.
   *
   * **`mutate` NEDEN `status` DÖNDÜRÜR, TAM SATIR DEĞİL:** yönetici
   * yalnızca DURUMU değiştirebilir; `category`/`reason`/`reporter_id`
   * DEĞİŞMEZ (şikâyet bir OLAY kaydıdır — migration 0040 notu). Bu
   * yüzden callback'e yazma yetkisi tek bir alan için verilir; tam bir
   * satır döndürme imkânı, "yanlışlıkla kategori de değişti" hatasına
   * açık bir kapı olurdu.
   *
   * `mutate` İÇİNDE bir domain hatası fırlatılırsa (örn.
   * `InvalidReportStatusError`) transaction ROLLBACK olur — ne durum ne
   * denetim kaydı yazılır. Bu şarttır: yalnızca biri yazılsaydı, "olmayan
   * bir işlem kayıtlı" ya da "kayıtsız bir işlem olmuş" durumu doğardı.
   *
   * Şikâyet bulunamazsa `mutate` HİÇ ÇAĞRILMAZ ve `null` döner (çağıran
   * `ReportNotFoundError` fırlatır — `updateWithLock` ile AYNI sözleşme).
   *
   * **`adminId` AYRI BİR PARAMETREDİR, `mutate`'İN DÖNÜŞÜNDE DEĞİL:**
   * "kim yaptı" bilgisi ÇAĞIRANIN kimliğidir ve uygulama katmanından
   * gelir; `mutate`'in döndürdüğü şey ise YENİ DURUMdur. İkisini tek
   * nesnede birleştirmek, bir gün "mutate admin id'sini de döndürsün"
   * diyen bir değişikliğin denetim kaydını SAHTELEŞTİREBİLİR hâle
   * getirirdi.
   *
   * **DENETİM KAYDI BURADA YAZILIR, use-case'te DEĞİL.** Bu port
   * "durumu değiştir" değil, "durumu değiştir VE bunu kaydet"tir: ikisi
   * AYNI transaction olmazsa, geri alınmış bir güncellemenin denetim
   * kaydı ortada kalırdı ve bu **hiçbir yerde hata üretmezdi** (bkz.
   * `NotificationRepository` port doc yorumundaki AYNI kural — bildirim
   * ve onu doğuran yazma asla ayrılamaz). Eylem adı
   * (`report.status_changed`) ve ayrıntısı (`{ from, to }`) sabittir;
   * çağıranın bunları seçmesi gerekmez.
   */
  updateReportStatusWithLock<T>(
    reportId: string,
    adminId: string,
    mutate: (report: AdminReportRecord) => { status: ReportStatus; result: T },
  ): Promise<{ report: AdminReportRecord; result: T } | null>;

  /**
   * Denetim günlüğü — en yeniden eskiye. brief §34'ün "audit log"
   * gereksiniminin OKUMA ayağı.
   */
  listAuditLog(limit: number): Promise<AdminAuditLogRecord[]>;
}

/**
 * Moderasyon kuyruğunun tek satırı — PORT tipidir, `AdminReportView`
 * (paylaşılan sözleşme) DEĞİLDİR: tarihler burada `Date`'tir, çünkü
 * repository'nin işi satırı olduğu gibi taşımaktır; ISO metne çevirmek
 * ve alan adlarını sözleşmeye eşlemek use-case'in işidir
 * (`PlayerProfileRecord` ile AYNI ayrım).
 */
export interface AdminReportRecord {
  reportId: string;
  reporterId: string;
  reporterDisplayName: string;
  reportedId: string;
  reportedDisplayName: string;
  category: ReportCategory;
  reason: string | null;
  status: ReportStatus;
  createdAt: Date;
  /**
   * Şikâyeti en son ele alan yöneticinin kimliği — hiç alınmadıysa `null`.
   *
   * `reviewedById` İLE `reviewedByDisplayName` AYRI İKİ ALANDIR ve biri
   * doluyken diğeri boş OLABİLİR: ad, `players` tablosuna yapılan bir JOIN
   * ile gelir ve yönetici hesabı silinmişse (ya da JOIN bir sebeple
   * eşleşmezse) kimlik dururken ad `null` olur. Repository ikisini de
   * olduğu gibi taşır; "yarısı dolu bir referans" üretmemek use-case'in
   * işidir (bkz. `ListAdminReportsUseCase`).
   */
  reviewedById: string | null;
  reviewedByDisplayName: string | null;
  reviewedAt: Date | null;
}

/** Denetim günlüğünün tek satırı (port tipi — `AdminReportRecord` ile AYNI gerekçe). */
export interface AdminAuditLogRecord {
  id: string;
  adminId: string;
  adminDisplayName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const ADMIN_REPOSITORY = Symbol('ADMIN_REPOSITORY');
