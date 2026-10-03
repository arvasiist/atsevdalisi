/**
 * Arkadaşlık + mesajlaşma görünümleri (proje sahibinin açık talebi,
 * 27.09.2026: "arkadaşlık + mesajlaşma").
 *
 * `grandstand.ts` ile AYNI ilke: bu tipler API yanıtının GERÇEK şeklidir;
 * sayfa/bileşen seviyesinde elle kopyalanmış arayüzler KULLANILMAZ.
 */

/** `friendships.status` — DB CHECK kısıtıyla (`migration 0033`) birebir aynı liste. */
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Sosyal ekranda gösterilen oyuncu özeti. `PlayerSummary`'nin TAMAMI
 * BİLİNÇLİ olarak taşınmaz: `money`/`gems` gibi alanlar başka bir oyuncu
 * için GİZLİDİR (bkz. AUDIT_REPORT.md Bulgu S4 — yalnızca kendi
 * bakiyenizi görebilirsiniz).
 */
export interface SocialPlayerView {
  playerId: string;
  /**
   * **NEDEN VAR (29.09.2026, `FINAL_PROJECT_AUDIT.md` §5 madde 3):** bu
   * alan olmadan başka bir oyuncunun profiline giden HİÇBİR yol yoktu —
   * `/profile/:username` ekranı yalnızca üst bardaki "kendi profilim"
   * bağlantısından açılabiliyordu, çünkü arkadaş listesi ve sıralama
   * tablosu yalnızca `displayName` taşıyordu. Görünen ad bir URL değildir
   * (boşluk/aksak karakter içerir); profil rotası `username` ister.
   *
   * **BU BİR GİZLİLİK DEĞİŞİKLİĞİ DEĞİLDİR:** `username` zaten
   * `GET /players/profile/:username` ucunun ADRESİDİR ve o uç `@Public()`
   * (token'sız erişilebilir, bkz. `PlayerProfileView` doc yorumu). Yani bu
   * alan gizli bir veriyi açığa çıkarmaz; yalnızca ZATEN açık olan bir
   * yolu tıklanabilir hâle getirir. `money`/`gems`in burada OLMAMASI
   * kuralı aynen sürer.
   *
   * **`SocialPlayerView`i GENİŞLETEN HER TİP OTOMATİK ALIR** (arkadaş,
   * istek, engel, hediye karşı tarafı) — bu bilinçlidir: aynı satır
   * bileşeni hepsinde kullanılır ve "bu listede profile gidilebiliyor, şu
   * listede gidilemiyor" tutarsızlığı doğmasın.
   */
  username: string;
  displayName: string;
  level: number;
}

/** Kabul edilmiş bir arkadaşlık. */
export interface FriendView extends SocialPlayerView {
  friendshipId: string;
  /** Arkadaşlığın KABUL edildiği an (`friendships.responded_at`). */
  friendsSince: string;
}

/**
 * Bekleyen bir arkadaşlık isteği.
 *
 * `direction` alanı, sunucunun `requested_by_id` alanından türettiği
 * yöndür: `incoming` = bana geldi (yanıtlayabilirim), `outgoing` = ben
 * gönderdim (yalnızca bekleyebilirim). İstemci iki listeyi bu alanla
 * ayırmak zorunda KALMAZ — sunucu zaten ayrı dizilerde döner — ama her
 * satırın kendi yönünü taşıması, tek bir listede gösterim için ve test
 * doğrulamaları için gereklidir.
 */
export interface FriendRequestView extends SocialPlayerView {
  requestId: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

/**
 * Sosyal ekranın TEK istekte dönen tüm verisi. Üç ayrı uç nokta yerine
 * tek bir "özet" uç noktası bilinçli bir tercihtir: ekran açıldığında
 * kullanıcı üçüne birden bakar, üç ayrı istek gereksiz gecikme ve kısmi
 * yükleme durumları üretirdi.
 */
export interface SocialOverviewView {
  friends: FriendView[];
  incomingRequests: FriendRequestView[];
  outgoingRequests: FriendRequestView[];
  /** Bana gelen, henüz OKUNMAMIŞ mesaj sayısı (`read_at IS NULL`). */
  unreadMessageCount: number;
}

/** Bir doğrudan mesaj. */
export interface DirectMessageView {
  messageId: string;
  senderId: string;
  recipientId: string;
  /**
   * Gönderenin görünen adı — sohbet ekranı bunu göstermek için ikinci bir
   * oyuncu isteği ATMAZ (bkz. `SocialPlayerView`'in "tüm alanlar taşınmaz"
   * notu: yalnızca görünen ad ve seviye paylaşılır).
   */
  senderDisplayName: string;
  body: string;
  createdAt: string;
  /** `null` = okunmadı. Zaman damgası (`direct_messages.read_at`) — boolean değil. */
  readAt: string | null;
}

/**
 * `DELETE /players/:id/friends/:friendId` sonucu.
 *
 * **NEDEN GÖVDE VAR (204 NO CONTENT DEĞİL):** istemcinin `request()`
 * yardımcısı (`apps/web/src/lib/api-client.ts`) HER yanıtta
 * `response.json()` çağırır; gövdesiz bir 204 burada "Unexpected end of
 * JSON input" ile patlardı. Gövdesiz yanıt bu kod tabanında BAŞKA HİÇBİR
 * uç noktada yoktur — yeni bir desen icat etmek yerine, silinen satırın
 * kimliği döner: istemci satırı listeden OPTİMİSTİK olarak çıkarabilir ve
 * "hangi satırı sildim" sorusunu cevaplayabilir.
 */
export interface RemoveFriendResult {
  friendId: string;
}

/** Arkadaşlık isteğini yanıtlamanın sonucu (`accept` veya `reject`). */
export interface RespondFriendRequestResult {
  friendshipId: string;
  status: FriendshipStatus;
  /** `accept` ise yeni arkadaş; `reject` ise isteği gönderen oyuncu. */
  player: SocialPlayerView;
}

/**
 * brief §24 "SOCIAL PROFILE" — `/profile/:username` ekranının gördüğü
 * GENEL (herkese açık) oyuncu profili.
 *
 * **`PlayerSummary`'den İKİ FARKI VARDIR, ikisi de bilinçlidir:**
 *   1. `money`/`gems` YOKTUR. Bu bir eksiklik değil, gizlilik kuralıdır
 *      (AUDIT_REPORT.md Bulgu S4 — bakiye yalnızca sahibine görünür;
 *      `SocialPlayerView`'in aynı gerekçesi). Profil herkese açık olduğu
 *      için burada unutulan bir alan doğrudan bir sızıntı olurdu; bu
 *      yüzden `PlayerSummary`'yi `Pick`/`Omit` ile TÜRETMEK yerine alanlar
 *      AÇIKÇA yazılır — yeni bir bakiye alanı `PlayerSummary`'ye eklenirse
 *      bu tip onu KENDİLİĞİNDEN almaz.
 *   2. `id` yerine `playerId` adı kullanılır — arkadaş listesi/mesaj
 *      satırlarıyla AYNI ad (`SocialPlayerView.playerId`), böylece istemci
 *      aynı oyuncuyu iki ekranda aynı alanla tanır.
 *
 * **`careerTier` NEDEN YOK:** brief §24 "Career Tier" ister, ama kademe
 * sunucuda saklanan bir alan DEĞİLDİR — `level`'in saf sunum türevi olarak
 * `apps/web/src/features/career/career-tier.ts`'te yaşar (o dosyanın doc
 * yorumu bunu ayrıntılı gerekçelendirir). Sunucunun aynı eşikleri ikinci
 * kez hesaplaması, iki kopyanın zamanla ayrışması demek olurdu.
 */
export interface PlayerProfileView {
  playerId: string;
  username: string;
  displayName: string;
  avatarId: string | null;
  /** 1-50 (brief §36). Kariyer kademesi istemcide BUNDAN türetilir. */
  level: number;
  xp: number;
  /** ISO tarih — profildeki "üyelik" bilgisi (`players.created_at`). */
  memberSince: string;
  /**
   * **`isSelf` NEDEN YOK:** uç nokta `@Public()`'tir ve global `AuthGuard`
   * herkese açık rotalarda token'ı HİÇ ayrıştırmaz (`auth.guard.ts` —
   * `isPublic` görünce hemen `true` döner), yani sunucunun "isteyen kim"
   * bilgisi burada YOKTUR. Bunu mümkün kılmak için guard'ı "herkese açık
   * rotada da token'ı dene ama hata fırlatma" davranışına çevirmek
   * gerekirdi; bu, kimlik doğrulamayla ilgili KÜRESEL bir guard'ı yalnızca
   * tek bir görünüm alanı için gevşetmek olurdu. İstemci kendi oturumundaki
   * oyuncu id'sini zaten taşır — `playerId` ile karşılaştırmak tek satırdır
   * ve yanlış olma ihtimali yoktur.
   */
  stats: PlayerProfileStats;
  /** Kabul edilmiş arkadaşlık sayısı (`friendships.status = 'accepted'`). */
  friendCount: number;
  /** Bu oyuncuya GÖNDERİLMİŞ hediye sayısı (`gift_sends.recipient_id`). */
  giftCount: number;
  /**
   * brief §24 "Achievements" — HENÜZ YOKTUR ve bu bilinçli bir karardır:
   * kalıcı bir başarım veri modeli + yeni migration gerektirir
   * (`career-tier.ts`'in achievement notuyla AYNI karar). Alan ŞİMDİDEN
   * vardır ki istemci "geldi mi gelmedi mi" diye tahmin yürütmesin; dizi
   * DOLDUĞUNDA bu sözleşme değişmez.
   */
  achievements: null;
}

/**
 * brief §33 BLOCK / REPORT (PHASE 15) — şikâyet kategorileri.
 *
 * `domain/social/moderation.ts` → `REPORT_CATEGORIES` ile ve
 * `player_reports.category` CHECK kısıtıyla (migration 0040) BİREBİR aynı
 * kümedir. Üçü ayrı yerlerde yaşadığı için uyuşmazlık sessiz olurdu;
 * bunu yakalayan şey `moderation.spec.ts`tir.
 *
 * **`other` NEDEN VAR:** kapalı bir liste, listeye girmeyen bir davranışı
 * (ör. ticaret dolandırıcılığı) BİLDİRİLEMEZ kılardı — moderasyonun en
 * çok ihtiyaç duyduğu şey ise tam olarak "beklenmeyen" durumları
 * duymaktır. Serbest metin `reason` alanı bunu tamamlar.
 */
export type ReportCategory = 'spam' | 'harassment' | 'cheating' | 'offensive_name' | 'other';

/**
 * Şikâyetin moderasyon durumu (brief §34 yönetim panelinin kuyruğu).
 * Bu dilimde YALNIZCA `open` yazılır; geçişler yönetim paneli diliminde
 * gelecektir — tip şimdiden tamdır ki istemci sözleşmeyi iki kez
 * öğrenmesin.
 */
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

/**
 * Engellenen oyuncu satırı. `SocialPlayerView`i GENİŞLETİR — engel
 * listesi de bir sosyal listedir ve arkadaş listesiyle AYNI alanları
 * taşır (`playerId`/`username`/`displayName`/`level`), böylece istemci
 * aynı satır bileşenini kullanır ve satırdaki ad yine
 * `/profile/:username`e bağlanabilir.
 */
export interface BlockedPlayerView extends SocialPlayerView {
  /** Engelin konduğu an (`player_blocks.created_at`) — ISO tarih. */
  blockedAt: string;
}

/**
 * `DELETE /players/:id/blocks/:blockedId` sonucu.
 *
 * **NEDEN GÖVDE VAR (204 DEĞİL):** `RemoveFriendResult` ile AYNI gerekçe —
 * istemcinin `request()` yardımcısı her yanıtta `response.json()` çağırır.
 */
export interface RemoveBlockResult {
  blockedId: string;
}

/** `POST /players/:id/reports` sonucu — şikâyetin sunucudaki hâli. */
export interface ReportPlayerResult {
  reportId: string;
  reportedId: string;
  category: ReportCategory;
  status: ReportStatus;
  createdAt: string;
}

/** `PlayerProfileView.stats` — yalnızca KOŞMUŞ (kesinleşmiş) yarışlar sayılır. */
export interface PlayerProfileStats {
  /** `races.status = 'finished'` olan yarışlardaki katılım sayısı. */
  raceCount: number;
  /** Bunlardan birinci bitirilenler (`finish_position = 1`). */
  winCount: number;
  /** Bunlardan ilk üçte bitirilenler (birinciler DAHİL, `finish_position <= 3`). */
  podiumCount: number;
}

/** 02.10.2026 (Faz 9) — kulüp sohbeti mesajı (yalnızca üyelere görünür). */
export interface ClubChatMessageView {
  id: string;
  playerId: string;
  username: string;
  displayName: string;
  body: string;
  createdAt: string;
}

/** 02.10.2026 (Faz 9) — tribün emote yayını (anonim: kimin attığı taşınmaz). */
export interface RaceEmoteEvent {
  raceId: string;
  key: string;
}
