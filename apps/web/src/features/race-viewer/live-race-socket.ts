/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — `race.gateway.ts`'in
 * `/races` namespace'ine bağlanan ince bir sarmalayıcı. Frontend'in F2
 * WebSocket altyapısına (AUDIT_REPORT.md'de belgelenen boşluk) bağlanan
 * GERÇEK bir tüketicisi buydu — daha önce `apps/web/package.json`'da
 * `socket.io-client` bağımlılığı bile YOKTU.
 *
 * `socket.io-client`'a bağımlı olduğundan (`apps/api/test/api/
 * realtime.e2e-spec.ts`'teki AYNI kısıt — bkz. o dosyanın doc yorumu),
 * bu dosya bu sandbox'ta YEREL olarak `tsc`/gerçek testle TAM
 * doğrulanamaz (paket bu ortamda kurulu DEĞİL, npm registry erişimi
 * yok) — yalnızca `ts.transpileModule` ile sözdizimi kontrolü yapılabilir,
 * gerçek doğrulama GitHub Actions CI'dadır (bkz. `docs/ARCHITECTURE.md`
 * §9, `RaceScene3D.tsx`'in AYNI kısıt notu). Saf/framework-bağımsız kısım
 * (`deriveSocketOrigin`) BİLEREK ayrı bir dosyada (`live-race-url.ts`)
 * tutulur — o dosya bu sandbox'ta GERÇEKTEN `tsc --noEmit` + `tsx` ile
 * doğrulanabilir (bkz. o dosyanın doc yorumu).
 */

import { io, type Socket } from 'socket.io-client';
import type { RaceRosterEntrant, RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import { deriveSocketOrigin } from './live-race-url';

/** `race.gateway.ts`'teki `RaceFinishedPayload` alanlarıyla BİREBİR aynı (bkz. o tipin `@at-sevdalisi/shared-types` tanımı). */
export interface LiveRaceFinishedEntrant {
  horseId: string | null;
  horseName: string | null;
  botLabel: string | null;
  isBot: boolean;
  finishPosition: number | null;
  finalTimeMs: number | null;
  performanceScore: number | null;
}

export interface LiveRaceSocketHandlers {
  onRoster: (entrants: RaceRosterEntrant[]) => void;
  onTelemetry: (segments: RaceSegmentSnapshot[]) => void;
  onFinished: (entrants: LiveRaceFinishedEntrant[]) => void;
  /** `race.error` — yarış bulunamadı/yetkisiz (bkz. `race.gateway.ts` "bilgi sızdırmama" notu). */
  onError: (message: string) => void;
  /** Bağlantının kendisi kurulamadı (auth reddi, ağ hatası) — `race.error`'DAN FARKLI bir hata sınıfı. */
  onConnectError: (message: string) => void;
}

/**
 * `apiBaseUrl` — `NEXT_PUBLIC_API_URL` (ör. `http://localhost:3000/api/v1`,
 * bkz. `api-client.ts`'in EXPORT edilen `API_BASE_URL`'i). `race.subscribe`,
 * `race.gateway.ts`'in `handleConnection`'ı `client.data.playerId`'yi
 * DOLDURDUKTAN SONRA (yani `'connect'` olayında) gönderilir — bağlantı
 * kurulmadan `race.subscribe` göndermek `RaceGateway`'in HENÜZ
 * `client.data.playerId`'si olmayan bir soket üzerinde çalışmasına
 * yol açar (bkz. o dosyanın savunmacı dalı).
 *
 * Dönen `Socket`'in `disconnect()`'i, çağıran tarafın (bkz.
 * `LiveRaceViewer.tsx`) `useEffect` temizliğinde çağrılması BEKLENİR —
 * bu fonksiyon kendi başına bir yaşam döngüsü YÖNETMEZ.
 */
export function connectRaceSocket(
  apiBaseUrl: string,
  token: string,
  raceId: string,
  handlers: LiveRaceSocketHandlers,
): Socket {
  const socket = io(`${deriveSocketOrigin(apiBaseUrl)}/races`, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    socket.emit('race.subscribe', { raceId });
  });

  socket.on('connect_error', (error: Error) => {
    handlers.onConnectError(error.message);
  });

  socket.on('race.roster', (payload: { raceId: string; entrants: RaceRosterEntrant[] }) => {
    if (payload.raceId === raceId) {
      handlers.onRoster(payload.entrants);
    }
  });

  socket.on('race.telemetry', (payload: { raceId: string; segments: RaceSegmentSnapshot[] }) => {
    if (payload.raceId === raceId) {
      handlers.onTelemetry(payload.segments);
    }
  });

  socket.on('race.finished', (payload: { raceId: string; entrants: LiveRaceFinishedEntrant[] }) => {
    if (payload.raceId === raceId) {
      handlers.onFinished(payload.entrants);
    }
  });

  socket.on('race.error', (payload: { message: string }) => {
    handlers.onError(payload.message);
  });

  return socket;
}
