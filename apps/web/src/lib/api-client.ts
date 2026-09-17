import type {
  PlayerSummary,
  PublicHorse,
  RecentRaceResultView,
  StableSummaryView,
} from '@at-sevdalisi/shared-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

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
  registerPlayer: (username: string, displayName: string) =>
    request<PlayerSummary>('/players', {
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

  // Pazar (Market) İşlemleri
  getMarketListings: (params: { minPrice?: number; maxPrice?: number; page?: number; pageSize?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.minPrice) query.set('minPrice', params.minPrice.toString());
    if (params.maxPrice) query.set('maxPrice', params.maxPrice.toString());
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());
    return request<Array<{ id: string; horseId: string; price: number; status: string }>>(`/market/listings?${query}`);
  },

  buyMarketListing: (listingId: string, buyerId: string, idempotencyKey: string) =>
    request<{ listing: { id: string; status: string } }>(`/market/listings/${listingId}/buy`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ buyerId }),
    }),
};
