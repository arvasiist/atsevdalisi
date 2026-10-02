import type {
  InteractiveRaceView,
  PlayerControlInput,
  AccountCredentialsView,
  AccountProvider,
  AdminAuditLogResult,
  AdminPlayerListResult,
  AdminRaceCancelResult,
  AdminRaceListResult,
  AdminReportListResult,
  AdminTransactionListResult,
  AuthProvidersView,
  AuthSession,
  BlockedPlayerView,
  BreedingResultView,
  BuyFeedResult,
  CareActionType,
  ClaimDailyRewardResult,
  DirectMessageView,
  EquipmentType,
  FacilityType,
  FacilityUpgradeResult,
  FarmSummaryView,
  FeedHorseResult,
  FeedInventoryView,
  FeedStatusView,
  FeedType,
  FinalStretchPlan,
  FriendRequestView,
  GiftView,
  HireJockeyResultView,
  HorseEquipment,
  HorseMarketValueView,
  MarketListing,
  PlaceBidResult,
  HorsePedigreeView,
  Jockey,
  JoinMatchmakingQueueResult,
  LeaderboardRowView,
  MarkAllNotificationsReadResult,
  MatchmakingTicket,
  NotificationListResult,
  NotificationView,
  PerformCareActionResult,
  PlayerJockeyView,
  PlayerProfileView,
  PlayerSummary,
  PracticeRaceResult,
  PublicHorse,
  RacingStyle,
  RaceInviteView,
  RaceLobbyListItem,
  RaceLobbyView,
  RaceSurface,
  RaceWeather,
  RaceTicketPurchaseResult,
  RaceTicketRefundResult,
  RaceTicketView,
  RaceTimelineView,
  RecentRaceResultView,
  ReleaseJockeyResultView,
  RemoveBlockResult,
  RemoveFriendResult,
  ReportCategory,
  ReportPlayerResult,
  ReportStatus,
  RespondFriendRequestResult,
  RespondRaceInviteResult,
  RiskLevel,
  SendGiftResult,
  SocialOverviewView,
  StableSummaryView,
  StableUpgradeResult,
  StartApproach,
  TrainHorseResult,
  TrainingIntensity,
  UpdateReportStatusResult,
  TrainingSession,
  TrainingType,
  WalletDepositResult,
  WalletView,
  WatchableRaceView,
  ClubDetailView,
  ClubRole,
  ClubSummaryView,
  SeasonView,
  StaffHireResult,
  StaffOverview,
  StaffView,
} from '@at-sevdalisi/shared-types';

/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — `export` edildi çünkü
 * `live-race-socket.ts`'in soket bağlantısı için bu AYNI backend origin'e
 * ihtiyacı var (REST `/api/v1` önekinden ARINDIRILMIŞ hali için bkz. o
 * dosyadaki `deriveSocketOrigin`). Daha önce bu modül-içi bir sabitti,
 * yalnızca bu dosyanın kendi `request()` fonksiyonu tarafından kullanılıyordu.
 *
 * DÜZELTME (27.09.2026) — varsayılan port 3000'den 4000'e çekildi. API
 * `PORT ?? 4000` portunda dinler (bkz. `apps/api/src/main.ts`); 3000 ise
 * Next.js'in KENDİ portudur. Yani değişken tanımlı değilken bu sabit
 * uygulamayı Next.js sunucusuna işaret ediyordu ve TÜM API çağrıları
 * başarısız oluyordu. Değişken adı (`NEXT_PUBLIC_API_URL`) DOĞRUYDU —
 * yanlış olan yalnızca bu yedek değerdi; `apps/web/.env.example`'ın
 * bildirdiği ad ise yanlıştı ve o da aynı turda düzeltildi.
 */
/**
 * `POST /races` gövdesi (30.09.2026). Alanların geçerli değerleri
 * `config/race-lobby.config.json`dan gelir ve sunucu `validateRaceCreation`
 * ile BAĞIMSIZ doğrular — istemcinin seçenek listeleri yalnızca kolaylıktır.
 */
export interface CreateLobbyRaceBody {
  name: string;
  fieldSize: number;
  maxPlayers: number;
  entryFee: number;
  raceType: 'free' | 'paid';
  startTime: string;
  surface: RaceSurface;
  weather: RaceWeather;
  distanceMeters: number;
  tribuneFee: number;
  spectatorCapacity: number;
  playerControl?: boolean;
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * AUDIT_REPORT.md Bulgu S1-S4 hardening sonrası eklendi (bkz. `player.ts`
 * `AuthSession` doc yorumu) — backend artık `@Public()` işaretli olmayan
 * HER rotada geçerli bir `Authorization: Bearer <token>` header'ı bekliyor
 * (`apps/api/src/api/auth/auth.guard.ts`, global `AuthGuard`). Token,
 * yalnızca bu modülün içinde bellekte tutulur (React state/render
 * döngüsüne KARIŞTIRILMAZ — `player-context.tsx` kalıcılığı
 * `localStorage`'da sağlar ve sayfa yüklendiğinde `setAuthToken` ile
 * burayı doldurur). Token yoksa header hiç eklenmez; `@Public()` rotalar
 * (kayıt, market listeleme gibi) zaten bunsuz da çalışır, korumalı
 * rotalar ise backend'den doğru şekilde 401 alır.
 */
let currentAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  currentAuthToken = token;
}

/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — `live-race-socket.ts`'in
 * WebSocket el sıkışması (`auth: { token }`, `race.gateway.ts`'in HTTP
 * `AuthGuard`'ıyla AYNI JWT'yi bekler) için AYNI oturum token'ına ihtiyacı
 * var. Yeni bir token DEPOSU İCAT EDİLMEDİ — bu modülün ZATEN tuttuğu
 * `currentAuthToken`'ın salt-okunur bir getter'ı.
 */
export function getAuthToken(): string | null {
  return currentAuthToken;
}

/**
 * API hata zarfının `code` alanını TAŞIYAN hata (28.09.2026 — yönetim paneli
 * dilimi).
 *
 * **NEDEN GEREKLİ:** sunucu hata zarfı `{ code, message }` çiftidir
 * (`apps/api/src/api/filters/*`), ama buradaki `request()` bugüne kadar
 * yalnızca `message`ı atıp `code`u ÇÖPE ATIYORDU. `message` İNSAN içindir ve
 * değişebilir; `code` ise MAKİNE içindir ve sözleşmedir. Bir ekranın
 * "yetkiniz yok" ile "sunucu patladı"yı ayırt etmesi gerektiğinde tek
 * güvenilir ölçüt `code`dur — metinle eşleştirme yapmak (örn.
 * `message.includes('yetki')`) sunucudaki bir yazım düzeltmesiyle sessizce
 * bozulur ve ekran, yetkisiz oyuncuya "tekrar dene" der.
 *
 * **`code` NULL OLABİLİR** ve bu dürüsttür: gövdesi JSON olmayan ya da
 * zarf taşımayan bir yanıtta (ağ hatası, proxy 502'si) sunucu kodu YOKTUR.
 * Uydurma bir kod üretmek, çağıranı "sunucu böyle dedi" sanısına düşürürdü.
 *
 * **`status` AYRI TUTULUR:** HTTP durumu ile zarfın `code`u aynı şey
 * DEĞİLDİR (403 dönen her yanıt `ADMIN_REQUIRED` değildir).
 */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, code: string | null, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (currentAuthToken) {
    headers.set('Authorization', `Bearer ${currentAuthToken}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  const result: ApiResponse<T> = await response.json();

  if (!response.ok || !result.success) {
    const message = result.error?.message || `API Hatası: ${response.status}`;
    // `ApiError` HÂLÂ bir `Error`dır — `instanceof Error` ile yakalayan
    // mevcut çağıranların hiçbiri bozulmaz; `code` yalnızca isteyene verilir.
    throw new ApiError(message, result.error?.code ?? null, response.status);
  }

  return result.data;
}

export const apiClient = {
  // Oyuncu İşlemleri — dönüş tipleri gerçek backend zarfıyla (docs/API.md §3)
  // birebir eşleşen `@at-sevdalisi/shared-types`'tan gelir; sayfa/bileşen
  // seviyesinde elle kopyalanmış (ve gerçek şekilden sapabilen) arayüzler
  // KULLANILMAZ (Faz 1'in `mockProps:any` dersi burada da geçerli).
  /**
   * S1 hardening sonrası `POST /players` artık çıplak `PlayerSummary`
   * değil, bir `AuthSession` (`{ token, player }`) döner (bkz.
   * `player.controller.ts` doc yorumu) — çağıran (`player-context.tsx`)
   * `token`'ı `setAuthToken` ile hemen etkinleştirmeli, aksi halde kayıt
   * sonrası ilk korumalı istek (ör. `getHorsesByOwner`) 401 alır.
   */
  registerPlayer: (username: string, displayName: string) =>
    request<AuthSession>('/players', {
      method: 'POST',
      body: JSON.stringify({ username, displayName }),
    }),

  getPlayer: (playerId: string) => request<PlayerSummary>(`/players/${playerId}`),

  /**
   * E-POSTA + ŞİFRE GİRİŞİ (30.09.2026, migration 0046) — token'SIZ çağrılır
   * (yeni cihaz / silinmiş tarayıcı verisi). Yanlış şifre ile kayıtlı
   * olmayan e-posta AYNI 401 `INVALID_CREDENTIALS`tir.
   */
  loginWithPassword: (email: string, password: string) =>
    request<AuthSession>('/auth/login/password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /** "Hesabını kaydet" — oturumdaki MİSAFİR oyuncuya e-posta + şifre bağlar (oyuncu token'dan gelir). */
  saveAccount: (email: string, password: string) =>
    request<{ email: string }>('/auth/credentials', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /**
   * Oyuncunun giriş bilgisi durumu — `email === null` VE `linkedProviders`
   * boşsa misafir hesaptır.
   */
  getAccountCredentials: () => request<AccountCredentialsView>('/auth/credentials'),

  /**
   * Hangi dış girişler yapılandırılmış (01.10.2026) — token'SIZ.
   * `googleClientId === null` ise Google düğmesi gösterilmez.
   */
  getAuthProviders: () => request<AuthProvidersView>('/auth/providers'),

  /**
   * GOOGLE İLE GİRİŞ — token'SIZ. `idToken`, Google'ın tarayıcıda verdiği
   * kimlik belgesidir; sunucu imzasını doğrular. İlk girişte yeni oyuncu
   * açılır, bağlı hesapta aynı oyuncuya dönülür.
   */
  loginWithGoogle: (idToken: string) =>
    request<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken }),
    }),

  /** "Google hesabını bağla" — oturumdaki oyuncuya Google kimliği bağlar (oyuncu token'dan gelir). */
  linkGoogle: (idToken: string) =>
    request<{ provider: AccountProvider }>('/auth/link', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken }),
    }),

  /**
   * ŞİFRE SIFIRLAMA İSTEĞİ (30.09.2026, migration 0047) — token'SIZ. Yanıt
   * e-posta kayıtlı olsun olmasın AYNIDIR (enumerasyon yok).
   */
  requestPasswordReset: (email: string) =>
    request<{ accepted: true }>('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /** Şifre sıfırlama onayı — e-postadaki bağlantının `token`ı + yeni şifre. */
  confirmPasswordReset: (token: string, password: string) =>
    request<{ reset: true }>('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  /**
   * brief §24 SOSYAL PROFİL — `/profile/:username` ekranı (28.09.2026).
   *
   * **İKİ FARKI VAR, ikisi de bilinçli:**
   *   1. **`@Public()`** — bu uç nokta token GEREKTİRMEZ. Yukarıdaki
   *      `getPlayer` (`GET /players/:id`) `assertSelf` ile KORUNUR ve
   *      yalnızca kişinin KENDİ özetini döner; bu ise başkasının profilini
   *      görüntülemek içindir ve `money`/`gems` TAŞIMAZ
   *      (`PlayerProfileView` doc yorumu, AUDIT Bulgu S4). Token yine de
   *      gönderilir (zararsızdır) çünkü `request()` token varsa ekler.
   *   2. **`playerId` değil `username`** — yol parametresi bir UUID DEĞİL,
   *      kullanıcı adıdır; şekil doğrulaması sunucuda `validateUsername` ile
   *      yapılır (domain), burada YAPILMAZ.
   *
   * **`encodeURIComponent` ŞART:** kullanıcı adı URL yoluna gömülür ve
   * geçerli bir kullanıcı adı `%`/`/`/boşluk gibi karakterler içerebilir —
   * ham birleştirme, farklı bir rotaya istek atardı (ör. `a/b` → iki
   * segment). Sunucu tarafında `@Param('username')` zaten ÇÖZÜLMÜŞ değeri
   * alır.
   */
  getPlayerProfile: (username: string) =>
    request<PlayerProfileView>(`/players/profile/${encodeURIComponent(username)}`),

  // At & Ahır İşlemleri
  getHorsesByOwner: (ownerId: string) => request<PublicHorse[]>(`/horses?ownerId=${ownerId}`),

  getHorseDetails: (horseId: string) => request<PublicHorse>(`/horses/${horseId}`),

  /**
   * `docs/AUDIT_REPORT.md`'nin "§25 Stable görsel yönetim ekranı" bulgusunun
   * "piyasa değeri tahmini ... ayrı dilim" notunu kapatan uç nokta (bu
   * turda EKLENDİ) — `GetHorseMarketValueUseCase`, brief §30'dan beri VAR
   * olan ama HİÇBİR yerden çağrılmayan `calculateMarketValue`'yu artık
   * gerçekten kullanır. `@Public()` — `getHorseDetails` ile AYNI gerekçe.
   */
  getHorseMarketValue: (horseId: string) =>
    request<HorseMarketValueView>(`/horses/${horseId}/market-value`),

  /**
   * Soy ağacı (`GET /horses/:id/pedigree`, bu dilimde EKLENDİ) —
   * `PedigreeTree.tsx`'in veri kaynağı. `@Public()` (yukarıdaki
   * `getHorseMarketValue` ile AYNI gerekçe: başka bir oyuncunun atına
   * Pazar akışından bakılabilir).
   *
   * `pedigree` HER ZAMAN doludur — soy kaydı olmayan bir at için tüm
   * ataları `null` olan bir ağaç döner (404 DEĞİL), bkz. `HorsePedigreeView`.
   */
  getHorsePedigree: (horseId: string) => request<HorsePedigreeView>(`/horses/${horseId}/pedigree`),

  /**
   * Çiftleştirme — `POST /players/:id/breeding` (brief §18). Soy ağacı veri
   * zincirinin **YAZMA** yarısıdır (`getHorsePedigree` okuma yarısı).
   *
   * **BİR PARA YOLUDUR ve `Idempotency-Key` ZORUNLUDUR** (`depositFunds`/
   * `upgradeStable` ile AYNI sınıf): aygır BAŞKA bir oyuncunun ise damızlık
   * ücreti kısrak sahibinden aygır sahibine transfer edilir ve aynı
   * transaction'da İKİ defter satırı (`breeding_stud_fee_debit`/`_credit`)
   * yazılır. Aynı sahip kendi atlarını çiftleştirirse ücret 0'dır ve hiçbir
   * para hareketi olmaz — bu bir SUNUCU kararıdır; istemci ücreti ne
   * hesaplar ne tahmin eder, yalnızca yanıttaki `fee` alanını gösterir.
   *
   * **Anahtar BAŞARISIZLIKTA YAŞAMALIDIR** (`depositFunds` ile AYNI desen,
   * `grandstand`'ın "her basışta yeni anahtar" kararından BİLEREK AYRILIR):
   * burada zarar "ikinci bir TAY"dır — geri alınamayan bir envanter + soy
   * kaydı. Sunucu hata durumunda `pending` rezervasyonu SİLER
   * (`idempotency.interceptor.ts` → `tap({ error })`), yani anahtarı korumak
   * bayat bir hatayı tekrarlamaz; ilk istek gerçekten başarılı olup yanıt
   * ağda kaybolduysa tekrar AYNI anahtarla gider ve sunucu SAKLANAN yanıtı
   * döner — ikinci bir tay doğmaz.
   *
   * Gövde YALNIZCA `{ mareId, stallionId, foalName }` taşır: sahiplik ve
   * uygunluk (yaş/cinsiyet/cooldown/pazar ilanı/akrabalık) SUNUCUDA, KİLİTLİ
   * satırlardan doğrulanır; tayın statları `pairId` seed'iyle sunucuda
   * üretilir. İstemci hiçbir sayı GÖNDERMEZ.
   */
  breedHorses: (
    playerId: string,
    mareId: string,
    stallionId: string,
    foalName: string,
    idempotencyKey: string,
  ) =>
    request<BreedingResultView>(`/players/${playerId}/breeding`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ mareId, stallionId, foalName }),
    }),

  /**
   * DÜZELTME (Faz 2, görsel kalite planı) — önceden `GET /stable/summary
   * ?ownerId=` çağırıyordu, ki bu rota HİÇ VAR OLMADI (gerçek backend
   * rotası `GET /players/:id/stable-summary`, bkz. `stable.controller.ts`)
   * — bu çağrı her zaman 404 ile patlıyordu, hiçbir sayfa bunu
   * TÜKETMEDİĞİ için fark edilmemişti. Artık gerçek rotayı ve gerçek
   * `StableSummaryView` şeklini kullanıyor.
   */
  getStableSummary: (ownerId: string) =>
    request<StableSummaryView>(`/players/${ownerId}/stable-summary`),

  /**
   * Kiralamaya AÇIK jokey vitrini — `GET /jockeys` (brief §13, PHASE 6.2;
   * istemci tüketicisi 29.09.2026, FINAL_PROJECT_AUDIT #18).
   *
   * **Uç, 29.09.2026'ya kadar İSTEMCİSİZDİ:** jokey kiralanabiliyor ve
   * motora giriyordu (`jockeySkillComposite`) ama oyuncu ne jokeyini
   * görebiliyor ne de seçebiliyordu. `JockeyAlreadyHiredError`ın mesajı
   * "Önce onu bırakmalısın" diyordu ve bırakmanın da yolu yoktu.
   *
   * Sıralama SUNUCUDAN gelir (`salary` artan) — istemci yeniden sıralamaz,
   * yoksa iki sıralama kuralı doğardı.
   */
  getJockeys: () => request<Jockey[]>('/jockeys'),

  /**
   * Oyuncunun kiralı jokeyi — `GET /players/:id/jockey`.
   *
   * **`null` BİR HATA DEĞİLDİR** (404 değil): jokeyi olmayan oyuncu nötr 50
   * ile koşar ve ekran bu ayrımla "jokeyin yok, kirala" hâlini kurar.
   *
   * `composite` SUNUCUDAN gelir — altı beceriyi config ağırlıklarıyla
   * çarpmak formülün ikinci bir kopyasını doğururdu ve config değişince
   * gösterilen sayı ile motora giren sayı sessizce ayrışırdı.
   */
  getPlayerJockey: (playerId: string) =>
    request<PlayerJockeyView | null>(`/players/${playerId}/jockey`),

  /**
   * Jokey kiralar — `POST /jockeys/:jockeyId/hire` (PARA YOLU).
   *
   * **`Idempotency-Key` GÖNDERİLMEZ ve bu bilinçlidir.** Sunucu bu başlığı
   * BİLEREK okumaz: çift kiralamayı engelleyen şey anahtar değil DURUM
   * GEÇİŞİDİR (ikinci çağrı 409 `JOCKEY_ALREADY_OWNED` / `_HIRED` alır).
   * Anahtar gönderip yok sayılmak, istemciye "korunuyorum" hissi verirdi.
   *
   * Ödeyen taraf GÖVDEDEN GELMEZ: kimlik token'dan çözülür. Gövde yoktur.
   */
  hireJockey: (jockeyId: string) =>
    request<HireJockeyResultView>(`/jockeys/${jockeyId}/hire`, { method: 'POST' }),

  /**
   * Jokeyi serbest bırakır — `POST /jockeys/:jockeyId/release`
   * (29.09.2026, FINAL_PROJECT_AUDIT #18).
   *
   * **PARA YOLU DEĞİLDİR: İADE YOKTUR.** Kiralama bedeli bir kiralama
   * ücretidir, depozito değil — bu yüzden yanıt `balanceAfter` taşımaz ve
   * ekran üst bardaki bakiyeyi güncellemek zorunda değildir. İade
   * edilseydi `kirala → bırak` döngüsü jokey kiralamayı BEDAVA yapardı.
   *
   * `hire` gibi bu da anahtar ALMAZ: çift bırakmayı `owner_id`ın zaten
   * `NULL` olması engeller (409 `JOCKEY_NOT_OWNED`).
   */
  releaseJockey: (jockeyId: string) =>
    request<ReleaseJockeyResultView>(`/jockeys/${jockeyId}/release`, { method: 'POST' }),

  /**
   * Ahırı bir sonraki seviyeye yükseltir (brief §32). Bu uç nokta
   * `apps/api` tarafında FAZ 1'den beri VARDI ve e2e testleriyle
   * korunuyordu, ama bu istemcide KARŞILIĞI YOKTU — yani oyuncunun parayı
   * harcayıp ilerleyebileceği ana yol arayüzden ULAŞILAMAZ durumdaydı.
   *
   * PARA değiştirdiği için (bakiyeden düşer, `economy_transactions`'a
   * defter kaydı yazar) `Idempotency-Key` header'ı ZORUNLUDUR —
   * `buyMarketListing`/`runPracticeRace` ile AYNI desen (bkz.
   * `stable.controller.ts` doc yorumu ve docs/SECURITY.md §4). Çağıran
   * taraf her YENİ deneme için taze bir anahtar üretmelidir; aynı anahtarın
   * tekrarı bilinçli olarak AYNI sonucu döner ve bakiyeden İKİNCİ kez
   * düşmez.
   *
   * Fiyat ve yeni kapasite ÖNCEDEN gösterileceği için `getStableSummary`
   * ile gelen `nextUpgrade` alanı kullanılmalıdır — istemci kendi fiyat
   * hesabını YAPMAZ (bkz. CLAUDE.md "SUNUCU OTORİTESİ").
   */
  upgradeStable: (playerId: string, idempotencyKey: string) =>
    request<StableUpgradeResult>(`/players/${playerId}/stable/upgrade`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli.
   * Yalnızca bu oyuncunun kendi pratik yarış geçmişini döner (bkz.
   * `RecentRaceResultView` doc yorumu, `packages/shared-types/src/race.ts`).
   */
  getRecentRaces: (playerId: string, limit = 5) =>
    request<RecentRaceResultView[]>(`/players/${playerId}/recent-races?limit=${limit}`),

  /**
   * "AT SEVDALISI — Master Development Brief" §22 "PHASE 12 — REPLAY" (bu
   * turda EKLENDİ) — `docs/AUDIT_REPORT.md`'nin "Replay (bağımsız gözatma)"
   * bulgusunu kapatan `/replays/[raceId]` ekranı için. Backend ucu
   * (`GET /races/:id/timeline`, `RaceTimelineController`) DAHA ÖNCEDEN
   * (AUDIT_REPORT.md Bulgu R2) HAZIRDI — burada eksik olan yalnızca
   * frontend'in bunu ÇAĞIRACAK bir yol bulmamasıydı. `RaceTimelineView`
   * `RaceViewer.tsx`'in beklediği `RaceTimeline` ile AYNI ŞEKİL DEĞİLDİR
   * (bkz. `replay-adapter.ts`'in dosya başı doc yorumu) — çağıran taraf
   * dönen veriyi `adaptRaceTimelineViewToReplayData` ile dönüştürmelidir.
   */
  getRaceTimeline: (raceId: string) => request<RaceTimelineView>(`/races/${raceId}/timeline`),

  /**
   * brief §43 "Sıralamalar" (bu turda EKLENDİ) — `/leaderboard` ekranı.
   * Uç nokta `@Public()`'tir (kişiye özel veri taşımaz, bkz.
   * `leaderboard.controller.ts` doc yorumu), bu yüzden token GEREKTİRMEZ.
   *
   * Sıralama sunucuda CANLI hesaplanır; kalıcı `leaderboards` tablosu
   * bilinçli olarak FAZ 7'ye bırakılmıştır (bkz. `get-leaderboard.use-case.ts`).
   * Sunucu en fazla 50 satır döner — istemci kırpma YAPMAZ, gelen listeyi
   * olduğu gibi gösterir.
   */
  getLeaderboard: () => request<LeaderboardRowView[]>('/leaderboard'),

  /** Güncel sezon (brief §69, 01.10.2026) — oturum ister (`me` satırı için). */
  getCurrentSeason: () => request<SeasonView>('/seasons/current'),

  /**
   * brief §32 "Çiftlik" (bu turda EKLENDİ) — `/farm` ekranı.
   * `GET /players/:id/farm` (bkz. `farm.controller.ts`). Yedi tesisin
   * TAMAMINI döner; inşa edilmemişler `level: 0` ile gelir. Maliyetler,
   * tavan seviyeler ve bonuslar SUNUCUDA `config/farm.config.json`'dan
   * hesaplanır — istemci hiçbir sayı türetmez (CLAUDE.md "SUNUCU OTORİTESİ").
   */
  getFarm: (ownerId: string) => request<FarmSummaryView>(`/players/${ownerId}/farm`),

  /**
   * Tesis yükseltme — İLK İNŞA da bu çağrıdan geçer (`facility === null`
   * iken sunucu level 0 → 1 yapar; ayrı bir "inşa et" ucu YOKTUR, bkz.
   * `upgrade-facility.use-case.ts`).
   *
   * PARA harcadığı için `Idempotency-Key` ZORUNLUDUR — `upgradeStable`/
   * `buyMarketListing` ile AYNI desen. Anahtar istemcide üretilir ve her
   * YENİ deneme için tazelenir (bkz. `/farm` sayfası).
   */
  upgradeFacility: (ownerId: string, type: FacilityType, idempotencyKey: string) =>
    request<FacilityUpgradeResult>(`/players/${ownerId}/farm/facilities/${type}/upgrade`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  // Pazar (Market) İşlemleri
  getMarketListings: (
    params: { minPrice?: number; maxPrice?: number; page?: number; pageSize?: number } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.minPrice) query.set('minPrice', params.minPrice.toString());
    if (params.maxPrice) query.set('maxPrice', params.maxPrice.toString());
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());
    return request<MarketListing[]>(`/market/listings?${query}`);
  },

  /**
   * 02.10.2026 — at satışa çıkar (sabit fiyat ya da müzayede). Müzayedede
   * `price` başlangıç fiyatıdır ve `expiresInHours` zorunludur (sunucu kuralı).
   */
  createMarketListing: (body: {
    horseId: string;
    price: number;
    listingType: 'fixed_price' | 'auction';
    expiresInHours?: number;
  }) =>
    request<MarketListing>('/market/listings', { method: 'POST', body: JSON.stringify(body) }),

  cancelMarketListing: (listingId: string) =>
    request<MarketListing>(`/market/listings/${listingId}`, { method: 'DELETE' }),

  /**
   * 02.10.2026 — MÜZAYEDE TEKLİFİ (para emanete alınır). `Idempotency-Key`
   * YOK: aynı teklifin tekrarı sunucuda `BID_TOO_LOW` ile düşer, ikinci
   * emanet alınamaz.
   */
  placeMarketBid: (listingId: string, amount: number) =>
    request<PlaceBidResult>(`/market/listings/${listingId}/bids`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  /**
   * Antrenman ekranı (`apps/web/src/app/training/page.tsx`) — `POST
   * /horses/:id/train` (docs/API.md §4). `HorseOwnerGuardByParam` bu atın
   * GERÇEKTEN giriş yapmış oyuncuya ait olmasını zorunlu kılar (bkz.
   * `training.controller.ts` doc yorumu) — `setAuthToken` ile bir token
   * ayarlanmış olması ZORUNLUDUR, aksi halde 401.
   */
  trainHorse: (
    horseId: string,
    input: { type: TrainingType; intensity: TrainingIntensity; durationMinutes?: number },
  ) =>
    request<TrainHorseResult>(`/horses/${horseId}/train`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /**
   * Antrenman geçmişi (`apps/web/src/app/training/page.tsx`, bu turda
   * EKLENDİ — docs/AUDIT_REPORT.md "Antrenman geçmişi gösterimi" bulgusu)
   * — `GET /horses/:id/training-history` (docs/API.md §4). `trainHorse`
   * ile AYNI `HorseOwnerGuardByParam` koruması altındadır, bu yüzden bu
   * çağrının da geçerli bir `Authorization` header'ı gerekir.
   */
  getTrainingHistory: (horseId: string) =>
    request<TrainingSession[]>(`/horses/${horseId}/training-history`),

  /**
   * Bakım ekranı (`apps/web/src/app/care/page.tsx`) — `POST /horses/:id/care`
   * (docs/API.md §4, brief §11). Backend `trainHorse` ile AYNI şekilde
   * Faz 1 wiring'den beri TAM ÇALIŞIR durumdaydı, yalnızca bir arayüzü
   * yoktu (bkz. `care/page.tsx` dosya başı doc yorumu — `training/page.tsx`
   * ile AYNI "en ucuz/en yüksek etkili sıradaki adım" gerekçesi). Cooldown
   * dolmamışsa backend 409 döner (`CareActionOnCooldownError`, mesajında
   * kalan dakika bilgisi VARDIR) — istemci burada AYRI bir cooldown
   * hesaplaması YAPMAZ, backend'in mesajını olduğu gibi gösterir.
   */
  careHorse: (horseId: string, actionType: CareActionType) =>
    request<PerformCareActionResult>(`/horses/${horseId}/care`, {
      method: 'POST',
      body: JSON.stringify({ actionType }),
    }),

  /**
   * Bakım ekranı — `POST /horses/:id/feed` (docs/API.md §4, brief §12).
   * `careHorse`'un aksine bir cooldown'u YOKTUR, ama DEĞİŞTİ (bu turda):
   * kalem artık gerçek bir kaynaktır — `saman` at başına günde 3, diğerleri
   * elmasla alınıp stoktan düşer. Sunucu 409 (`INSUFFICIENT_FEED_STOCK` /
   * `DAILY_FEED_LIMIT_REACHED`) dönebilir; istemci bu durumları önceden
   * `getHorseFeedStatus` ile gösterebilir.
   */
  feedHorse: (horseId: string, feedType: FeedType) =>
    request<FeedHorseResult>(`/horses/${horseId}/feed`, {
      method: 'POST',
      body: JSON.stringify({ feedType }),
    }),

  /**
   * Yem dükkânı (`apps/web/src/app/farm/page.tsx`) — `GET
   * /players/:id/feed-inventory` (bu turda EKLENDİ). Oyuncunun stoğu + kalem
   * kataloğu (fiyat/günlük sınır). Fiyatlar SUNUCUDAN gelir; istemci
   * `config/*.config.json`'u BİLMEZ.
   */
  getFeedInventory: (playerId: string) =>
    request<FeedInventoryView>(`/players/${playerId}/feed-inventory`, { method: 'GET' }),

  /**
   * Yem satın alma — `POST /players/:id/feed-inventory/:type/buy` (bu turda
   * EKLENDİ). PARA harcadığı için `Idempotency-Key` ZORUNLUDUR —
   * `upgradeFacility`/`upgradeStable` ile AYNI desen: anahtar ÇAĞIRAN
   * tarafından üretilir ve her YENİ deneme için tazelenir.
   *
   * `count` SUNUCUDA doğrulanır (`care.config.json` `feedPurchaseMaxCount`
   * üst sınırı) — istemci fiyatı/toplamı kendisi hesaplamaz, yanıttaki
   * `newBalance`/`price` makbuzunu gösterir (CLAUDE.md "SUNUCU OTORİTESİ").
   */
  buyFeed: (playerId: string, type: FeedType, count: number, idempotencyKey: string) =>
    request<BuyFeedResult>(`/players/${playerId}/feed-inventory/${type}/buy`, {
      method: 'POST',
      body: JSON.stringify({ count }),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * Besleme ekranı — `GET /horses/:id/feed-status` (bu turda EKLENDİ).
   * Her kalem için stok + bu ATA özel kalan günlük hak. İstemci "bugün kaç
   * saman hakkım kaldı"yı KENDİSİ HESAPLAMAZ (sunucu otoritesi).
   */
  getHorseFeedStatus: (horseId: string) =>
    request<FeedStatusView>(`/horses/${horseId}/feed-status`, { method: 'GET' }),

  /**
   * Online (PvP) ekranı (`apps/web/src/app/online/page.tsx`) — `POST
   * /matchmaking/queue` (docs/API.md §9). TAMAMEN SENKRON tasarım (bkz.
   * `join-matchmaking-queue.use-case.ts` doc yorumu): uygun bir rakip
   * ANINDA bulunursa yanıt tam maç sonucunu taşır (`matched: true`),
   * bulunamazsa çağıran oyuncu kuyruğa eklenir (`matched: false`) — bu
   * durumda ZATEN kuyrukta bekleyen bir oyuncu, sonradan biri onunla
   * eşleştiğinde bunu KENDİLİĞİNDEN öğrenemez (backend'de polling/
   * WebSocket bildirimi henüz yok, bilinçli kapsam dışı) — arayüz bunu
   * gizlemez, açıkça belirtir.
   */
  joinMatchmakingQueue: (horseId: string) =>
    request<JoinMatchmakingQueueResult>('/matchmaking/queue', {
      method: 'POST',
      body: JSON.stringify({ horseId }),
    }),

  leaveMatchmakingQueue: (horseId: string) =>
    request<MatchmakingTicket>(`/matchmaking/queue?horseId=${horseId}`, {
      method: 'DELETE',
    }),

  /**
   * S3 hardening sonrası `buyerId` artık İSTEK GÖVDESİNDE YOK — alıcı
   * kimliği yalnızca `Authorization` header'ındaki oturumdan
   * (`@CurrentPlayer()`) türetilir (bkz. `market.controller.ts`
   * `buyListing` doc yorumu). Çağıranın önceden `setAuthToken` ile
   * geçerli bir token ayarlamış olması ZORUNLUDUR, aksi halde 401.
   */
  buyMarketListing: (listingId: string, idempotencyKey: string) =>
    request<{ listing: { id: string; status: string } }>(`/market/listings/${listingId}/buy`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * Yarışlar ekranı (`apps/web/src/app/races/page.tsx`) — `POST
   * /horses/:id/practice-race` (docs/API.md §4). `RunPracticeRaceDto`'nun
   * dört taktik alanı da opsiyoneldir; gönderilmezse backend `DEFAULT_
   * RACE_TACTIC`'i kullanır (bkz. `domain/race/validation.ts`). Bu artık
   * PARA değiştiren bir uç nokta (giriş ücreti + ödül) — `market.
   * buyMarketListing`/`training.trainHorse` ile AYNI gerekçeyle bir
   * `Idempotency-Key` header'ı ZORUNLUDUR (bkz. `race.controller.ts` doc
   * yorumu).
   *
   * `tierId` (proje sahibinin talebi, 27.09.2026) — yarışın KADEMESİ; alan
   * büyüklüğünü (8/10/12/14/16), giriş ücretini ve ödül tablosunu belirler
   * (bkz. `config/economy.config.json` `raceTiers`). Opsiyoneldir:
   * gönderilmezse sunucu İLK kademeyi (en küçük alan) kullanır. Geçersiz bir
   * kimlik `400 INVALID_RACE_TIER` döner — doğrulama istemcide YAPILMAZ
   * (bkz. `run-practice-race.dto.ts` doc yorumu).
   */
  runPracticeRace: (
    horseId: string,
    tactic: {
      racingStyle?: RacingStyle;
      riskLevel?: RiskLevel;
      startApproach?: StartApproach;
      finalStretchPlan?: FinalStretchPlan;
      tierId?: string;
    },
    idempotencyKey: string,
  ) =>
    request<PracticeRaceResult>(`/horses/${horseId}/practice-race`, {
      method: 'POST',
      body: JSON.stringify(tactic),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * 01.10.2026 — OYUNCU KONTROLLÜ PRATİK YARIŞ. Başlatma ücreti hemen düşer;
   * Idempotency-Key gerekmez (tek süren oturum kuralı; yanıt kaybolursa
   * `getCurrentInteractiveRace` oturumu geri bulur).
   */
  startInteractiveRace: (
    horseId: string,
    tactic: {
      racingStyle?: RacingStyle;
      riskLevel?: RiskLevel;
      startApproach?: StartApproach;
      finalStretchPlan?: FinalStretchPlan;
      tierId?: string;
    } = {},
  ) =>
    request<InteractiveRaceView>(`/horses/${horseId}/interactive-race`, {
      method: 'POST',
      body: JSON.stringify(tactic),
    }),
  getCurrentInteractiveRace: () =>
    request<InteractiveRaceView | null>('/interactive-races/current'),
  getInteractiveRace: (raceId: string) =>
    request<InteractiveRaceView>(`/interactive-races/${raceId}`),
  sendRaceControl: (raceId: string, control: PlayerControlInput) =>
    request<InteractiveRaceView>(`/interactive-races/${raceId}/commands`, {
      method: 'POST',
      body: JSON.stringify({ control }),
    }),
  finishInteractiveRace: (raceId: string) =>
    request<InteractiveRaceView>(`/interactive-races/${raceId}/finish`, { method: 'POST' }),

  /** 01.10.2026 — kontrollü LOBİ yarışı (çok oyunculu canlı koşu). */
  getCurrentLiveLobbyRace: () => request<InteractiveRaceView | null>('/races/live/current'),
  getLiveLobbyRace: (raceId: string) => request<InteractiveRaceView>(`/races/${raceId}/live`),
  getLiveLobbyRaceSpectate: (raceId: string) =>
    request<InteractiveRaceView>(`/races/${raceId}/live/spectate`),
  sendLiveLobbyControl: (raceId: string, control: PlayerControlInput) =>
    request<InteractiveRaceView>(`/races/${raceId}/live/commands`, {
      method: 'POST',
      body: JSON.stringify({ control }),
    }),
  finishLiveLobbyRace: (raceId: string) =>
    request<InteractiveRaceView>(`/races/${raceId}/live/finish`, { method: 'POST' }),

  /**
   * Ekipman (`apps/web/src/app/equipment/page.tsx`, bu turda EKLENDİ —
   * `claude/hizli-bitirme-plani.md`'nin proje sahibi tarafından
   * önceliklendirdiği dilim) — `getTrainingHistory` ile AYNI
   * `HorseOwnerGuardByParam` koruması altındadır.
   */
  getHorseEquipment: (horseId: string) => request<HorseEquipment[]>(`/horses/${horseId}/equipment`),

  createHorseEquipment: (
    horseId: string,
    input: { equipmentType: EquipmentType; name: string; quality: number },
  ) =>
    request<HorseEquipment>(`/horses/${horseId}/equipment`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  equipHorseEquipment: (horseId: string, equipmentId: string) =>
    request<HorseEquipment>(`/horses/${horseId}/equipment/${equipmentId}/equip`, {
      method: 'POST',
    }),

  unequipHorseEquipment: (horseId: string, equipmentId: string) =>
    request<HorseEquipment>(`/horses/${horseId}/equipment/${equipmentId}/unequip`, {
      method: 'POST',
    }),

  /**
   * Tribün (proje sahibinin açık talebi, 27.09.2026 — "tribüne ücretli
   * girişler olsun insanlar yarışları izleyebilsin").
   *
   * `getWatchableRaces` — kendi yarışlarım HARİÇ, son `watchWindowHours`
   * saat içinde bitmiş yarışlar. Her satır `hasTicket` taşır: liste
   * ekranı "Bilet Al" ile "İzle" arasında seçim yapmak için ikinci bir
   * istek ATMAZ (bkz. `WatchableRaceView` doc yorumu).
   */
  getWatchableRaces: () => request<WatchableRaceView[]>('/races/watchable'),

  /**
   * `buyRaceTicket` — PARA YOLU. `runPracticeRace`/`buyMarketListing` ile
   * AYNI gerekçeyle `Idempotency-Key` ZORUNLUDUR ve çağıran tarafından
   * ÜRETİLİR (`crypto.randomUUID()`): anahtar istek BAŞINA bir kez
   * üretilip yeniden denemelerde AYNEN tekrarlanmalıdır — burada üretmek
   * her çağrıyı YENİ bir anahtar yapar ve idempotency'yi işe yaramaz hale
   * getirirdi (bkz. `market.buyMarketListing` doc yorumundaki AYNI uyarı).
   */
  buyRaceTicket: (raceId: string, idempotencyKey: string) =>
    request<RaceTicketPurchaseResult>(`/races/${raceId}/tickets`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * Bilet iadesi — `DELETE /races/:id/tickets` (PHASE 7.2, 29.09.2026).
   *
   * **PARA YOLU (ters yön), bu yüzden `Idempotency-Key` ZORUNLUDUR** ve
   * `buyRaceTicket` ile AYNI deseni izler: anahtar ÇAĞIRAN tarafından
   * üretilir. Fark şurada ve BİLEREK böyledir — `wallet/page.tsx`'in
   * "anahtarı başarısızlıkta sakla" kuralı BURADA geçerli DEĞİLDİR, çünkü
   * bu bir GİDER değil GELİRDİR: anahtarın kaybolması hâlinde oluşacak
   * ikinci istek zaten sunucuda `DELETE ... RETURNING`in 0 satır
   * dönmesiyle 404'e düşer (çift iade imkânsızdır, bkz.
   * `refundTicket` doc yorumu). Yani burada her basışta yeni anahtar
   * üretmek `grandstand/page.tsx`'teki satın alma ile aynı sınıftır.
   *
   * İade tutarı **biletin kendi `price`'ından** okunur (`races.tribune_fee`
   * sonradan değişse bile) ve sunucu yeni bakiyeyi döner — istemci
   * bakiyeyi KENDİ hesaplamaz.
   */
  refundRaceTicket: (raceId: string, idempotencyKey: string) =>
    request<RaceTicketRefundResult>(`/races/${raceId}/tickets`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * ÜCRETLİ LOBİ YARIŞI — istemci tarafı (30.09.2026). Bu beş uç sunucuda
   * 27–28.09.2026'dan beri vardı ama HİÇBİR ekran onları çağırmıyordu:
   * oyuncu ücretli yarış açamıyor, katılamıyor, hazır diyemiyordu.
   *
   * `listLobbyRaces` — `GET /races`. Her satır çağıranın KENDİ katılımını
   * (`myEntry`) taşır; "Katıl" ile "Hazırım / Ayrıl" arasındaki seçim ona
   * bakılarak yapılır, istemci belleğine DEĞİL.
   */
  listLobbyRaces: () => request<RaceLobbyListItem[]>('/races'),

  /**
   * `POST /races` — yarış AÇAR, katılmaz (açan kişi ayrıca katılır). PARA
   * YOLU DEĞİLDİR ve `Idempotency-Key` OKUNMAZ: çift açmayı
   * `maxOpenRacesPerPlayer` tavanı sınırlar. Açan kimse TOKEN'dan gelir.
   */
  createLobbyRace: (body: CreateLobbyRaceBody) =>
    request<RaceLobbyView>('/races', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * `POST /races/:id/join` — PARA YOLU (giriş ücreti). `Idempotency-Key`
   * ZORUNLUDUR ve çağıran tarafından üretilir (bkz. `buyRaceTicket`).
   * Katılan oyuncu TOKEN'dan gelir; gövdede yalnızca at ve taktik vardır.
   */
  joinLobbyRace: (
    raceId: string,
    entry: { horseId: string; tacticalStyle?: RacingStyle; riskLevel?: RiskLevel },
    idempotencyKey: string,
  ) =>
    request<RaceLobbyView>(`/races/${raceId}/join`, {
      method: 'POST',
      body: JSON.stringify(entry),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /**
   * `POST /races/:id/ready` — PARA YOLU DEĞİL, `Idempotency-Key` YOK.
   * 30.09.2026'dan beri READY bir bilgi değil KOŞMANIN ŞARTIDIR: başlangıç
   * anında hazır demeyen katılım iptal edilip ücreti iade edilir.
   */
  setLobbyEntryReady: (raceId: string, status: 'ready' | 'not_ready') =>
    request<RaceLobbyView>(`/races/${raceId}/ready`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  /**
   * `POST /races/:id/leave` — PARA YOLU (ters yön: giriş ücreti iadesi).
   * `Idempotency-Key` ZORUNLUDUR; tekrar ikinci bir iade üretmez.
   */
  leaveLobbyRace: (raceId: string, idempotencyKey: string) =>
    request<RaceLobbyView>(`/races/${raceId}/leave`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  /** "Biletlerim" — `GET /players/:id/tickets` (`assertSelf`: yalnızca kendi listem). */
  getMyTickets: (playerId: string) => request<RaceTicketView[]>(`/players/${playerId}/tickets`),

  /**
   * Arkadaşlık + mesajlaşma (proje sahibinin açık talebi, 27.09.2026).
   *
   * **Yedi uç noktanın TAMAMI `assertSelf` ile korunur** — yoldaki `:id`
   * her zaman İŞLEMİ YAPAN oyuncudur, hedef değildir (hedef gövdede ya da
   * ikinci yol parametresinde gelir). Bu yüzden aşağıdaki metodların
   * hiçbiri "başkası adına" çağrılamaz; `playerId` daima
   * `usePlayer()`'dan gelen KENDİ kimliğimizdir.
   *
   * **`Idempotency-Key` YOKTUR (bilinçli):** bu uç noktaların hiçbiri
   * para/mülkiyet değiştirmez — interceptor'ın çözdüğü sorun burada
   * yoktur. Spam savunması sunucudaki `@RateLimit`'tir (istek: 20/dk,
   * mesaj: 30/dk).
   */
  getSocialOverview: (playerId: string) =>
    request<SocialOverviewView>(`/players/${playerId}/social`, { method: 'GET' }),

  /** Arkadaşlık isteği gönderir (`POST`, 201). Karşı taraf kabul edene kadar `pending`. */
  sendFriendRequest: (playerId: string, addresseeId: string) =>
    request<FriendRequestView>(`/players/${playerId}/friend-requests`, {
      method: 'POST',
      body: JSON.stringify({ addresseeId }),
    }),

  /**
   * Gelen isteği yanıtlar. Yeni kaynak YARATMAZ (mevcut satırın durumunu
   * değiştirir) — bu yüzden 200 döner.
   *
   * `action` bilerek `string` tipinde: sunucudaki doğrulama
   * `domain/social/validation.ts`'tedir ve istemcide tip daraltmak,
   * CLAUDE.md'nin uyardığı "DTO dekoratörüne güven" tuzağını büyütürdü.
   */
  respondFriendRequest: (playerId: string, requestId: string, action: 'accept' | 'reject') =>
    request<RespondFriendRequestResult>(
      `/players/${playerId}/friend-requests/${requestId}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({ action }),
      },
    ),

  /**
   * Arkadaşlıktan çıkar VEYA bekleyen isteği geri çeker (iki anlam,
   * bilinçli — sunucudaki `RemoveFriendUseCase` ile AYNI).
   *
   * **Gövde döner (204 DEĞİL):** `request()` her yanıtta `response.json()`
   * çağırır; gövdesiz bir 204 "Unexpected end of JSON input" ile patlardı
   * (gerekçe `RemoveFriendResult` doc yorumunda).
   */
  removeFriend: (playerId: string, friendId: string) =>
    request<RemoveFriendResult>(`/players/${playerId}/friends/${friendId}`, { method: 'DELETE' }),

  /**
   * BLOK / ŞİKÂYET (brief §33, §42 PHASE 15 — istemci tarafı, 29.09.2026).
   * Dört uç nokta `PROJE_DURUMU.md` §13.16'dan beri SUNUCUDA hazırdı; eksik
   * olan yalnızca istemciydi. Dördü de `assertSelf` ile korunur, yani
   * `playerId` HER ZAMAN çağıranın kendi kimliğidir — başkası adına
   * engelleme/şikâyet yolu YOKTUR.
   *
   * **`Idempotency-Key` YOKTUR ve olmamalıdır:** bu dört uç para/mülkiyet
   * değiştirmez. Engelleme zaten İDEMPOTENTTİR (ikinci çağrı 201 döner,
   * ikinci satır yazmaz); şikâyet ise bilinçli olarak idempotent DEĞİLDİR
   * (tekrarlayan şikâyet moderasyon için bir sinyaldir) — oraya anahtar
   * koymak o sinyali sustururdu. Spam savunması sunucudaki `@RateLimit`tir
   * (engel 60/dk, şikâyet 20/dk).
   */

  /**
   * KENDİ engel listem. **Yalnızca tek yön:** "beni engelleyenler" diye bir
   * liste YOKTUR ve sunucudan istenemez (brief §33 — engelleme sessiz bir
   * mesafedir; karşı tarafa "seni engelledi" bilgisini veren her yüzey o
   * amacı bozar).
   */
  listBlockedPlayers: (playerId: string) =>
    request<BlockedPlayerView[]>(`/players/${playerId}/blocks`, { method: 'GET' }),

  /**
   * Bir oyuncuyu engeller. **`blockedId` GÖVDE alanıdır** — sunucudaki
   * `ParseUUIDPipe` ona uzanmaz, bu yüzden sunucu ayrıca `isUUID` kapısı
   * tutar (`social.controller.ts`). İstemci burada ikinci bir doğrulama
   * YAPMAZ: `playerId` zaten sunucudan gelen bir UUID'dir.
   */
  blockPlayer: (playerId: string, blockedId: string) =>
    request<BlockedPlayerView>(`/players/${playerId}/blocks`, {
      method: 'POST',
      body: JSON.stringify({ blockedId }),
    }),

  /**
   * Engeli kaldırır (200 + gövde, 204 DEĞİL — `RemoveBlockResult` gerekçesi).
   * Engel YOKSA sunucu 404 döner; istemci bunu "sessiz başarı" saymaz.
   */
  unblockPlayer: (playerId: string, blockedId: string) =>
    request<RemoveBlockResult>(`/players/${playerId}/blocks/${blockedId}`, { method: 'DELETE' }),

  /**
   * Bir oyuncuyu şikâyet eder.
   *
   * **`category` İSTEMCİDE TİP OLARAK DARALTILMAZ, `ReportCategory` ile
   * VERİLİR:** geçerli kümenin TEK kaynağı `domain/social/moderation.ts` →
   * `REPORT_CATEGORIES`dir ve sunucu geçersiz bir değeri 400
   * (`InvalidReportCategoryError`) ile reddeder. İstemcide ikinci bir liste
   * tutmak, kategori eklendiğinde sessizce ayrışırdı.
   *
   * **`reason` BOŞKEN GÖNDERİLMEZ:** sunucu eksik gerekçeyi `null`a
   * indirger, yani `reason: ''` göndermek sözleşmeyi değiştirmez — ama boş
   * bir alanı "doldurulmuş" gibi taşımak, moderasyon kuyruğunda gerekçesi
   * olan bir şikâyet izlenimi verirdi.
   */
  reportPlayer: (playerId: string, reportedId: string, category: ReportCategory, reason?: string) =>
    request<ReportPlayerResult>(`/players/${playerId}/reports`, {
      method: 'POST',
      body: JSON.stringify(
        reason !== undefined && reason.length > 0
          ? { reportedId, category, reason }
          : { reportedId, category },
      ),
    }),

  /** Mesaj gönderir (`POST`, 201). Arkadaşlık kapısı sunucudadır (`NOT_FRIENDS`, 403). */
  sendMessage: (playerId: string, recipientId: string, body: string) =>
    request<DirectMessageView>(`/players/${playerId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ recipientId, body }),
    }),

  /**
   * İki oyuncu arasındaki yazışma (en yeniden eskiye). **Yan etkisi
   * vardır:** sunucu, bana gelen okunmamış mesajları okundu işaretler
   * (bkz. `GetConversationUseCase`). Gelen kutusu (`getInbox`) bunu
   * YAPMAZ.
   */
  getConversation: (playerId: string, otherPlayerId: string) =>
    request<DirectMessageView[]>(`/players/${playerId}/messages/${otherPlayerId}`, {
      method: 'GET',
    }),

  /** Gelen kutusu — bana gelen son mesajlar (gönderen adıyla). Okundu işaretlemez. */
  getInbox: (playerId: string) =>
    request<DirectMessageView[]>(`/players/${playerId}/inbox`, { method: 'GET' }),

  /**
   * Hediye gönderimi (proje sahibinin açık talebi, 27.09.2026 — üç parçanın
   * ÜÇÜNCÜSÜ: "tribün, arkadaşlık + mesajlaşma, hediye gönderimi").
   *
   * **PARA YOLU — `Idempotency-Key` ZORUNLUDUR** ve yukarıdaki sosyal
   * metodların AKSİNE çağıran tarafından ÜRETİLİR
   * (`buyRaceTicket`/`buyMarketListing` ile AYNI desen). Anahtar istek
   * BAŞINA bir kez üretilip yeniden denemelerde AYNEN tekrarlanmalıdır;
   * burada üretmek her çağrıyı YENİ bir anahtar yapar ve ağ hatası sonrası
   * tekrar denemeyi İKİNCİ BİR HEDİYE hâline getirirdi (hediye bir
   * TRANSFER'dir — çift gönderim alıcıyı haksız zenginleştirir).
   *
   * **Ön koşul arkadaşlıktır** (`GIFT_REQUIRES_FRIENDSHIP`, 403) ve
   * günlük gönderim tavanı sunucudadır (`DAILY_GIFT_LIMIT_REACHED`, 409) —
   * ikisi de istemcide TAKLİT EDİLMEZ, yalnızca düğme durumu için kullanılır.
   *
   * `amount` bilerek `number` tipinde: sınırlar `config/gift.config.json`'ta
   * yaşar (`minAmount`/`maxAmount`) ve istemcide tip daraltmak, CLAUDE.md'nin
   * uyardığı "DTO dekoratörüne güven" tuzağını büyütürdü.
   */
  sendGift: (
    playerId: string,
    recipientId: string,
    amount: number,
    currency: string,
    idempotencyKey: string,
  ) =>
    request<SendGiftResult>(`/players/${playerId}/gifts`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ recipientId, amount, currency }),
    }),

  /**
   * Hediye geçmişi — hem GELEN hem GİDEN hediyeler, en yeniden eskiye
   * (`historyLimit` sunucudaki config'ten gelir). Her satır
   * `direction` taşır; liste ekranı "gönderdim/geldi" ayrımını ikinci bir
   * istek atmadan yapar.
   */
  getMyGifts: (playerId: string) =>
    request<GiftView[]>(`/players/${playerId}/gifts`, { method: 'GET' }),

  /**
   * BİLDİRİMLER + YARIŞ DAVETİ (brief §28/§16, §35 `/notifications`).
   *
   * Beş uç noktanın TAMAMI `assertSelf` ile korunur — yoldaki `:id` her
   * zaman İŞLEMİ YAPAN oyuncudur, hedef değildir (hedef gövdede gelir).
   * `playerId` daima `usePlayer()`'dan gelen KENDİ kimliğimizdir.
   *
   * **`Idempotency-Key` YOKTUR (bilinçli, sunucudaki gerekçeyle AYNI):**
   * bu uçların hiçbiri para/mülkiyet değiştirmez — `accept` yarışa
   * KATILMAK DEĞİLDİR, giriş ücreti tek yoldan (`POST /races/:id/join`)
   * geçer. Spam savunması sunucudaki `@RateLimit`'tir (davet: 20/dk).
   */

  /**
   * Bildirim listesi + okunmamış sayısı, TEK istekte.
   *
   * `unreadCount` AYRI bir alandır (istemci listeden saymaz): liste `limit`
   * ile KIRPILMIŞTIR, yani kırpılmış bir diziden sayılan rozet yanlış olurdu.
   */
  getNotifications: (playerId: string) =>
    request<NotificationListResult>(`/players/${playerId}/notifications`, { method: 'GET' }),

  /** Tüm bildirimleri okundu işaretler (200 + `markedCount`, 204 DEĞİL). */
  markAllNotificationsRead: (playerId: string) =>
    request<MarkAllNotificationsReadResult>(`/players/${playerId}/notifications/read-all`, {
      method: 'POST',
    }),

  /**
   * Tek bildirimi okundu işaretler. **İdempotenttir:** zaten okunmuş bir
   * bildirim yine 200 döner, gövdesi değişmez.
   */
  markNotificationRead: (playerId: string, notificationId: string) =>
    request<NotificationView>(`/players/${playerId}/notifications/${notificationId}/read`, {
      method: 'POST',
    }),

  /** Arkadaşı yarışa davet eder (201). Bekleyen davet tavanı sunucudadır (409). */
  sendRaceInvite: (playerId: string, inviteeId: string, raceId: string) =>
    request<RaceInviteView>(`/players/${playerId}/race-invites`, {
      method: 'POST',
      body: JSON.stringify({ inviteeId, raceId }),
    }),

  /**
   * Daveti yanıtlar (200). `action` bilerek `string`e açık: doğrulama
   * sunucuda (`parseRaceInviteAction`) ve istemcide tip daraltmak,
   * CLAUDE.md'nin uyardığı "DTO dekoratörüne güven" tuzağını büyütürdü
   * (`respondFriendRequest` ile AYNI satır).
   */
  respondRaceInvite: (playerId: string, inviteId: string, action: 'accept' | 'decline') =>
    request<RespondRaceInviteResult>(`/players/${playerId}/race-invites/${inviteId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  /**
   * brief §20 "WALLET SYSTEM", §35 `/wallet` — cüzdan + işlem geçmişi
   * (28.09.2026). `limit` verilmezse sunucunun varsayılanı uygulanır.
   *
   * `hasMore` SUNUCUDAN gelir ve istemci onu **tahmin etmez**
   * (`WalletView` doc yorumu): "satır sayısı === limit" yanılgısı, tam
   * bölünen sonuçlarda fazladan boş bir istek üretir.
   *
   * `assertSelf` ile korunur — yalnızca kişinin KENDİ cüzdanı okunabilir.
   */
  getWallet: (playerId: string, limit?: number, before?: string) => {
    // `before` (30.09.2026) — önceki sayfanın `nextCursor`ı; yoksa ilk sayfa.
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (before !== undefined) params.set('before', before);
    const query = params.toString();
    return request<WalletView>(`/players/${playerId}/wallet${query === '' ? '' : `?${query}`}`, {
      method: 'GET',
    });
  },

  /**
   * brief §20 DEPOSIT, §21, §41 — **SANAL para yatırma** (mock sağlayıcı).
   *
   * **BİR PARA YOLUDUR ve `Idempotency-Key` ZORUNLUDUR** (`upgradeStable`/
   * `buyFeed` ile AYNI sınıf): anahtar `crypto.randomUUID()` ile **istek
   * BAŞINA bir kez** üretilir — aynı mantıksal işlem yeniden denenirse
   * AYNI anahtar geçirilmelidir, yoksa ikinci bir yatırım daha yazılır.
   *
   * **Birim SEÇİLMEZ, `money`'dir.** Uç nokta gövdesi yalnızca `amount`
   * alır (Elmas yatırmanın bir yolu YOKTUR); istemcide bir birim
   * seçtiricisi göstermek, sunucunun kabul etmeyeceği bir seçenek
   * sunmak olurdu. Yanıttaki `currency` alanı bu yüzden OKUNUR, tahmin
   * edilmez.
   *
   * `amount` bilerek `number` ve doğrulama SUNUCUDA (`INVALID_DEPOSIT_AMOUNT`);
   * istemci tavanı kendi uydurmaz, `config`'teki kural sunucunundur.
   */
  depositFunds: (playerId: string, amount: number, idempotencyKey: string) =>
    request<WalletDepositResult>(`/players/${playerId}/wallet/deposit`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount }),
    }),

  /**
   * brief §37 "GÜNLÜK OYUN DÖNGÜSÜ" — günlük ödül talebi.
   *
   * **`Idempotency-Key` GÖNDERİLMEZ** ve bu bilinçlidir: uç noktanın
   * kendi tekrar koruması vardır (`nextClaimAvailableAt` + 409
   * `DailyRewardAlreadyClaimedError`), yani ikinci bir çağrı para
   * ÜRETMEZ. `depositFunds`'tan farkı budur — orada böyle bir doğal kapı
   * yoktur, bu yüzden anahtar şarttır.
   */
  claimDailyReward: (playerId: string) =>
    request<ClaimDailyRewardResult>(`/players/${playerId}/daily-reward`, { method: 'POST' }),

  // ---------------------------------------------------------------------
  // brief §34 YÖNETİM PANELİ — §42 PHASE 15-B (28.09.2026)
  //
  // YEDİ uç noktanın istemci karşılığı. **Hiçbiri `@Public()` DEĞİLDİR**:
  // yetki kapısı sunucudadır (`players.is_admin` HER istekte okunur, rol
  // token'a gömülmez — §13.17). İstemcide bir "yönetici miyim" kontrolü
  // YAPILMAZ ve YAPILAMAZ: buradaki `player.isAdmin` yalnızca bağlantıyı
  // GÖSTERİP GİZLEMEK içindir, bir yetki kapısı değildir. Paneli elle
  // açan yönetici olmayan bir oyuncu 403 `ADMIN_REQUIRED` alır.
  //
  // **`limit` PARAMETRESİ YOKTUR.** Sunucu liste boyutunu
  // `config/admin.config.json`dan okur (`ADMIN_LIMIT_KEYS`); istemcinin
  // `?limit=` göndermesi, sunucunun kabul etmeyeceği bir parametre
  // uydurmak olurdu (bkz. `AdminConfig` doc yorumu: "config bir yetki
  // kapısı DEĞİLDİR" — ama boyut da istemcinin kararı değildir).
  // ---------------------------------------------------------------------

  /** Moderasyon kuyruğu — `status` süzgeci YOKTUR, kuyruk kapalı bir DAG'dır (§13.17). */
  listAdminReports: () => request<AdminReportListResult>('/admin/reports', { method: 'GET' }),

  /**
   * Şikâyet durumunu ilerletir. **GEÇİŞ ÇİZGESİ İSTEMCİDE TEKRARLANMAZ:**
   * hangi geçişin yasal olduğunu sunucu `FOR UPDATE` kilidinin İÇİNDE
   * doğrular (`assertReportTransitionAllowed`). İstemcide ikinci bir
   * çizge tutmak, iki kaynağın çeliştiği bir an üretirdi — ve o an
   * sunucunun reddettiği bir düğmeyi "geçerli" gösterirdi.
   *
   * Düğmeler bu yüzden yalnızca sunucunun KAPALI kümesini (`REPORT_STATUSES`)
   * listeler; yasak geçiş sunucudan 409 olarak döner ve ekranda görünür.
   */
  updateReportStatus: (reportId: string, status: ReportStatus) =>
    request<UpdateReportStatusResult>(`/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  /** Denetim günlüğü — "kim hangi yönetim işlemini ne zaman yaptı" (§13.17). */
  listAdminAuditLog: () => request<AdminAuditLogResult>('/admin/audit-log', { method: 'GET' }),

  /** Users + Wallet ekranlarının ORTAK kaynağı (bakiye `players` kolonudur). */
  listAdminPlayers: () => request<AdminPlayerListResult>('/admin/players', { method: 'GET' }),

  listAdminRaces: () => request<AdminRaceListResult>('/admin/races', { method: 'GET' }),

  /** Transactions + Gifts ekranlarının ORTAK kaynağı; süzgeç İSTEMCİNİN işidir. */
  listAdminTransactions: () =>
    request<AdminTransactionListResult>('/admin/transactions', { method: 'GET' }),

  /**
   * **BİR PARA YOLUDUR.** İade + aynı transaction'da defter kaydı +
   * denetim günlüğü satırı sunucuda birlikte yazılır.
   *
   * **`Idempotency-Key` GÖNDERİLMEZ** ve bu bilinçlidir: çift iadeyi
   * `scheduled → cancelled` geçişinin kendisi engeller, ikinci çağrı 409
   * `RACE_NOT_CANCELABLE` alır (§13.19). `depositFunds`'ta böyle bir doğal
   * kapı YOKTUR, o yüzden orada anahtar şarttır.
   */
  cancelAdminRace: (raceId: string) =>
    request<AdminRaceCancelResult>(`/admin/races/${raceId}/cancel`, { method: 'POST' }),

  // --- Kulüp (brief §44, 01.10.2026) -------------------------------------
  listClubs: (search?: string) =>
    request<ClubSummaryView[]>(`/clubs${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  /** Çağıranın kulübü; üye değilse `null`. */
  getMyClub: () => request<ClubDetailView | null>('/clubs/mine'),

  getClub: (clubId: string) => request<ClubDetailView>(`/clubs/${clubId}`),

  createClub: (name: string, tag: string) =>
    request<ClubDetailView>('/clubs', { method: 'POST', body: JSON.stringify({ name, tag }) }),

  joinClub: (clubId: string) =>
    request<ClubDetailView>(`/clubs/${clubId}/join`, { method: 'POST' }),

  leaveClub: () => request<{ left: true }>('/clubs/leave', { method: 'POST' }),

  kickClubMember: (clubId: string, playerId: string) =>
    request<ClubDetailView>(`/clubs/${clubId}/members/${playerId}`, { method: 'DELETE' }),

  /** `role: 'leader'` liderliği DEVREDER (çağıran subay olur). */
  setClubMemberRole: (clubId: string, playerId: string, role: ClubRole) =>
    request<ClubDetailView>(`/clubs/${clubId}/members/${playerId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  disbandClub: (clubId: string) =>
    request<{ disbanded: true }>(`/clubs/${clubId}`, { method: 'DELETE' }),

  // --- Personel (brief §33, 01.10.2026) -----------------------------------
  /** Kadro + aday pazarı + kapasite (oyuncu token'dan). */
  getStaffOverview: () => request<StaffOverview>('/staff'),

  /**
   * PARA YOLU (peşin sözleşme). `Idempotency-Key` GÖNDERİLMEZ: tekrar
   * DURUMLA engellenir — ikinci çağrı 409 `STAFF_ALREADY_HIRED`.
   */
  hireStaff: (staffId: string) =>
    request<StaffHireResult>(`/staff/${staffId}/hire`, { method: 'POST' }),

  /** PARA YOLU — yalnızca bitime yakın/bitmişse açılır; ikinci çağrı 409 `STAFF_RENEWAL_NOT_DUE`. */
  renewStaff: (staffId: string) =>
    request<StaffHireResult>(`/staff/${staffId}/renew`, { method: 'POST' }),

  /** İade YOK — peşin sözleşme bir kiralama bedelidir. */
  releaseStaff: (staffId: string) =>
    request<StaffView>(`/staff/${staffId}/release`, { method: 'POST' }),
};
