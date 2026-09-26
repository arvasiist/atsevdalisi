import type {
  AuthSession,
  CareActionType,
  FeedHorseResult,
  FeedType,
  FinalStretchPlan,
  JoinMatchmakingQueueResult,
  MatchmakingTicket,
  PerformCareActionResult,
  PlayerSummary,
  PracticeRaceResult,
  PublicHorse,
  RacingStyle,
  RaceTimelineView,
  RecentRaceResultView,
  RiskLevel,
  StableSummaryView,
  StartApproach,
  TrainHorseResult,
  TrainingIntensity,
  TrainingType,
} from '@at-sevdalisi/shared-types';

/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — `export` edildi çünkü
 * `live-race-socket.ts`'in soket bağlantısı için bu AYNI backend origin'e
 * ihtiyacı var (REST `/api/v1` önekinden ARINDIRILMIŞ hali için bkz. o
 * dosyadaki `deriveSocketOrigin`). Daha önce bu modül-içi bir sabitti,
 * yalnızca bu dosyanın kendi `request()` fonksiyonu tarafından kullanılıyordu.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

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
   * DÜZELTME (Faz 2, görsel kalite planı) — önceden `GET /stable/summary
   * ?ownerId=` çağırıyordu, ki bu rota HİÇ VAR OLMADI (gerçek backend
   * rotası `GET /players/:id/stable-summary`, bkz. `stable.controller.ts`)
   * — bu çağrı her zaman 404 ile patlıyordu, hiçbir sayfa bunu
   * TÜKETMEDİĞİ için fark edilmemişti. Artık gerçek rotayı ve gerçek
   * `StableSummaryView` şeklini kullanıyor.
   */
  getStableSummary: (ownerId: string) => request<StableSummaryView>(`/players/${ownerId}/stable-summary`),

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
   * `careHorse`'un aksine bir cooldown'u YOKTUR (bkz. `domain/care/care.ts`
   * doc yorumu — "Besleme burada YOKTUR").
   */
  feedHorse: (horseId: string, feedType: FeedType) =>
    request<FeedHorseResult>(`/horses/${horseId}/feed`, {
      method: 'POST',
      body: JSON.stringify({ feedType }),
    }),

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
   */
  runPracticeRace: (
    horseId: string,
    tactic: { racingStyle?: RacingStyle; riskLevel?: RiskLevel; startApproach?: StartApproach; finalStretchPlan?: FinalStretchPlan },
    idempotencyKey: string,
  ) =>
    request<PracticeRaceResult>(`/horses/${horseId}/practice-race`, {
      method: 'POST',
      body: JSON.stringify(tactic),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
};
