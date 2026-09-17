import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthSession,
  FinalStretchPlan,
  PlayerSummary,
  RacingStyle,
  RiskLevel,
  StartApproach,
  TrainingIntensity,
  TrainingType,
} from '@at-sevdalisi/shared-types';
import { apiClient, setAuthToken } from '../../src/lib/api-client';

/**
 * AUDIT_REPORT.md T2 — `apps/web`'in tek gerçek kontrat testi. Bu oturumun
 * başında backend'in JWT zorunlu hale gelmesi (S1 hardening) TÜM frontend'i
 * sessizce kırmıştı (`apiClient` çağıran her ekran 401 alıyordu) ve hiçbir
 * test bunu yakalamadı — sadece elle kod okuma yakaladı. Bu dosya tam olarak
 * o sınıf regresyonu (Authorization header'ın doğru eklenip eklenmediği +
 * her `apiClient.*` çağrısının gerçek backend rotasıyla eşleşen URL/method/
 * body/headers üretmesi) bir daha sessizce kırılırsa `npm test`'i
 * KIRACAK şekilde yazıldı.
 *
 * jsdom/happy-dom bu depoda (henüz) devDependency değil (bkz.
 * `package-lock.json` — `vitest`'in `peerDependenciesMeta` üzerinden
 * OPSİYONEL olarak referans verdiği paketler, gerçekten kurulu değil).
 * `api-client.ts` React'a veya DOM'a hiç dokunmadığı (yalnızca global
 * `fetch`/`Headers` — Node 20'de tarayıcısız da mevcuttur) için bu test
 * dosyası kasıtlı olarak `environment: 'node'` varsayılanıyla (apps/web'de
 * özel bir vitest config'i yok, kök `vitest.config.ts`'in `environment:
 * 'node'`'u geçerli) çalışacak şekilde tasarlandı — jsdom GEREKMİYOR.
 */

const API_BASE_URL = 'http://localhost:3000/api/v1';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

function stubFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestArgs(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0): [string, RequestInit] {
  return fetchMock.mock.calls[callIndex] as [string, RequestInit];
}

const samplePlayer: PlayerSummary = {
  id: 'player-1',
  displayName: 'Harbi Seyis',
  avatarId: null,
  level: 3,
  xp: 120,
  money: 5000,
  gems: 10,
};

beforeEach(() => {
  setAuthToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setAuthToken / Authorization header', () => {
  it('bir token ayarlandığında her istekte "Bearer <token>" header\'ı eklenir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: samplePlayer });
    setAuthToken('token-abc-123');

    await apiClient.getPlayer('player-1');

    const [, config] = requestArgs(fetchMock);
    const headers = config.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-abc-123');
  });

  it('token hiç ayarlanmadıysa Authorization header hiç eklenmez', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: samplePlayer });

    await apiClient.getPlayer('player-1');

    const [, config] = requestArgs(fetchMock);
    const headers = config.headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  it('setAuthToken(null) önceden ayarlanmış bir token\'ı temizler (logout senaryosu)', async () => {
    setAuthToken('eski-token');
    setAuthToken(null);
    const fetchMock = stubFetchOnce({ success: true, data: samplePlayer });

    await apiClient.getPlayer('player-1');

    const [, config] = requestArgs(fetchMock);
    expect((config.headers as Headers).has('Authorization')).toBe(false);
  });

  it('Content-Type header\'ı token olsun ya da olmasın her zaman application/json olur', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: samplePlayer });
    setAuthToken('token-abc-123');

    await apiClient.getPlayer('player-1');

    const [, config] = requestArgs(fetchMock);
    expect((config.headers as Headers).get('Content-Type')).toBe('application/json');
  });
});

describe('request() hata yönetimi', () => {
  it('response.ok=false ise backend\'in error.message\'ıyla fırlatır', async () => {
    stubFetchOnce(
      { success: false, data: null, error: { code: 'NOT_FOUND', message: 'Oyuncu bulunamadı' } },
      { ok: false, status: 404 },
    );

    await expect(apiClient.getPlayer('yok-boyle-biri')).rejects.toThrow('Oyuncu bulunamadı');
  });

  it('error.message yoksa "API Hatası: <status>" fallback\'ini fırlatır', async () => {
    stubFetchOnce({ success: false, data: null }, { ok: false, status: 401 });

    await expect(apiClient.getPlayer('player-1')).rejects.toThrow('API Hatası: 401');
  });

  it('response.ok=true olsa bile result.success=false ise yine hata fırlatır (zarf içi başarısızlık)', async () => {
    stubFetchOnce({ success: false, data: null }, { ok: true, status: 200 });

    await expect(apiClient.getPlayer('player-1')).rejects.toThrow('API Hatası: 200');
  });

  it('başarılı yanıtta yalnızca result.data döner (zarf sızdırılmaz)', async () => {
    stubFetchOnce({ success: true, data: samplePlayer, meta: { cached: false } });

    const result = await apiClient.getPlayer('player-1');

    expect(result).toEqual(samplePlayer);
  });
});

describe('apiClient.registerPlayer', () => {
  it('POST /players çağırır, body\'de username/displayName gönderir', async () => {
    const session: AuthSession = { token: 'yeni-token', player: samplePlayer };
    const fetchMock = stubFetchOnce({ success: true, data: session });

    const result = await apiClient.registerPlayer('jokey_42', 'Harbi Seyis');

    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ username: 'jokey_42', displayName: 'Harbi Seyis' });
    expect(result).toEqual(session);
  });

  it('kayıt sırasında kendi başına setAuthToken çağırmaz (çağıran taraf — player-context — sorumludur)', async () => {
    const session: AuthSession = { token: 'yeni-token', player: samplePlayer };
    stubFetchOnce({ success: true, data: session });

    await apiClient.registerPlayer('jokey_42', 'Harbi Seyis');
    const fetchMockAfter = stubFetchOnce({ success: true, data: samplePlayer });
    await apiClient.getPlayer('player-1');

    const [, config] = requestArgs(fetchMockAfter);
    expect((config.headers as Headers).has('Authorization')).toBe(false);
  });
});

describe('apiClient.getPlayer / getHorsesByOwner / getHorseDetails', () => {
  it('getPlayer doğru URL\'e GET atar', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: samplePlayer });
    await apiClient.getPlayer('player-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1`);
    expect(config.method).toBeUndefined();
  });

  it('getHorsesByOwner ownerId\'yi query string\'e koyar', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.getHorsesByOwner('owner-7');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/horses?ownerId=owner-7`);
  });

  it('getHorseDetails doğru at ID\'siyle URL kurar', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getHorseDetails('horse-9');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/horses/horse-9`);
  });
});

describe('apiClient.getStableSummary', () => {
  it('gerçek backend rotasını (/players/:id/stable-summary) kullanır (eski, hiç var olmamış /stable/summary?ownerId= DEĞİL)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getStableSummary('owner-7');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/owner-7/stable-summary`);
  });
});

describe('apiClient.getRecentRaces', () => {
  it('limit verilmezse varsayılan olarak 5 kullanır', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.getRecentRaces('player-1');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/recent-races?limit=5`);
  });

  it('özel bir limit verilirse onu kullanır', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.getRecentRaces('player-1', 10);
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/recent-races?limit=10`);
  });
});

describe('apiClient.getMarketListings', () => {
  it('hiç parametre verilmezse boş bir sorgu string\'i üretir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.getMarketListings();
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/market/listings?`);
  });

  it('tüm parametreler verilirse hepsini sorgu string\'ine ekler', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.getMarketListings({ minPrice: 10, maxPrice: 500, page: 2, pageSize: 20 });
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/market/listings?minPrice=10&maxPrice=500&page=2&pageSize=20`);
  });

  it('BİLİNEN DAVRANIŞ: minPrice=0 falsy olduğu için sorgu string\'ine EKLENMEZ (mevcut `if (params.minPrice)` mantığı — 0 TL alt sınırıyla üst sınır aramak isteyen bir kullanıcı bunu fark etmeyebilir)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.getMarketListings({ minPrice: 0, maxPrice: 500 });
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/market/listings?maxPrice=500`);
  });
});

describe('apiClient.trainHorse', () => {
  it('POST /horses/:id/train çağırır ve input\'u olduğu gibi body\'e koyar', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    const input: { type: TrainingType; intensity: TrainingIntensity; durationMinutes?: number } = {
      type: 'speed',
      intensity: 'medium',
      durationMinutes: 30,
    };

    await apiClient.trainHorse('horse-9', input);

    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/horses/horse-9/train`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual(input);
  });
});

describe('apiClient.joinMatchmakingQueue / leaveMatchmakingQueue', () => {
  it('joinMatchmakingQueue POST /matchmaking/queue çağırır, body\'de horseId gönderir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { matched: false } });
    await apiClient.joinMatchmakingQueue('horse-9');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/matchmaking/queue`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ horseId: 'horse-9' });
  });

  it('leaveMatchmakingQueue DELETE /matchmaking/queue?horseId=... çağırır, body göndermez', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.leaveMatchmakingQueue('horse-9');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/matchmaking/queue?horseId=horse-9`);
    expect(config.method).toBe('DELETE');
    expect(config.body).toBeUndefined();
  });
});

describe('apiClient.buyMarketListing', () => {
  it('POST atar, Idempotency-Key header\'ını ekler, body göndermez (S3 hardening: buyerId artık body\'de değil, token\'dan türetilir)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { listing: { id: 'listing-1', status: 'sold' } } });

    await apiClient.buyMarketListing('listing-1', 'idem-key-1');

    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/market/listings/listing-1/buy`);
    expect(config.method).toBe('POST');
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('idem-key-1');
    expect(config.body).toBeUndefined();
  });
});

describe('apiClient.runPracticeRace', () => {
  it('POST atar, taktik alanlarını body\'e koyar ve Idempotency-Key header\'ını ekler', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    const tactic: {
      racingStyle?: RacingStyle;
      riskLevel?: RiskLevel;
      startApproach?: StartApproach;
      finalStretchPlan?: FinalStretchPlan;
    } = {
      racingStyle: 'front_runner',
      riskLevel: 'normal',
      startApproach: 'balanced',
      finalStretchPlan: 'late_sprint',
    };

    await apiClient.runPracticeRace('horse-9', tactic, 'idem-key-2');

    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/horses/horse-9/practice-race`);
    expect(config.method).toBe('POST');
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('idem-key-2');
    expect(JSON.parse(config.body as string)).toEqual(tactic);
  });

  it('dört taktik alanı da opsiyoneldir — boş bir obje geçilebilir (backend DEFAULT_RACE_TACTIC kullanır)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });

    await apiClient.runPracticeRace('horse-9', {}, 'idem-key-3');

    const [, config] = requestArgs(fetchMock);
    expect(JSON.parse(config.body as string)).toEqual({});
  });
});
