import type { NotificationPayloadByType, RaceInviteStatus } from '@at-sevdalisi/shared-types';

/**
 * `RaceInviteRepository` — yarış daveti diliminin Application →
 * Infrastructure portu (brief §16 RACE INVITE, §42 PHASE 11).
 *
 * **BU PORT BİR PARA YOLU DEĞİLDİR.** Hiçbir `players` satırı güncellenmez,
 * `wallet`/`economy_transactions` hiç geçmez — davet bir bildirimdir,
 * ödül değildir. Daveti KABUL etmek de yarışa KATILMAK değildir (bkz.
 * `RespondRaceInviteResult` doc yorumu): katılım giriş ücreti ödeyen AYRI
 * bir işlemdir ve tek yol (`JoinRaceUseCase`) olarak kalır (CLAUDE.md
 * kural 7 — para/mutasyon yolu tek yerden geçer).
 *
 * **NEDEN `saveInvite` BİLDİRİMİ DE YAZAR (iki tablo, tek transaction):**
 * brief §16'nın istediği şey "davet gönder" değil, "davet BİLDİRİMİ gelsin
 * "dir. Davet satırı ile bildirim satırı iki AYRI transaction'da yazılsaydı,
 * ikincisi düşerse ortada görünmez bir davet kalırdı: davet edilen kişi onu
 * hiç öğrenemezdi ve `race_invites_race_invitee_uq` tekil indeksi yüzünden
 * AYNI yarışa İKİNCİ kez de davet edilemezdi — yani kalıcı olarak
 * ulaşılamaz bir satır. Bu yüzden ikisi tek `withTransaction` içindedir
 * (`SELECT ... FOR UPDATE` + defter deseninin bu dilimdeki karşılığı:
 * birlikte yazılması gereken iki satır, tek atomik işlem).
 *
 * Buna karşılık `NotificationRepository` yalnızca OKUR ve okundu işaretler;
 * bildirim YAZMA yetkisi bu portta kalır — böylece "bildirimi kim üretir"
 * sorusunun tek cevabı olur ve gelecekteki üreticiler (PHASE 13) aynı
 * atomiklik kuralına uymak zorunda kalır.
 */
export interface RaceInviteRepository {
  /**
   * Davet gönderilecek yarışın davet edilebilirlik bilgisi. Yoksa `null`.
   *
   * **NEDEN `RaceRepository`E EKLENMEDİ:** `domain/social/` `domain/race/`i
   * import etmez (kardeş domainler, katman yönü tek yönlü) ve `RaceRepository`
   * zaten lobi/katılım yollarının portudur. Davetin ihtiyacı olan ÜÇ alan
   * (durum, başlangıç zamanı, ad) buraya özgüdür ve burada okunur; lobi
   * portuna eklemek, onu kullanmayan çağıranlara da bir metot eklerdi.
   */
  findRaceForInvite(raceId: string): Promise<InvitableRaceFacts | null>;

  /**
   * Davet EDEN'in hâlâ `pending` olan davet sayısı — `pendingInvitesLimit`
   * kapısı için (spam savunması, `countOutgoingPending` ile AYNI gerekçe).
   */
  countOutgoingPending(inviterId: string): Promise<number>;

  /**
   * Daveti VE ona bağlı bildirimi TEK transaction'da yazar.
   *
   * `ON CONFLICT (race_id, invitee_id) DO NOTHING` kullanılır: iki
   * eşzamanlı davetten yalnızca biri satır yazar, diğeri `null` döner ve
   * çağıran bunu `RaceInviteAlreadyExistsError`a çevirir. Bildirim de
   * YALNIZCA davet satırı gerçekten yazıldığında eklenir — aksi hâlde
   * reddedilen ikinci istek, karşı tarafa İKİNCİ bir bildirim bırakırdı
   * (tam olarak engellemek istediğimiz spam).
   */
  saveInvite(input: SaveRaceInviteInput): Promise<RaceInviteRow | null>;

  /** Id ile tek satır — "bu davet bana mı ait" kontrolü için. Yoksa `null`. */
  findById(inviteId: string): Promise<RaceInviteRow | null>;

  /**
   * `pending` bir daveti yanıtlar. Yalnızca satır `pending` VE yanıtlayan
   * DAVET EDİLEN ise yazar; koşullar sağlanmıyorsa `null` döner — çağıran
   * `RaceInviteNotRespondableError`/`RaceInviteNotFoundError`a çevirir.
   *
   * `WHERE ... AND status = 'pending'` koşulu SQL'de TEKRARLANIR: iki
   * eşzamanlı `accept` isteğinden yalnızca biri satırı günceller
   * (`respondToRequest` ile AYNI desen).
   *
   * **`accepted` DURUMUNDA DAVET EDENE BİLDİRİM YAZILMAZ:** brief §28'in
   * sekiz türü arasında "davetim kabul edildi" diye bir tür YOKTUR ve
   * uydurmak CHECK kısıtını (migration 0039) ihlal ederdi. Davet eden,
   * sonucu WebSocket'ten (`race.invite.accepted`) öğrenir — bu bilgi
   * KALICI olmak zorunda değildir, davet eden zaten daveti kendi
   * göndermiştir ve ekranındadır.
   */
  respond(input: RespondRaceInviteInput): Promise<RaceInviteRow | null>;
}

/** `race_invites` satırının Application katmanındaki karşılığı. */
export interface RaceInviteRow {
  id: string;
  raceId: string;
  raceName: string;
  inviterId: string;
  inviterDisplayName: string;
  inviteeId: string;
  status: RaceInviteStatus;
  createdAt: Date;
  respondedAt: Date | null;
}

/** Davet edilebilirlik kararı için gereken ASGARİ yarış bilgisi. */
export interface InvitableRaceFacts {
  raceId: string;
  raceName: string;
  status: string;
  startTime: Date;
}

/** `RaceInviteRepository.saveInvite` girdisi. */
export interface SaveRaceInviteInput {
  /**
   * Davetin kimliği — ÇAĞIRAN tarafından üretilir (`randomUUID()`).
   *
   * **NEDEN VERİTABANINDA ÜRETİLMİYOR (`gen_random_uuid()`):** kimlik,
   * aynı transaction'da yazılan bildirimin `payload.inviteId` alanına
   * GİRER. Veritabanında üretilseydi, payload INSERT anında henüz
   * bilinmeyen bir değeri taşımak zorunda kalırdı — ya boş yazılır ya da
   * satır ikinci bir `UPDATE` ile düzeltilirdi. `create-race.use-case.ts`in
   * `raceId`yi `randomUUID()` ile üretmesiyle AYNI desen; `id` sütununun
   * `DEFAULT gen_random_uuid()`ı yalnızca bu değeri hiç verilmeyen
   * çağrılar için bir yedek olarak kalır.
   */
  inviteId: string;
  raceId: string;
  inviterId: string;
  inviteeId: string;
  /**
   * Yazılacak bildirimin `payload`ı — çağıran (use-case) tarafından
   * `NotificationPayloadByType['race_invite']` şeklinde kurulur. Repository
   * payload'ı YORUMLAMAZ, olduğu gibi JSONB'ye yazar; şekil sözleşmesi
   * tiptedir (`saveMessage`in gövdeyi yorumlamaması ile AYNI sınır).
   */
  notificationPayload: NotificationPayloadByType['race_invite'];
}

/** `RaceInviteRepository.respond` girdisi. */
export interface RespondRaceInviteInput {
  inviteId: string;
  /** Yanıtlayan — satırın `invitee_id`'si BU OLMALIDIR. */
  inviteeId: string;
  status: Extract<RaceInviteStatus, 'accepted' | 'declined'>;
  respondedAt: Date;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const RACE_INVITE_REPOSITORY = Symbol('RACE_INVITE_REPOSITORY');
