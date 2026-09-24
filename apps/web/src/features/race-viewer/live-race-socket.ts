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
 *
 * **Reconnection dilimi (bu turda EKLENDİ):** `race.gateway.ts`'in doc
 * yorumu ("Kapsam DIŞI" bölümü) ŞÖYLE diyordu: bağlantı koparsa istemci
 * `race.subscribe`'ı BAŞTAN çağırır, backend'in paylaşılan
 * `RacePlaybackSession`'ı sayesinde bu bir "yakalama" yayınından
 * FAYDALANIR. `socket.io-client`'ın KENDİ otomatik yeniden bağlanması
 * (varsayılan: `reconnection: true`) zaten `'connect'` olayını HER
 * yeniden bağlanmada TEKRAR ateşler — bu yüzden aşağıdaki `socket.
 * on('connect', ...)` (BİR KEZ eklenen ama HER bağlanmada çalışan bir
 * dinleyici) `race.subscribe`'ı otomatik olarak tekrar gönderir, YENİ bir
 * kod GEREKTİRMEZ. Eksik olan tek şey, istemci tarafının bunu KULLANICIYA
 * GÖSTERMESİYDİ — bağlantı koparsa `LiveRaceViewer` hiçbir görsel geri
 * bildirim VERMİYORDU (ekranda son bilinen kare donuk kalıyordu, sanki
 * her şey normalmiş gibi). Yeni `onDisconnected` handler'ı tam olarak bu
 * boşluğu kapatır — `socket.io-client`'ın `'disconnect'` olayına bağlanır
 * (bağlantı koptuğunda, otomatik yeniden bağlanma denemesi BAŞLAMADAN
 * ÖNCE ateşlenir); `LiveRaceViewer.tsx` bunu `liveStatus`'u
 * `'reconnecting'`ye çevirmek için kullanır (bkz. `RaceHud.tsx`'in
 * güncellenmiş `RaceLiveStatus` tipi).
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
  /** Bağlantının kendisi HİÇ kurulamadı (auth reddi, ilk el sıkışma ağ hatası) — `race.error`'DAN FARKLI bir hata sınıfı. */
  onConnectError: (message: string) => void;
  /**
   * Kurulu bir bağlantı KOPTU (bkz. dosya başı doc yorumu "Reconnection
   * dilimi") — `socket.io-client` otomatik olarak yeniden bağlanmayı
   * DENEYECEK (varsayılan davranış) ve başarılı olursa `'connect'` (ve
   * dolayısıyla `race.subscribe`) KENDİLİĞİNDEN tekrar tetiklenecek; bu
   * handler yalnızca ARADAKİ süre için kullanıcıya "yeniden bağlanılıyor"
   * geri bildirimi vermek İÇİNDİR, kendi başına bir yeniden bağlanma
   * MANTIĞI YÖNETMEZ.
   */
  onDisconnected: (reason: string) => void;
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
    // Bu dinleyici BİR KEZ eklenir ama socket.io-client'ın kendi otomatik
    // yeniden bağlanması SONUCU her (yeniden) bağlanmada TEKRAR ateşlenir
    // (bkz. dosya başı doc yorumu "Reconnection dilimi") — yani bir ağ
    // kopmasından sonra `race.subscribe` YENİ bir kod YAZILMADAN otomatik
    // olarak tekrar gönderilir.
    socket.emit('race.subscribe', { raceId });
  });

  socket.on('connect_error', (error: Error) => {
    handlers.onConnectError(error.message);
  });

  socket.on('disconnect', (reason: string) => {
    // `reason === 'io client disconnect'` YALNIZCA `socket.disconnect()`
    // BİZİM TARAFIMIZDAN (bkz. `LiveRaceViewer.tsx`'in `useEffect`
    // temizliği) çağrıldığında oluşur — bu durumda bileşen zaten
    // unmount OLUYOR, kullanıcıya "yeniden bağlanılıyor" göstermenin
    // ANLAMI YOK (ekran zaten kayboluyor). Diğer TÜM nedenlerde (ağ
    // kopması, sunucu tarafı kapanma vb.) socket.io OTOMATİK olarak
    // yeniden bağlanmaya ÇALIŞACAK, bu yüzden kullanıcıya bunu bildiriyoruz.
    if (reason === 'io client disconnect') {
      return;
    }
    handlers.onDisconnected(reason);
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
