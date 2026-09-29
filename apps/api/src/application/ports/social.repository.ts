import type { FriendshipStatus, ReportCategory, ReportStatus } from '@at-sevdalisi/shared-types';

/**
 * `SocialRepository` — Arkadaşlık + mesajlaşma diliminin Application →
 * Infrastructure portu (proje sahibinin açık talebi, 27.09.2026).
 * Diğer port'larla AYNI desen (docs/ARCHITECTURE.md §4): HTTP/NestJS
 * bilmez, yalnızca "ne yapılabilir" sorusunu tanımlar.
 *
 * **BU PORT BİR PARA YOLU DEĞİLDİR.** Burada tek bir `players` satırı bile
 * güncellenmez; `wallet`/`economy_transactions` hiç geçmez. Hediye
 * gönderimi (para yolu) AYRI bir dilimdir ve `PlayerRepository.
 * updateTwoWithLock`'u kullanır (bkz. o portun doc yorumu) — buraya
 * karıştırmak, "kilitli satır + defter" disiplinini arkadaşlık
 * sorgularının arasına gömerdi.
 *
 * **`displayName`/`level` neden `players` JOIN'i ile geliyor:** istemcinin
 * her arkadaş satırı için ikinci bir `GET /players/:id` isteği atması N+1
 * olurdu. Yalnızca bu İKİ alan taşınır — `money`/`gems` GİZLİDİR
 * (bkz. `SocialPlayerView` doc yorumu ve AUDIT_REPORT.md Bulgu S4).
 */
export interface SocialRepository {
  /**
   * İki oyuncu arasındaki arkadaşlık satırı (kanonik çift üzerinden).
   * Sıralama `domain/social/friendship.ts` `canonicalPair` ile YAPILIR —
   * çağıran `lowId`/`highId` sırasını kendisi kurmak ZORUNDADIR, çünkü
   * `player_low_id < player_high_id` CHECK'i ters sırayı reddeder.
   * Yoksa `null`.
   */
  findPair(lowId: string, highId: string): Promise<FriendshipRow | null>;

  /** Id ile tek satır — "bu kayıt bana mı ait" kontrolü için. Yoksa `null`. */
  findById(friendshipId: string): Promise<FriendshipRow | null>;

  /**
   * Oyuncunun `status = 'accepted'` arkadaşlık sayısı — `friendsLimit`
   * kapısı için (bkz. `assertUnderSocialLimit`).
   */
  countFriends(playerId: string): Promise<number>;

  /**
   * Oyuncunun GÖNDERDİĞİ ve hâlâ `pending` olan istek sayısı —
   * `pendingRequestsLimit` kapısı için (spam savunması).
   */
  countOutgoingPending(playerId: string): Promise<number>;

  /**
   * Sosyal ekranın tüm verisi TEK turda: arkadaşlar, gelen istekler, giden
   * istekler ve okunmamış mesaj sayısı. Üç ayrı uç nokta yerine tek "özet"
   * uç noktası tercih edildi (bkz. `SocialOverviewView` doc yorumu).
   * Salt okunur — `withTransaction` GEREKMEZ (`findWatchableRaces` ile
   * AYNI gerekçe).
   */
  findOverview(input: SocialOverviewQuery): Promise<SocialOverviewFacts>;

  /**
   * Arkadaşlık isteğini YAZAR. İki durumu tek metotta birleştirir:
   *
   * 1. Bu çiftte satır YOKSA → yeni `pending` satır ekler.
   * 2. Satır `rejected` ise → mevcut satırı `pending`'e DÖNDÜRÜR ve
   *    `requested_by_id`'yi yeni gönderene çevirir (yeni satır AÇILMAZ —
   *    `friendships_unique_pair` UNIQUE kısıtı ikinci satıra izin vermez;
   *    bu yüzden "INSERT" ile "UPDATE" ayrımı çağıranın değil, bu metodun
   *    işidir).
   *
   * `pending`/`accepted` durumları buraya GELMEZ — çağıran
   * `assertFriendRequestAllowed` ile önce kapıyı kapatmıştır. Yine de
   * yarış durumuna (iki eşzamanlı istek) karşı son savunma hattı
   * veritabanındadır: `ON CONFLICT ... DO UPDATE ... WHERE status =
   * 'rejected'` koşulu sağlanmazsa HİÇBİR satır yazılmaz ve `RETURNING`
   * boş döner. Bu durumda metot `null` döner — çağıran bunu
   * `FriendshipAlreadyExistsError('pending')`e çevirir.
   *
   * **Karşı tarafın bekleyen isteği varsa otomatik `accept` YAPILMAZ:**
   * "karşılıklı istek = arkadaş oldular" bir ÜRÜN kararıdır ve iki tarafın
   * da açık onayını gerektirir. Bu dilimde BİLİNÇLİ olarak yoktur; ikinci
   * istek 409 döner (bkz. `SendFriendRequestUseCase` doc yorumu).
   */
  saveFriendRequest(input: SaveFriendRequestInput): Promise<FriendshipRow | null>;

  /**
   * GELEN bir isteği yanıtlar (`accept`/`reject`). Yalnızca satır
   * `pending` VE `requested_by_id` istek sahibi DEĞİLSE yazar (yani
   * yanıtlayan, isteği ALAN taraftır). Koşullar sağlanmıyorsa `null`
   * döner — çağıran `FriendshipNotFoundError`'a çevirir.
   *
   * `WHERE ... AND status = 'pending'` koşulu SQL'de TEKRARLANIR: iki
   * eşzamanlı `accept` isteğinden yalnızca biri satırı günceller
   * (`UPDATE ... RETURNING` boş dönerse `null`).
   */
  respondToRequest(input: RespondToRequestInput): Promise<FriendshipRow | null>;

  /**
   * Arkadaşlık satırını SİLER (kanonik çift üzerinden, iki yönlü).
   * Satır yoksa `false` döner.
   *
   * **Durum filtresi YOKTUR (bilinçli):** bu uç nokta hem "arkadaşlıktan
   * çıkar" hem "bekleyen isteğimi geri çek" anlamına gelir. Yalnızca
   * `accepted`'a izin verilseydi, yanlışlıkla gönderilen istekler
   * `pendingRequestsLimit`'e kadar birikip yeni istek göndermeyi
   * KİLİTLERDİ — tek çıkış yolu karşı tarafın yanıtlaması olurdu.
   *
   * **NEDEN DELETE (status = 'rejected' yazmak yerine):** arkadaşlıktan
   * çıkma gerçek bir silmedir; `rejected` ise "istek reddedildi" demektir
   * ve yeniden istek gönderilebilmesi için ayrı bir anlam taşır
   * (`assertFriendRequestAllowed`). İkisini karıştırmak, "arkadaşlıktan
   * çıktı" bir oyuncunun karşı tarafa YENİ İSTEK GÖNDEREMEMESİ gibi
   * anlamsız bir durum doğururdu. Mesaj geçmişi SİLİNMEZ (ayrı tablo,
   * bilinçli — bkz. migration 0033 notu).
   */
  removeFriendship(input: RemoveFriendshipInput): Promise<boolean>;

  /** İki oyuncu ARASINDA kabul edilmiş arkadaşlık var mı? Mesaj kapısı. */
  areFriends(lowId: string, highId: string): Promise<boolean>;

  /** Mesajı yazar. Gönderen/alıcı satırlarının varlığı FK ile garanti edilir. */
  saveMessage(input: SaveMessageInput): Promise<DirectMessageRow>;

  /**
   * İki oyuncu arasındaki yazışma (en YENİDEN eskiye), `limit` ile
   * sınırlı. Salt okunur.
   */
  findConversation(playerId: string, otherPlayerId: string, limit: number): Promise<DirectMessageRow[]>;

  /**
   * Bana gelen ve OKUNMAMIŞ mesajları okundu işaretler; kaç satırın
   * güncellendiğini döner. `readAt`, çağıranın verdiği andır (repository
   * `now()` ÇAĞIRMAZ — test edilebilirlik, bkz. `grandstand`'ın `nowMs`
   * disiplini).
   */
  markConversationRead(playerId: string, otherPlayerId: string, readAt: Date): Promise<number>;

  /** Oyuncunun aldığı son mesajlar (gönderen adıyla), en yeniden eskiye. Salt okunur. */
  findInbox(playerId: string, limit: number): Promise<DirectMessageRow[]>;

  /**
   * brief §33 BLOCK / REPORT (PHASE 15) — yönlü engel koyar.
   *
   * **İDEMPOTENTTİR:** aynı engeli iki kez koymak yeni bir satır üretmez
   * ve hata da vermez. NEDEN: engelleme bir DURUMdur, bir olay değil —
   * "zaten engelli" bir hata değil, istenen sonucun hâlihazırda geçerli
   * olmasıdır (`race_ready`in "zaten hazır" durumuna yaklaşımıyla AYNI).
   * İstemci çift tıklarsa 409 almak anlamsız olurdu.
   *
   * **DÖNEN TARİH "YÜRÜRLÜKTEKİ" TARİHTİR, `createdAt` DEĞİL:** ikinci
   * çağrıda var olan satırın `created_at`i korunur ve DÖNEN değer odur.
   * NEDEN ÖNEMLİ: yanıt (`BlockedPlayerView.blockedAt`) istemciye engelin
   * gerçekten ne zaman konduğunu söyler; çağıranın `new Date()`i ikinci
   * çağrıda yanlış olurdu. Bunu SQL `RETURNING` ile yapar — ayrı bir
   * `SELECT` turu gerekmez ve arada bir yarış durumu kalmaz.
   *
   * `createdAt` ÇAĞIRANDAN gelir — repository `now()` ÇAĞIRMAZ
   * (`markConversationRead` ile AYNI test edilebilirlik disiplini).
   */
  blockPlayer(blockerId: string, blockedId: string, createdAt: Date): Promise<Date>;

  /**
   * Engeli KALDIRIR (yalnızca verilen yönde). Satır yoksa `false` döner —
   * çağıran bunu `NotFound`a çevirir.
   *
   * **"Zaten yok" ile "kaldırıldı" AYRI ŞEYLERDİR** (blok koymanın
   * aksine): istemci listesinden bir satırı sildiğinde gerçekten bir
   * şeyin silindiğini bilmelidir, yoksa bayat bir listeyle çalıştığını
   * fark etmezdi (`removeFriendship` ile AYNI gerekçe).
   */
  unblockPlayer(blockerId: string, blockedId: string): Promise<boolean>;

  /**
   * Oyuncunun ENGELLEDİĞİ kişiler, en yeniden eskiye, `limit` ile
   * sınırlı. Salt okunur — `withTransaction` GEREKMEZ (`findInbox` ile
   * AYNI gerekçe).
   *
   * **YALNIZCA TEK YÖN listelenir** (`blocker_id = playerId`): kullanıcı
   * KENDİ koyduğu engelleri görür ve kaldırabilir. "Beni engelleyenler"
   * listesi bilinçli olarak YOKTUR — o liste engellemeyi bir sosyal
   * sinyale (ve misilleme aracına) çevirirdi.
   */
  findBlockedPlayers(blockerId: string, limit: number): Promise<BlockedPlayerRow[]>;

  /**
   * İki oyuncu arasında **HERHANGİ bir yönde** engel var mı? Yazma
   * yollarının (mesaj, hediye, yarış daveti, arkadaşlık isteği) tek
   * kapısıdır — bkz. `domain/social/moderation.ts` `assertNoBlock`.
   *
   * **İKİ YÖN TEK SORGUDA:** `blocker_id = a AND blocked_id = b` VEYA
   * `blocker_id = b AND blocked_id = a`. İki ayrı sorgu, iki tur
   * gecikme demekti ve arada bir yön değişebilirdi.
   */
  isBlockedBetween(aId: string, bId: string): Promise<boolean>;

  /**
   * Şikâyeti YAZAR (brief §33). Bir OLAY kaydıdır: engellemenin aksine
   * idempotent DEĞİLDİR ve geri alınmaz — aynı oyuncuyu iki kez şikâyet
   * etmek İKİ satır üretir (tekrarlayan şikâyet, moderasyon için
   * başlı başına bir sinyaldir; tekilleştirmek o sinyali yok ederdi).
   *
   * **BU BİR PARA YOLU DEĞİLDİR:** `players` satırı güncellenmez,
   * `economy_transactions` geçmez — bu yüzden `withTransaction` ve
   * `SELECT ... FOR UPDATE` GEREKMEZ (bu portun genel kuralı).
   */
  saveReport(input: SaveReportInput): Promise<ReportRow>;
}

/** `player_blocks` satırı + `players` JOIN'inden gelen görünen ad/seviye. */
export interface BlockedPlayerRow extends SocialPlayerFacts {
  /** `player_blocks.created_at` — engelin konduğu an. */
  blockedAt: Date;
}

/** `SocialRepository.saveReport` girdisi. */
export interface SaveReportInput {
  reporterId: string;
  reportedId: string;
  category: ReportCategory;
  /** `normalizeReportReason` çıktısı — `null` = gerekçe yazılmamış. */
  reason: string | null;
  /** Yeni satırın durumu — bu dilimde HER ZAMAN `'open'` (bkz. `ReportStatus`). */
  status: ReportStatus;
  createdAt: Date;
}

/** `player_reports` satırının Application katmanındaki karşılığı. */
export interface ReportRow {
  reportId: string;
  reporterId: string;
  reportedId: string;
  category: ReportCategory;
  reason: string | null;
  status: ReportStatus;
  createdAt: Date;
}

/** `friendships` satırının Application katmanındaki karşılığı (snake_case → camelCase). */
export interface FriendshipRow {
  id: string;
  playerLowId: string;
  playerHighId: string;
  requestedById: string;
  status: FriendshipStatus;
  createdAt: Date;
  respondedAt: Date | null;
}

/** `direct_messages` satırı + JOIN'den gelen gönderen adı. */
export interface DirectMessageRow {
  messageId: string;
  senderId: string;
  recipientId: string;
  senderDisplayName: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

/** Arkadaş/istek satırlarının ortak gövdesi — `players` JOIN'inden gelir. */
export interface SocialPlayerFacts {
  playerId: string;
  /** Profil rotasının adresi (`/profile/:username`) — gerekçe: `SocialPlayerView.username`. */
  username: string;
  displayName: string;
  level: number;
}

/** Kabul edilmiş arkadaşlık satırı. */
export interface FriendFacts extends SocialPlayerFacts {
  friendshipId: string;
  /** `friendships.responded_at` — kabul anı. */
  friendsSince: Date;
}

/** Bekleyen istek satırı. `direction` sunucuda `requested_by_id`'den TÜRETİLİR. */
export interface FriendRequestFacts extends SocialPlayerFacts {
  requestId: string;
  direction: 'incoming' | 'outgoing';
  createdAt: Date;
}

/** `SocialRepository.findOverview` sonucu — `SocialOverviewView`'in Date'li hâli. */
export interface SocialOverviewFacts {
  friends: FriendFacts[];
  incomingRequests: FriendRequestFacts[];
  outgoingRequests: FriendRequestFacts[];
  unreadMessageCount: number;
}

/** `SocialRepository.findOverview` girdisi — limitler `config/social.config.json`'dan gelir. */
export interface SocialOverviewQuery {
  playerId: string;
  /** `overviewFriendsLimit` — dönen arkadaş satırı sayısı (üyelik tavanı DEĞİL). */
  friendsLimit: number;
  /** `overviewRequestsLimit` — gelen ve giden listelerin HER BİRİ için satır sınırı. */
  requestsLimit: number;
}

/** `SocialRepository.saveFriendRequest` girdisi. */
export interface SaveFriendRequestInput {
  lowId: string;
  highId: string;
  /** İsteği BAŞLATAN — `friendships.requested_by_id`. */
  requesterId: string;
  /** Satır `rejected` ise yeniden `pending` yapılırken `responded_at` temizlenir. */
}

/** `SocialRepository.respondToRequest` girdisi. */
export interface RespondToRequestInput {
  friendshipId: string;
  /** Yanıtlayan — satırın `requested_by_id`'si BU OLMAMALIDIR. */
  responderId: string;
  status: Extract<FriendshipStatus, 'accepted' | 'rejected'>;
  respondedAt: Date;
}

/**
 * `SocialRepository.removeFriendship` girdisi — KANONİK sıra (çağıran
 * `canonicalPair` uygulamış olmalıdır).
 */
export interface RemoveFriendshipInput {
  lowId: string;
  highId: string;
}

/** `SocialRepository.saveMessage` girdisi. */
export interface SaveMessageInput {
  senderId: string;
  recipientId: string;
  /** `normalizeMessageBody` ile kırpılmış/doğrulanmış gövde. */
  body: string;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const SOCIAL_REPOSITORY = Symbol('SOCIAL_REPOSITORY');
