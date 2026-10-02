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
import { ApiError, apiClient, API_BASE_URL, setAuthToken, setSessionRefresher } from '../../src/lib/api-client';

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
  username: 'harbi_seyis',
  displayName: 'Harbi Seyis',
  avatarId: null,
  level: 3,
  xp: 120,
  money: 5000,
  gems: 10,
  // 28.09.2026: `PlayerSummary`ye eklendi (üst bar yönetim bağlantısı).
  // Burada `false` — testin konusu yetki değil, istek gövdesi/başlıkları.
  isAdmin: false,
  isModerator: false,
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
  // `username` FIXTURE'DA ZORUNLUDUR (29.09.2026): sıralama ekranı satır
  // adını `/profile/${row.username}`e bağlar. Bu dosya `apps/web/tsconfig.json`
  // kapsamı DIŞINDADIR (o tsconfig yalnızca `src`i tip denetler), yani eksik
  // bir alan burada DERLEME hatası vermez — yalnızca ekranı sessizce
  // `/profile/undefined`e bağlardı.
  const rows = [
    { rank: 1, playerId: 'player-1', username: 'ayse_42', displayName: 'Ayşe', score: 230, raceCount: 1 },
    { rank: 2, playerId: 'player-2', username: 'mehmet_7', displayName: 'Mehmet', score: 60, raceCount: 3 },
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

/**
 * brief §34 yönetim uçları (28.09.2026). Bu blok YALNIZCA sözleşmeyi
 * kilitler: yol, metot ve gövde. Yetki, geçiş kuralları ve iade tutarı
 * SUNUCUNUN işidir ve orada test edilir (`admin.e2e-spec.ts`) — burada
 * "istemci doğru adrese doğru şeyi gönderiyor mu" sorusu sorulur.
 */
describe('apiClient yönetim uçları', () => {
  it('beş liste ucu da doğru yola GET atar ve `limit` UYDURMAZ', async () => {
    const cases: ReadonlyArray<readonly [() => Promise<unknown>, string]> = [
      [() => apiClient.listAdminReports(), '/admin/reports'],
      [() => apiClient.listAdminPlayers(), '/admin/players'],
      [() => apiClient.listAdminRaces(), '/admin/races'],
      [() => apiClient.listAdminTransactions(), '/admin/transactions'],
      [() => apiClient.listAdminAuditLog(), '/admin/audit-log'],
    ];

    for (const [call, path] of cases) {
      const fetchMock = stubFetchOnce({ success: true, data: {} });
      await call();
      const [url, config] = requestArgs(fetchMock);
      expect(url).toBe(`${API_BASE_URL}${path}`);
      // Sorgu string'i OLMAMALI: liste boyutları `config/admin.config.json`
      // dan gelir, istemcinin seçeceği bir şey değildir.
      expect(url).not.toContain('?');
      expect(config.method ?? 'GET').toBe('GET');
      vi.unstubAllGlobals();
    }
  });

  it('şikâyet durumu PATCH gövdesiyle gönderilir (yol parametresi rapor kimliğidir)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });

    await apiClient.updateReportStatus('report-7', 'reviewing');

    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/admin/reports/report-7`);
    expect(config.method).toBe('PATCH');
    expect(JSON.parse(config.body as string)).toEqual({ status: 'reviewing' });
  });

  it('yarış iptali POSTtur ve Idempotency-Key GÖNDERMEZ (tekrar koruması durum geçişidir)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });

    await apiClient.cancelAdminRace('race-3');

    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/admin/races/race-3/cancel`);
    expect(config.method).toBe('POST');
    // `depositFunds`in AKSİNE: çift iadeyi `scheduled → cancelled` geçişi
    // engeller, yani anahtar gereksizdir (gerekçe: `api-client.ts` doc yorumu).
    expect((config.headers as Headers).get('Idempotency-Key')).toBeNull();
  });
});

/**
 * 28.09.2026 — `ApiError`. `request()` bugüne kadar yalnızca `message`ı
 * atıyor, sunucunun MAKİNE kodunu (`code`) çöpe atıyordu. Yönetim ekranı
 * "yetkiniz yok" ile "sunucu patladı"yı ayırt etmek zorunda olduğu için
 * `code` artık taşınır — ve bu test onu KİLİTLER.
 */
describe('ApiError', () => {
  it('sunucu zarfındaki `code` ve HTTP durumu hataya taşınır', async () => {
    stubFetchOnce(
      { success: false, error: { code: 'ADMIN_REQUIRED', message: 'Yönetici yetkisi gerekli' } },
      { ok: false, status: 403 },
    );

    const err = await apiClient.listAdminReports().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('ADMIN_REQUIRED');
    expect((err as ApiError).status).toBe(403);
    // `message` KORUNUR — `instanceof Error` ile yakalayan mevcut
    // çağıranların hiçbiri bozulmaz.
    expect((err as Error).message).toBe('Yönetici yetkisi gerekli');
  });

  it('zarf taşımayan yanıtta `code` null olur — uydurma kod ÜRETİLMEZ', async () => {
    stubFetchOnce({ success: false }, { ok: false, status: 502 });

    const err = await apiClient.listAdminReports().catch((e: unknown) => e);

    expect((err as ApiError).code).toBeNull();
    expect((err as ApiError).status).toBe(502);
  });
});

describe('apiClient.getFarm', () => {
  const summary = {
    ownerId: 'player-1',
    staffCapacity: 3,
    facilities: [
      {
        type: 'warehouse' as const,
        level: 0,
        maxLevel: 2,
        bonusValue: 0,
        nextUpgrade: { nextLevel: 1, cost: { currency: 'money' as const, amount: 4000 } },
      },
    ],
  };

  it('GET /players/:id/farm çağırır (sorgu parametresi EKLEMEZ)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: summary });
    await apiClient.getFarm('player-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/farm`);
    expect(url).not.toContain('?');
    expect(config.method ?? 'GET').toBe('GET');
  });

  it('seviye/tavan/bonus/maliyet alanlarını AYNEN döner — istemci hiçbir sayıyı hesaplamaz', async () => {
    stubFetchOnce({ success: true, data: summary });
    await expect(apiClient.getFarm('player-1')).resolves.toEqual(summary);
  });
});

describe('apiClient.upgradeFacility', () => {
  const result = {
    facility: {
      type: 'warehouse' as const,
      level: 1,
      maxLevel: 2,
      bonusValue: 0.05,
      nextUpgrade: { nextLevel: 2, cost: { currency: 'money' as const, amount: 10000 } },
    },
    newBalance: { money: 1000, gems: 10 },
    cost: { currency: 'money' as const, amount: 4000 },
  };

  it('gerçek backend rotasına (/players/:id/farm/facilities/:type/upgrade) POST atar — tip URL\'e gömülür, body GÖNDERİLMEZ', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: result });
    await apiClient.upgradeFacility('player-1', 'warehouse', 'key-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/farm/facilities/warehouse/upgrade`);
    expect(config.method).toBe('POST');
    expect(config.body).toBeUndefined();
  });

  it('Idempotency-Key header\'ını gönderir (bu uç nokta PARA harcar — header ZORUNLUDUR)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: result });
    await apiClient.upgradeFacility('player-1', 'warehouse', 'key-77');
    const [, config] = requestArgs(fetchMock);
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('key-77');
  });

  it('sunucunun döndürdüğü sonucu (tesis/yeni bakiye/maliyet) AYNEN döner', async () => {
    stubFetchOnce({ success: true, data: result });
    await expect(apiClient.upgradeFacility('player-1', 'warehouse', 'key-1')).resolves.toEqual(result);
  });
});

describe('apiClient — bildirimler + yarış daveti (brief §28/§16)', () => {
  /**
   * Beş uç noktanın URL/method/gövde eşleşmesi. `apps/api`'nin
   * `notification.controller.ts`'iyle BİREBİR olmalıdır — bu testin
   * koruduğu şey tam olarak o eşleşmedir (bkz. dosya başı T2 notu: bir
   * uç nokta adı sessizce kayarsa HİÇBİR test kırılmazdı).
   */

  it('getNotifications GET /players/:id/notifications çağırır', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { notifications: [], unreadCount: 0 } });
    await apiClient.getNotifications('player-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/notifications`);
    expect(config.method).toBe('GET');
  });

  it('markAllNotificationsRead POST /players/:id/notifications/read-all çağırır ve GÖVDE GÖNDERMEZ', async () => {
    // Gövde gönderilmemesi bilinçlidir: sunucu yoldaki `:id`den başka
    // hiçbir girdi almaz (`notification.controller.ts`), ve bu uç nokta
    // `assertSelf` ile korunur — yani "kimin bildirimleri" sorusunun
    // cevabı GÖVDEDEN değil TOKEN'dan gelir.
    const fetchMock = stubFetchOnce({ success: true, data: { markedCount: 3 } });
    await apiClient.markAllNotificationsRead('player-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/notifications/read-all`);
    expect(config.method).toBe('POST');
    expect(config.body).toBeUndefined();
  });

  it('markNotificationRead POST /players/:id/notifications/:notificationId/read çağırır', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.markNotificationRead('player-1', 'notif-9');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/notifications/notif-9/read`);
    expect(config.method).toBe('POST');
  });

  it('sendRaceInvite POST /players/:id/race-invites çağırır, body\'de inviteeId+raceId gönderir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.sendRaceInvite('player-1', 'player-2', 'race-7');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/race-invites`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ inviteeId: 'player-2', raceId: 'race-7' });
  });

  it('respondRaceInvite POST /players/:id/race-invites/:inviteId/respond çağırır, body\'de action gönderir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { inviteId: 'inv-1', status: 'accepted' } });
    await apiClient.respondRaceInvite('player-1', 'inv-1', 'accept');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/player-1/race-invites/inv-1/respond`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ action: 'accept' });
  });

  it('HİÇBİRİ Idempotency-Key göndermez — bu uçların hiçbiri para/mülkiyet değiştirmez', async () => {
    // `accept` YARIŞA KATILMAK DEĞİLDİR (giriş ücreti tek yoldan,
    // `POST /races/:id/join`, geçer). Bu iddia, ileride birinin buraya
    // yanlışlıkla idempotency header'ı ekleyip eklemediğini yakalar:
    // eklemek zararsız görünür ama interceptor'ın `idempotency_keys`
    // tablosunu bu uçlarla DOLDURURDU.
    const cases: ReadonlyArray<() => Promise<unknown>> = [
      () => apiClient.markAllNotificationsRead('player-1'),
      () => apiClient.markNotificationRead('player-1', 'notif-9'),
      () => apiClient.sendRaceInvite('player-1', 'player-2', 'race-7'),
      () => apiClient.respondRaceInvite('player-1', 'inv-1', 'decline'),
    ];
    for (const call of cases) {
      const fetchMock = stubFetchOnce({ success: true, data: {} });
      await call();
      const [, config] = requestArgs(fetchMock);
      expect((config.headers as Headers).has('Idempotency-Key')).toBe(false);
    }
  });
});

describe('apiClient.getPlayerProfile (brief §24 — /profile/:username)', () => {
  it('kullanıcı adını YOL PARAMETRESİ olarak gönderir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getPlayerProfile('harbi_seyis');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/profile/harbi_seyis`);
  });

  it('kullanıcı adını URL İÇİN KODLAR — ham birleştirme farklı bir rotaya giderdi', async () => {
    // Gerçek bir senaryo: kullanıcı adı `%`/`/`/boşluk içerebilir. Ham
    // birleştirmede `a b` → `/players/profile/a b` (bozuk URL), `a/b` ise
    // TAMAMEN BAŞKA bir rota olurdu. Test bu yüzden kodlanmış hâli bekler.
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getPlayerProfile('a b/c');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/profile/a%20b%2Fc`);
    expect(url).not.toContain(' ');
  });

  it('GET kullanır ve GÖVDE göndermez', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getPlayerProfile('harbi_seyis');
    const [, config] = requestArgs(fetchMock);
    // `method` hiç verilmezse `fetch` varsayılanı GET'tir; iki durumu da
    // kabul etmek yerine açıkça yoklanır ki yanlışlıkla POST'a dönmesin.
    expect(config.method ?? 'GET').toBe('GET');
    expect(config.body).toBeUndefined();
  });

  it('token GEREKTİRMEZ — token yokken de Authorization header\'ı eklenmez', async () => {
    // Uç nokta `@Public()`'tir: kimliği doğrulanmamış bir ziyaretçi de
    // profili görebilmelidir (brief §24). `setAuthToken(null)` zaten
    // `beforeEach`'te yapılıyor; iddia bunun SONUCUNU sabitler.
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getPlayerProfile('harbi_seyis');
    const [, config] = requestArgs(fetchMock);
    expect((config.headers as Headers).has('Authorization')).toBe(false);
  });
});

describe('apiClient.getWallet (brief §20/§22/§35 — /wallet)', () => {
  it('`before` imleci verilirse `limit` ile birlikte sorgu dizesine eklenir (30.09.2026)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getWallet('p-1', 20, 'cursor-1');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/wallet?limit=20&before=cursor-1`);
  });

  it('oyuncu kimliğini YOL PARAMETRESİ olarak gönderir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getWallet('p-1');
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/wallet`);
  });

  it('`limit` VERİLMEZSE sorgu dizesi EKLENMEZ (sunucunun varsayılanı uygulanır)', async () => {
    // Önemli: `?limit=undefined` yazmak sunucuda ayrıştırma hatası ya da
    // sessizce NaN üretebilir. Yokluk, yokluk olarak gönderilir.
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getWallet('p-1');
    const [url] = requestArgs(fetchMock);
    expect(url).not.toContain('?');
    expect(url).not.toContain('limit');
  });

  it('`limit` verilirse sorgu dizesine eklenir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getWallet('p-1', 20);
    const [url] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/wallet?limit=20`);
  });

  it('GET kullanır ve `Idempotency-Key` GÖNDERMEZ (okuma yoludur)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.getWallet('p-1');
    const [, config] = requestArgs(fetchMock);
    expect(config.method ?? 'GET').toBe('GET');
    expect(config.body).toBeUndefined();
    expect((config.headers as Headers).has('Idempotency-Key')).toBe(false);
  });
});

describe('apiClient.depositFunds (brief §20 DEPOSIT — PARA YOLU)', () => {
  it('POST eder ve tutarı GÖVDEDE taşır', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.depositFunds('p-1', 5000, 'key-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/wallet/deposit`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ amount: 5000 });
  });

  it('`Idempotency-Key` BAŞLIĞINI aynen geçirir', async () => {
    // Bu iddia dilimin ASIL güvencesidir: başlık düşerse sunucu
    // `IdempotencyInterceptor`ı devreye sokamaz ve ağ hatasından sonraki
    // yeniden deneme deftere İKİNCİ bir `mock_deposit` satırı yazardı —
    // hiçbir yerde hata üretmeden.
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.depositFunds('p-1', 5000, 'anahtar-abc');
    const [, config] = requestArgs(fetchMock);
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('anahtar-abc');
  });

  it('gövde YALNIZCA `amount` taşır — birim istemcide SEÇİLMEZ', async () => {
    // Uç nokta Elmas yatırmayı kabul etmez; istemci `currency` gönderirse
    // sunucu onu yok sayar ve ekranda seçilen birim ile yatan birim
    // ayrışırdı. Birim yanıttaki `currency` alanından OKUNUR.
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.depositFunds('p-1', 100, 'key-1');
    const [, config] = requestArgs(fetchMock);
    expect(Object.keys(JSON.parse(config.body as string))).toEqual(['amount']);
  });
});

describe('apiClient.claimDailyReward (brief §37)', () => {
  it('POST eder, gövde GÖNDERMEZ ve `Idempotency-Key` EKLEMEZ', async () => {
    // Günlük ödülün kendi tekrar koruması vardır (cooldown → 409), bu
    // yüzden anahtar GEREKSİZDİR. Test bunu sabitler ki birinin
    // "her POST'a anahtar koyalım" refleksiyle eklediği fazladan başlık
    // fark edilsin.
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.claimDailyReward('p-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/daily-reward`);
    expect(config.method).toBe('POST');
    expect(config.body).toBeUndefined();
    expect((config.headers as Headers).has('Idempotency-Key')).toBe(false);
  });
});

describe('apiClient blok / şikâyet (brief §33 — istemci tarafı, 29.09.2026)', () => {
  /**
   * Bu dört metot, sunucuda §13.16'dan beri hazır olan dört ucun İLK
   * istemci tüketicisidir. Testler URL + method + gövde sözleşmesini
   * sabitler; asıl davranış (yetki, idempotency, 404) `moderation.e2e-spec.ts`
   * ve `body-uuid-shape.e2e-spec.ts`te kanıtlanmıştır.
   */

  it('listBlockedPlayers KENDİ listesini GET eder', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.listBlockedPlayers('p-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/blocks`);
    expect(config.method).toBe('GET');
  });

  it('blockPlayer POST eder ve `blockedId`yi GÖVDEDE taşır', async () => {
    // `blockedId` GÖVDE alanıdır (yol parametresi DEĞİL) — sunucudaki
    // `ParseUUIDPipe` ona uzanmaz ve orada ayrıca bir `isUUID` kapısı
    // vardır. Gövde şekli bozulursa o kapı 400 döner ve engelleme sessizce
    // çalışmaz hâle gelir.
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.blockPlayer('p-1', 'p-2');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/blocks`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ blockedId: 'p-2' });
  });

  it('unblockPlayer DELETE eder ve engellenen kimliği YOLDA taşır', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.unblockPlayer('p-1', 'p-2');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/blocks/p-2`);
    expect(config.method).toBe('DELETE');
  });

  it('reportPlayer gövdede `reportedId` ve `category` gönderir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.reportPlayer('p-1', 'p-2', 'harassment');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/reports`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ reportedId: 'p-2', category: 'harassment' });
  });

  it('reportPlayer BOŞ gerekçeyi gövdeye KOYMAZ', async () => {
    // Sunucu eksik gerekçeyi `null`a indirger, yani `reason: ''` göndermek
    // sözleşmeyi değiştirmez — ama moderasyon kuyruğunda "gerekçe yazılmış"
    // izlenimi verirdi. Boş dize ile `undefined` AYNI davranışı üretmelidir.
    const withEmpty = stubFetchOnce({ success: true, data: {} });
    await apiClient.reportPlayer('p-1', 'p-2', 'spam', '');
    const [, emptyConfig] = requestArgs(withEmpty);
    expect(Object.keys(JSON.parse(emptyConfig.body as string)).sort()).toEqual(['category', 'reportedId']);

    const withText = stubFetchOnce({ success: true, data: {} });
    await apiClient.reportPlayer('p-1', 'p-2', 'spam', 'reklam atıyor');
    const [, textConfig] = requestArgs(withText);
    expect(JSON.parse(textConfig.body as string)).toEqual({
      reportedId: 'p-2',
      category: 'spam',
      reason: 'reklam atıyor',
    });
  });

  it('blok/şikâyet uçlarının HİÇBİRİ `Idempotency-Key` EKLEMEZ', async () => {
    // Bu dört uç para/mülkiyet değiştirmez. Engelleme zaten idempotenttir;
    // şikâyet ise bilinçli olarak DEĞİLDİR (tekrarlayan şikâyet moderasyon
    // için bir sinyaldir) — oraya anahtar koymak o sinyali sustururdu.
    // Test, "her POST'a anahtar koyalım" refleksini yakalar.
    const calls: Array<() => Promise<unknown>> = [
      () => apiClient.blockPlayer('p-1', 'p-2'),
      () => apiClient.unblockPlayer('p-1', 'p-2'),
      () => apiClient.reportPlayer('p-1', 'p-2', 'spam'),
    ];
    for (const call of calls) {
      const fetchMock = stubFetchOnce({ success: true, data: {} });
      await call();
      const [, config] = requestArgs(fetchMock);
      expect((config.headers as Headers).has('Idempotency-Key')).toBe(false);
    }
  });
});

describe('apiClient çiftleştirme (brief §18 — istemci tarafı, 29.09.2026)', () => {
  /**
   * `POST /players/:id/breeding` — soy ağacı zincirinin YAZMA yarısı ve bir
   * PARA YOLU (damızlık ücreti transferi + iki defter satırı).
   *
   * Burada sabitlenen iki şey var ve ikisi de sessiz bozulabilecek türden:
   * (1) gövde YALNIZCA üç alan taşır — sahiplik/uygunluk/stat üretimi
   * sunucudadır, istemci hiçbir sayı göndermez; (2) `Idempotency-Key`
   * başlığı GERÇEKTEN gider — eksik olsaydı sunucu 400
   * `IDEMPOTENCY_KEY_REQUIRED` döner ve çiftleştirme hiç çalışmazdı.
   */
  it('breedHorses doğru URL/method/gövde ile POST eder', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.breedHorses('p-1', 'mare-1', 'stallion-1', 'Yıldız', 'key-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/breeding`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({
      mareId: 'mare-1',
      stallionId: 'stallion-1',
      foalName: 'Yıldız',
    });
  });

  it('breedHorses `Idempotency-Key` başlığını taşır (para yolu — ZORUNLU)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.breedHorses('p-1', 'mare-1', 'stallion-1', 'Yıldız', 'key-42');
    const [, config] = requestArgs(fetchMock);
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('key-42');
  });
});

describe('apiClient jokey (brief §13 — istemci tarafı, 29.09.2026)', () => {
  /**
   * Jokey zincirinin dört ucu: vitrin (`GET /jockeys`), oyuncunun kendi
   * jokeyi (`GET /players/:id/jockey`), kiralama (`POST .../hire`, PARA
   * YOLU) ve serbest bırakma (`POST .../release`, PARA YOLU **DEĞİL**).
   *
   * Burada sabitlenen şey URL'ler ve `Idempotency-Key`'in YOKLUĞUDUR:
   * sunucu o başlığı bilerek okumaz — çift kiralamayı/bırakmayı
   * `jockeys.owner_id` durum geçişi engeller (409). İstemci anahtar
   * gönderseydi, "korunuyorum" sanan bir yanılsama doğardı; test bunu
   * kilitler. (`POST /admin/races/:id/cancel`ın iddiasıyla AYNI desen.)
   */
  it('getJockeys vitrini GET eder ve `Idempotency-Key` GÖNDERMEZ', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.getJockeys();
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/jockeys`);
    // `?? 'GET'` — `request()` çağıran `method` vermezse `config.method`
    // tanımsızdır ve fetch varsayılanı GET'tir (dosyanın geri kalanındaki
    // aynı kalıp).
    expect(config.method ?? 'GET').toBe('GET');
    expect((config.headers as Headers).has('Idempotency-Key')).toBe(false);
  });

  it('getPlayerJockey oyuncunun KENDİ jokeyini GET eder (kimlik yoldan, sahiplik sunucuda)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: null });
    await apiClient.getPlayerJockey('p-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/players/p-1/jockey`);
    expect(config.method ?? 'GET').toBe('GET');
  });

  it('hireJockey POST eder, gövde GÖNDERMEZ ve `Idempotency-Key` EKLEMEZ', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.hireJockey('j-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/jockeys/j-1/hire`);
    expect(config.method).toBe('POST');
    // Ödeyen taraf token'dan gelir — gövdede bir `playerId` olsaydı bir
    // oyuncu BAŞKASININ bakiyesinden jokey kiralayabilirdi.
    expect(config.body).toBeUndefined();
    expect((config.headers as Headers).has('Idempotency-Key')).toBe(false);
  });

  it('releaseJockey POST eder ve `Idempotency-Key` EKLEMEZ (tekrar koruması durum geçişidir)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.releaseJockey('j-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/jockeys/j-1/release`);
    expect(config.method).toBe('POST');
    expect((config.headers as Headers).has('Idempotency-Key')).toBe(false);
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

describe('apiClient ücretli lobi yarışı (30.09.2026 — istemci tarafı)', () => {
  /**
   * Beş uç: liste, açma, katılma (PARA YOLU), hazır (para yolu DEĞİL),
   * ayrılma (PARA YOLU, iade). Sabitlenen şey URL/method/gövde ve
   * `Idempotency-Key`in YALNIZCA para yollarında gönderilmesidir: katılma ve
   * ayrılmada anahtar yoksa sunucu 400 döner; hazır/açmada gönderilseydi
   * "korunuyorum" yanılsaması doğardı (sunucu okumaz).
   */
  it('listLobbyRaces GET /races eder ve anahtar GÖNDERMEZ', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: [] });
    await apiClient.listLobbyRaces();
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/races`);
    expect(config.method ?? 'GET').toBe('GET');
    expect((config.headers as Headers).get('Idempotency-Key')).toBeNull();
  });

  it('createLobbyRace gövdeyi POST /races ile gönderir, anahtar GÖNDERMEZ', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    const body = {
      name: 'Kupa',
      fieldSize: 8,
      maxPlayers: 8,
      entryFee: 50,
      raceType: 'paid' as const,
      startTime: '2026-09-30T13:00:00.000Z',
      surface: 'grass' as const,
      weather: 'sunny' as const,
      distanceMeters: 1600,
      tribuneFee: 0,
      spectatorCapacity: 500,
    };
    await apiClient.createLobbyRace(body);
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/races`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual(body);
    expect((config.headers as Headers).get('Idempotency-Key')).toBeNull();
  });

  it('joinLobbyRace at + anahtarla POST eder (para yolu — ZORUNLU)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.joinLobbyRace('race-1', { horseId: 'horse-1' }, 'key-7');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/races/race-1/join`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ horseId: 'horse-1' });
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('key-7');
  });

  it('setLobbyEntryReady durumu gönderir ve anahtar GÖNDERMEZ', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.setLobbyEntryReady('race-1', 'ready');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/races/race-1/ready`);
    expect(JSON.parse(config.body as string)).toEqual({ status: 'ready' });
    expect((config.headers as Headers).get('Idempotency-Key')).toBeNull();
  });

  it('leaveLobbyRace anahtarla POST eder (iade — ZORUNLU)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: {} });
    await apiClient.leaveLobbyRace('race-1', 'key-9');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/races/race-1/leave`);
    expect(config.method).toBe('POST');
    expect((config.headers as Headers).get('Idempotency-Key')).toBe('key-9');
  });
});

describe('apiClient e-posta + şifre girişi (30.09.2026)', () => {
  it('loginWithPassword gövdeyi POST /auth/login/password ile gönderir', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { token: 't', player: samplePlayer } });
    await apiClient.loginWithPassword('ali@ornek.com', 'sifre-12345');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/login/password`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ email: 'ali@ornek.com', password: 'sifre-12345' });
  });

  it('saveAccount POST /auth/credentials — oyuncu kimliği GÖVDEDE YOK (token\'dan gelir)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { email: 'ali@ornek.com' } });
    await apiClient.saveAccount('ali@ornek.com', 'sifre-12345');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/credentials`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ email: 'ali@ornek.com', password: 'sifre-12345' });
  });

  it('getAccountCredentials GET /auth/credentials', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { email: null, linkedProviders: [] } });
    await apiClient.getAccountCredentials();
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/credentials`);
    expect(config.method ?? 'GET').toBe('GET');
  });
});

describe('apiClient Google girişi (01.10.2026)', () => {
  it('getAuthProviders GET /auth/providers', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { googleClientId: null } });
    expect(await apiClient.getAuthProviders()).toEqual({ googleClientId: null });
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/providers`);
    expect(config.method ?? 'GET').toBe('GET');
  });

  it('loginWithGoogle POST /auth/login — sağlayıcı google, belge gövdede', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { token: 't', player: samplePlayer } });
    await apiClient.loginWithGoogle('google-belgesi');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/login`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ provider: 'google', idToken: 'google-belgesi' });
  });

  it('linkGoogle POST /auth/link — oyuncu kimliği GÖVDEDE YOK (token\'dan gelir)', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { provider: 'google' } });
    await apiClient.linkGoogle('google-belgesi');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/link`);
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body as string)).toEqual({ provider: 'google', idToken: 'google-belgesi' });
  });
});

describe('apiClient şifre sıfırlama (30.09.2026)', () => {
  it('requestPasswordReset POST /auth/password-reset/request', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { accepted: true } });
    await apiClient.requestPasswordReset('ali@ornek.com');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/password-reset/request`);
    expect(JSON.parse(config.body as string)).toEqual({ email: 'ali@ornek.com' });
  });

  it('confirmPasswordReset POST /auth/password-reset/confirm', async () => {
    const fetchMock = stubFetchOnce({ success: true, data: { reset: true } });
    await apiClient.confirmPasswordReset('tok', 'yeni-sifre-1');
    const [url, config] = requestArgs(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/password-reset/confirm`);
    expect(JSON.parse(config.body as string)).toEqual({ token: 'tok', password: 'yeni-sifre-1' });
  });
});

describe('OTURUM YENİLEME — 401 → bir kez yenile + tekrar dene (02.10.2026)', () => {
  afterEach(() => {
    setSessionRefresher(null);
  });

  it('401 alan korumalı istek yenilenen token\'la BİR KEZ tekrarlanır', async () => {
    setAuthToken('eski');
    const refresher = vi.fn(async () => {
      setAuthToken('yeni');
      return 'yeni';
    });
    setSessionRefresher(refresher);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }, { ok: false, status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'p1' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.getPlayer('p1')).resolves.toEqual({ id: 'p1' });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retried = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(new Headers(retried.headers).get('Authorization')).toBe('Bearer yeni');
  });

  it('yenileme başarısızsa 401 ApiError fırlar ve sonsuz döngü olmaz', async () => {
    setAuthToken('eski');
    setSessionRefresher(async () => null);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }, { ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.getPlayer('p1')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('eşzamanlı 401\'ler TEK yenilemeyi paylaşır (refresh token iki kez harcanmaz)', async () => {
    setAuthToken('eski');
    let release: (value: string) => void = () => undefined;
    const refresher = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = (value) => {
            setAuthToken(value);
            resolve(value);
          };
        }),
    );
    setSessionRefresher(refresher);
    const unauthorized = jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }, { ok: false, status: 401 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValue(jsonResponse({ success: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const first = apiClient.getPlayer('p1');
    const second = apiClient.getPlayer('p2');
    await vi.waitFor(() => expect(refresher).toHaveBeenCalledTimes(1));
    release('yeni');
    await Promise.all([first, second]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('yenileme ucunun kendisi ve giriş uçları 401de yenileyiciyi ÇAĞIRMAZ', async () => {
    setAuthToken('eski');
    const refresher = vi.fn(async () => 'yeni');
    setSessionRefresher(refresher);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: false, error: { code: 'X', message: 'x' } }, { ok: false, status: 401 })),
    );
    await expect(apiClient.refreshSession('r')).rejects.toBeInstanceOf(ApiError);
    await expect(apiClient.loginWithPassword('a@b.c', 'sifre')).rejects.toBeInstanceOf(ApiError);
    await expect(apiClient.upgradeSession()).rejects.toBeInstanceOf(ApiError);
    expect(refresher).not.toHaveBeenCalled();
  });

  it('oturum uçları doğru rota/yöntemi kullanır', async () => {
    setAuthToken('t');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.refreshSession('r1');
    await apiClient.logout();
    await apiClient.logoutAll();
    await apiClient.listSessions();
    await apiClient.revokeSession('s-1');
    const calls = fetchMock.mock.calls.map(([url, config]) => [String(url).replace(API_BASE_URL, ''), (config as RequestInit).method ?? 'GET']);
    expect(calls).toEqual([
      ['/auth/refresh', 'POST'],
      ['/auth/logout', 'POST'],
      ['/auth/logout-all', 'POST'],
      ['/auth/sessions', 'GET'],
      ['/auth/sessions/s-1', 'DELETE'],
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({ refreshToken: 'r1' });
  });
});

describe('E-POSTA DOĞRULAMA uçları (02.10.2026)', () => {
  it('istek ve onay doğru rota/yöntem/gövdeyi kullanır', async () => {
    setAuthToken('t');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.requestEmailVerification();
    await apiClient.verifyEmail('dogrulama-1');
    const calls = fetchMock.mock.calls.map(([url, config]) => [String(url).replace(API_BASE_URL, ''), (config as RequestInit).method]);
    expect(calls).toEqual([
      ['/auth/email/verification', 'POST'],
      ['/auth/email/verify', 'POST'],
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body))).toEqual({ token: 'dogrulama-1' });
  });
});

describe('HESAP SİLME uçları (02.10.2026)', () => {
  it('kontrol GET, silme POST; şifre yalnızca verilirse gövdeye girer', async () => {
    setAuthToken('t');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.getAccountDeletionCheck();
    await apiClient.deleteAccount('harbi_seyis');
    await apiClient.deleteAccount('harbi_seyis', 'sifre-12345');
    const calls = fetchMock.mock.calls.map(([url, config]) => [String(url).replace(API_BASE_URL, ''), (config as RequestInit).method ?? 'GET']);
    expect(calls).toEqual([
      ['/account/deletion', 'GET'],
      ['/account/delete', 'POST'],
      ['/account/delete', 'POST'],
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body))).toEqual({ confirmUsername: 'harbi_seyis' });
    expect(JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body))).toEqual({
      confirmUsername: 'harbi_seyis',
      password: 'sifre-12345',
    });
  });
});

describe('MODERASYON + DUYURU uçları (02.10.2026)', () => {
  it('doğru rota/yöntem/gövde', async () => {
    setAuthToken('t');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.sanctionPlayer('p1', { kind: 'suspend', reason: 'spam yapıyor', durationHours: 2 });
    await apiClient.getPlayerSanctions('p1');
    await apiClient.liftSanction('s1', 'itiraz kabul');
    await apiClient.setPlayerRole('p1', 'moderator');
    await apiClient.listAdminAnnouncements();
    await apiClient.createAnnouncement({ title: 'Bakım', body: 'metin', level: 'maintenance' });
    await apiClient.archiveAnnouncement('a1');
    await apiClient.getAnnouncements();
    const calls = fetchMock.mock.calls.map(([url, config]) => [String(url).replace(API_BASE_URL, ''), (config as RequestInit).method ?? 'GET']);
    expect(calls).toEqual([
      ['/admin/players/p1/sanctions', 'POST'],
      ['/admin/players/p1/sanctions', 'GET'],
      ['/admin/sanctions/s1/lift', 'POST'],
      ['/admin/players/p1/role', 'PUT'],
      ['/admin/announcements', 'GET'],
      ['/admin/announcements', 'POST'],
      ['/admin/announcements/a1/archive', 'POST'],
      ['/announcements', 'GET'],
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      kind: 'suspend',
      reason: 'spam yapıyor',
      durationHours: 2,
    });
  });
});
