import type {
  Currency,
  RaceStatus,
  RaceSurface,
  ReportCategory,
  ReportStatus,
} from '@at-sevdalisi/shared-types';

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

  /**
   * Oyuncu listesi — brief §34'ün "Users" VE "Wallet" başlıklarının
   * ortak karşılığı (cüzdan ayrı bir varlık değil, `players` kolonudur).
   *
   * **EN YENİ KAYIT ÖNCE GELİR.** Panelin ilk sorusu "son katılanlar
   * kimler"dir; alfabetik sıra, 100 satırlık bir tavanda yeni bir hesabı
   * listenin dışında bırakabilirdi.
   */
  listPlayerAccounts(limit: number): Promise<AdminPlayerAccountRecord[]>;

  /**
   * Yarış listesi — brief §34'ün "Races" başlığı. En yeniden eskiye.
   *
   * **`joinedPlayers` BURADA SAYILIR, use-case'te DEĞİL.** Sayımı
   * use-case'e bırakmak, her yarış için ayrı bir sorgu demek olurdu
   * (N+1 — `findBlockedPlayers` ile AYNI yasak).
   */
  listRaces(limit: number): Promise<AdminRaceRecord[]>;

  /**
   * Ekonomi defteri — brief §34'ün "Transactions" VE "Gifts"
   * başlıklarının ortak karşılığı (hediye ayrı bir defter değildir).
   * En yeniden eskiye.
   *
   * **SÜZGEÇ YOKTUR.** `type` serbest metindir (migration 0019 notu);
   * sunucuda bir `type` süzgeci, listede olmayan bir türü sessizce
   * "yok" gibi gösterirdi. Süzgeç istemcinin işidir.
   */
  listTransactions(limit: number): Promise<AdminTransactionRecord[]>;

  /**
   * Yarışı İPTAL EDER ve ödenmiş giriş ücretlerini İADE eder — brief §34
   * "Cancel" (28.09.2026).
   *
   * **BU PORTUN TEK YAZMA YOLUDUR VE BİR PARA YOLUDUR** (CLAUDE.md kural
   * 7): `SELECT ... FOR UPDATE` + aynı transaction'da `economy_transactions`
   * defter kaydı + `admin_audit_log` satırı. Üçü ayrılırsa ortaya çıkan
   * durum hiçbir yerde hata üretmez: iade edilmiş ama kaydı olmayan para,
   * ya da yazılmış ama geri alınmış bir denetim satırı.
   *
   * **KİLİT SIRASI: `races` → `race_entries` → `players`** —
   * `leaveLobbyRace`/`joinLobbyRace`/`setEntryReady` ile AYNIdır, yani bu
   * dört yol arasında çapraz kilitlenme (deadlock) oluşamaz.
   *
   * **`mutate` GERİ ÇAĞIRMASI NEDEN VAR:** durum kuralı
   * (`checkRaceCancelable`) kilit ALTINDA, okunan GERÇEK durum üzerinden
   * çalışmak zorundadır. Çağıran (use-case) kuralı önce kendi okuduğu bir
   * kopyaya uygulasaydı, "iptal edilebilir" cevabı ile UPDATE arasında
   * yarış koşabilir ve KOŞMUŞ bir yarıştan para iade edilirdi (TOCTOU —
   * `updateReportStatusWithLock` ile AYNI gerekçe). Kural fırlatırsa
   * transaction ROLLBACK olur: ne durum, ne iade, ne denetim kaydı yazılır.
   *
   * `null` döner ⇔ yarış YOKTUR (404). Yetki kapısı buraya girmeden
   * geçilmiş olmalıdır — yönetici olmayan bir çağırana "bu yarış var mı"
   * sorusunun cevabı verilmemelidir (bkz. `ReportNotFoundError` notu).
   */
  cancelRaceWithLock<T>(
    input: CancelAdminRaceInput,
    mutate: (race: { raceId: string; name: string; status: string }) => T,
  ): Promise<{ record: AdminRaceCancelRecord; result: T } | null>;
}

/**
 * `cancelRaceWithLock` girdisi.
 *
 * `adminId` DENETİM KAYDI İÇİNDİR, iade alanı değil: iade, yarışa
 * KATILMIŞ oyunculara gider; yönetici yalnızca işlemi yapandır.
 * (`updateReportStatusWithLock` ile AYNI ayrım — bkz. `reviewed_by` notu.)
 */
export interface CancelAdminRaceInput {
  raceId: string;
  adminId: string;
  now: Date;
}

/**
 * İptalin SONUCU — kaç oyuncuya ne kadar iade edildiği.
 *
 * **`refundedTotal` İADE EDİLENLERİN TOPLAMIDIR, HAVUZUN TAMAMI DEĞİL.**
 * Havuz `0`a çekilir ama iade, havuzdan değil DEFTERDEN hesaplanır: bota
 * düşen pay havuzda kalır (botların `player_id`'si yoktur — bkz.
 * `AdminRaceCancelResult` doc yorumu). Yani "havuz sıfırlandı" ile "şu
 * kadar iade edildi" iki AYRI sayıdır ve yöneticiye gösterilmesi gereken
 * ikincisidir.
 */
export interface AdminRaceCancelRecord {
  raceId: string;
  name: string;
  refundedPlayers: number;
  refundedTotal: number;
  cancelledAt: Date;
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

/**
 * Oyuncu listesinin tek satırı (port tipi — `AdminReportRecord` ile AYNI
 * gerekçe: tarih `Date`, ISO'ya çevirmek use-case'in işi).
 *
 * **`username` VE `displayName` İKİSİ DE TAŞINIR.** Görünen ad
 * BENZERSİZ DEĞİLDİR; yönetici "aynı addan iki hesap" durumunu ancak
 * giriş kimliğiyle ayırt edebilir. Yalnızca görünen adı göstermek,
 * şikâyet edilen bir hesabı YANLIŞ kişiyle eşleştirmeye açık kapı olurdu.
 */
export interface AdminPlayerAccountRecord {
  playerId: string;
  username: string;
  displayName: string;
  level: number;
  xp: number;
  money: number;
  gems: number;
  reputation: number;
  isAdmin: boolean;
  createdAt: Date;
}

/** Yarış listesinin tek satırı (port tipi — `AdminReportRecord` ile AYNI gerekçe). */
export interface AdminRaceRecord {
  raceId: string;
  name: string;
  status: RaceStatus;
  raceType: 'free' | 'paid';
  surface: RaceSurface;
  distanceM: number;
  entryFee: number;
  prizePool: number;
  tribuneFee: number;
  participantLimit: number;
  maxPlayers: number;
  joinedPlayers: number;
  startTime: Date;
  createdAt: Date;
  createdById: string | null;
  createdByDisplayName: string | null;
}

/** Defter satırı (port tipi — `AdminReportRecord` ile AYNI gerekçe). */
export interface AdminTransactionRecord {
  transactionId: string;
  playerId: string;
  playerDisplayName: string;
  type: string;
  amount: number;
  currency: Currency;
  referenceType: string | null;
  referenceId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Date;
}
