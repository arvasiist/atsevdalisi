import type {
  AuthSession,
  BuyFeedResult,
  CareActionType,
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
  HorseEquipment,
  HorseMarketValueView,
  JoinMatchmakingQueueResult,
  LeaderboardRowView,
  MatchmakingTicket,
  PerformCareActionResult,
  PlayerSummary,
  PracticeRaceResult,
  PublicHorse,
  RacingStyle,
  RaceTicketPurchaseResult,
  RaceTicketView,
  RaceTimelineView,
  RecentRaceResultView,
  RemoveFriendResult,
  RespondFriendRequestResult,
  RiskLevel,
  SocialOverviewView,
  StableSummaryView,
  StableUpgradeResult,
  StartApproach,
  TrainHorseResult,
  TrainingIntensity,
  TrainingSession,
  TrainingType,
  WatchableRaceView,
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
    throw new Error(message);
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
  getHorseMarketValue: (horseId: string) => request<HorseMarketValueView>(`/horses/${horseId}/market-value`),

  /**
   * DÜZELTME (Faz 2, görsel kalite planı) — önceden `GET /stable/summary
   * ?ownerId=` çağırıyordu, ki bu rota HİÇ VAR OLMADI (gerçek backend
   * rotası `GET /players/:id/stable-summary`, bkz. `stable.controller.ts`)
   * — bu çağrı her zaman 404 ile patlıyordu, hiçbir sayfa bunu
   * TÜKETMEDİĞİ için fark edilmemişti. Artık gerçek rotayı ve gerçek
   * `StableSummaryView` şeklini kullanıyor.
   */
  getStableSummary: (ownerId: string) => request<StableSummaryView>(`/players/${ownerId}/stable-summary`),

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
  getMarketListings: (params: { minPrice?: number; maxPrice?: number; page?: number; pageSize?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.minPrice) query.set('minPrice', params.minPrice.toString());
    if (params.maxPrice) query.set('maxPrice', params.maxPrice.toString());
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());
    return request<Array<{ id: string; horseId: string; price: number; status: string }>>(`/market/listings?${query}`);
  },

  /**
   * Antrenman ekranı (`apps/web/src/app/training/page.tsx`) — `POST
   * /horses/:id/train` (docs/API.md §4). `HorseOwnerGuardByParam` bu atın
   * GERÇEKTEN giriş yapmış oyuncuya ait olmasını zorunlu kılar (bkz.
   * `training.controller.ts` doc yorumu) — `setAuthToken` ile bir token
   * ayarlanmış olması ZORUNLUDUR, aksi halde 401.
   */
  trainHorse: (horseId: string, input: { type: TrainingType; intensity: TrainingIntensity; durationMinutes?: number }) =>
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
  getTrainingHistory: (horseId: string) => request<TrainingSession[]>(`/horses/${horseId}/training-history`),

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
   * Ekipman (`apps/web/src/app/equipment/page.tsx`, bu turda EKLENDİ —
   * `claude/hizli-bitirme-plani.md`'nin proje sahibi tarafından
   * önceliklendirdiği dilim) — `getTrainingHistory` ile AYNI
   * `HorseOwnerGuardByParam` koruması altındadır.
   */
  getHorseEquipment: (horseId: string) => request<HorseEquipment[]>(`/horses/${horseId}/equipment`),

  createHorseEquipment: (horseId: string, input: { equipmentType: EquipmentType; name: string; quality: number }) =>
    request<HorseEquipment>(`/horses/${horseId}/equipment`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  equipHorseEquipment: (horseId: string, equipmentId: string) =>
    request<HorseEquipment>(`/horses/${horseId}/equipment/${equipmentId}/equip`, { method: 'POST' }),

  unequipHorseEquipment: (horseId: string, equipmentId: string) =>
    request<HorseEquipment>(`/horses/${horseId}/equipment/${equipmentId}/unequip`, { method: 'POST' }),

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
    request<RespondFriendRequestResult>(`/players/${playerId}/friend-requests/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

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
    request<DirectMessageView[]>(`/players/${playerId}/messages/${otherPlayerId}`, { method: 'GET' }),

  /** Gelen kutusu — bana gelen son mesajlar (gönderen adıyla). Okundu işaretlemez. */
  getInbox: (playerId: string) => request<DirectMessageView[]>(`/players/${playerId}/inbox`, { method: 'GET' }),
};
