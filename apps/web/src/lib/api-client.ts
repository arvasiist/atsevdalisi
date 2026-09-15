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
  // Oyuncu İşlemleri
  registerPlayer: (username: string, displayName: string) =>
    request<{ id: string; username: string; displayName: string }>('/players', {
      method: 'POST',
      body: JSON.stringify({ username, displayName }),
    }),

  getPlayer: (playerId: string) =>
    request<{ id: string; username: string; displayName: string; money: number }>(`/players/${playerId}`),

  // At & Ahır İşlemleri
  getHorsesByOwner: (ownerId: string) =>
    request<Array<{
      id: string;
      name: string;
      gender: string;
      breed: string;
      birthDate: string;
      quality: number;
      potential: number;
    }>>(`/horses?ownerId=${ownerId}`),

  getHorseDetails: (horseId: string) =>
    request<{
      id: string;
      name: string;
      stats: { speed: number; stamina: number; acceleration: number };
    }>(`/horses/${horseId}`),

  getStableSummary: (ownerId: string) =>
    request<{
      totalHorses: number;
      stableLevel: number;
      capacity: number;
    }>(`/stable/summary?ownerId=${ownerId}`),

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