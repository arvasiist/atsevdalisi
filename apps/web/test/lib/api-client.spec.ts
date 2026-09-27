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
import { apiClient, API_BASE_URL, setAuthToken } from '../../src/lib/api-client';

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
 * GÜNCELLEME (AUDIT_REPORT.md T2 tamamlanışı, bu oturum): `jsdom` artık
 * `apps/web`'de bir devDependency (`.tsx` component testleri için, bkz.
 * `RaceHud.spec.tsx`/`player-context.spec.tsx`) ve `apps/web/vitest.
 * config.ts` artık kendi config'ini taşıyor — ama bu dosya BİLİNÇLİ olarak
 * hâlâ jsdom KULLANMIYOR: `api-client.ts` React'a veya DOM'a hiç dokunmaz
 * (yalnızca global `fetch`/`Headers` — Node 20'de tarayıcısız da
 * mevcuttur), bu yüzden `environment: 'node'` varsayılanı (hem kök hem
 * `apps/web`'in kendi config'inde AYNI) bu test için hâlâ doğru ve daha
 * hızlı seçimdir.
 */

/**
 * DÜZELTME (27.09.2026) — burada ÖNCEDEN yerel bir sabit vardı:
 * `const API_BASE_URL = 'http://localhost:3000/api/v1'`. Yani test, modülün
 * GERÇEK taban adresini import etmek yerine onun bir KOPYASINI tutuyordu —
 * ve o kopya YANLIŞ portu (3000; API ise 4000'de dinler) doğru kabul
 * ediyordu. Sonuç: 25 testin 15'i hatayı "beklenen davranış" olarak
 * doğruluyordu ve gerçek hata yıllarca görünmez kaldı (test yeşildi).
 *
 * Artık modülün KENDİ export ettiği `API_BASE_URL` kullanılıyor, kopya
 * YOK. Böylece test ile kaynak BİR DAHA ayrışamaz: taban adres değişirse
 * bu dosya kendiliğinden onu izler, sessizce eski değeri savunmaya devam
 * etmez. (Bu, "testi kaynağa bağla, kopyasını tutma" düzeltmesidir;
 * asıl hata `src/lib/api-client.ts`'teydi ve orada düzeltildi.)
 */
// (Burada ÖNCEDEN `const API_BASE_URL = 'http://localhost:3000/api/v1'` vardı
//  — kaldırıldı; gerekçesi yukarıdaki DÜZELTME notunda. Taban adresin
//  kendisine dair iddia, dosyanın SONUNDAKİ `describe('API taban adresi')`
//  bloğundadır.)

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

describe('apiClient.upgradeStable', () => {
  const upgradeResult = {
    newStableLevel: 2,
    newCapacity: 8,
    newBalance: { money: 12000, gems: 10 },
    cost: { currency: 'money' as const, amount: 8000 },
  };

  it('gerçek backend rotasına (/players/:id/stable/upgrade) POST atar', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: upgradeResult });
    await apiClient.upgradeStable('player-3', 'key-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-3/stable/upgrade`);
    expect(config.method).toBe('POST');
  });

  it('Idempotency-Key header\'ını gönderir (bu uç nokta PARA harcar — header ZORUNLUDUR)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: upgradeResult });
    await apiClient.upgradeStable('player-3', 'key-42');
    const [, config] = requestArgs(fetchMock);
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('key-42');
  });

  it('sunucunun döndürdüğü sonucu (yeni seviye/kapasite/bakiye/maliyet) AYNEN döner', async () => {
    stubFetchOnce({ success: true, data: upgradeResult });
    await expect(apiClient.upgradeStable('player-3', 'key-1')).resolves.toEqual(upgradeResult);
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

describe('apiClient.getLeaderboard', () => {
  const rows = [
    { rank: 1, playerId: 'player-1', displayName: 'Ayşe', score: 230, raceCount: 1 },
    { rank: 2, playerId: 'player-2', displayName: 'Mehmet', score: 60, raceCount: 3 },
  ];

  it('GET /leaderboard çağırır ve sorgu parametresi EKLEMEZ', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: rows });
    await apiClient.getLeaderboard();
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/leaderboard`);
    // Sorgu string'i OLMAMALI: uç nokta `limit` parametresi kabul etmez
    // (sunucu sabit 50 satır döner, bkz. `get-leaderboard.use-case.ts`).
    expect(url).not.toContain('?');
    expect(config.method ?? 'GET').toBe('GET');
  });

  it('sunucudan gelen satırları AYNEN döner — istemci sıralamayı yeniden hesaplamaz', async () => {
    stubFetchOnce({ success: true, data: rows });
    await expect(apiClient.getLeaderboard()).resolves.toEqual(rows);
  });
});

describe('API taban adresi', () => {
  it('varsayılan port, API sunucusunun dinlediği portla aynı olmalı (4000)', () => {
    // Bu iddia, yukarıda anlatılan hatanın SINIFINI hedefler. Kritik nokta
    // şu: port yanlış olsa bile DİĞER tüm testler yine geçer, çünkü hepsi
    // aynı `API_BASE_URL` sabitine göre yazılmıştır — yani yanlış bir port
    // kendi kendini doğrular. Bu yüzden portun KENDİSİ ayrıca sabitlenir.
    // Ortam değişkeni tanımlıysa atlanır: o durumda adres bilerek
    // dışarıdan verilmiştir ve varsayılanla ilgili bir iddia anlamsız olur.
    if (process.env.NEXT_PUBLIC_API_URL) {
      return;
    }
    expect(API_BASE_URL).toBe('http://localhost:4000/api/v1');
  });
});
