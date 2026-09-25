/**
 * `lobby.update` frontend entegrasyonu (bu turda EKLENDİ) — `race.gateway.ts`'in
 * ZATEN var olan `/races` namespace'ine (`live-race-socket.ts`'in
 * `connectRaceSocket`'iyle AYNI bağlantı/kimlik doğrulama deseni)
 * bağlanan ince bir sarmalayıcı, bkz. `race.gateway.ts`'in "`lobby.update`"
 * doc bölümü ve docs/API.md §10. `race.subscribe` YOLLANMAZ — bu, HERHANGİ
 * bir yarışı İZLEMEK için DEĞİL, ÇAĞIRANIN kendi oyuncu-bazlı odasına
 * (`player:${playerId}`, `RaceGateway.handleConnection`'ın HER istemciyi
 * bağlantı KURULUR KURULMAZ, hiçbir `race.subscribe` beklemeden otomatik
 * kattığı oda) katılmak için — bağlantının KENDİSİ zaten yeterlidir.
 *
 * `socket.io-client`'a bağımlı olduğundan (`live-race-socket.ts` ile AYNI
 * kısıt — bkz. o dosyanın doc yorumu), bu dosya da bu sandbox'ta yerel
 * `tsc`/gerçek testle TAM doğrulanamaz — yalnızca `ts.transpileModule`
 * ile sözdizimi kontrolü yapılabilir, gerçek doğrulama CI'dadır.
 */

import { io, type Socket } from 'socket.io-client';
import type { PvpMatchResult } from '@at-sevdalisi/shared-types';
import { deriveSocketOrigin } from '../race-viewer/live-race-url';

export interface LobbySocketHandlers {
  /** `lobby.update` — bkz. `race.gateway.ts`'in `notifyMatchFound`'u; `result` ALICININ (bu istemcinin) KENDİ perspektifindendir. */
  onMatched: (result: PvpMatchResult) => void;
  /** Bağlantının kendisi HİÇ kurulamadı (auth reddi, ilk el sıkışma ağ hatası) — `live-race-socket.ts`'teki AYNI hata sınıfı. */
  onConnectError: (message: string) => void;
}

/**
 * `apiBaseUrl` — `API_BASE_URL` (bkz. `api-client.ts`). Dönen `Socket`'in
 * `disconnect()`'i, çağıran tarafın (bkz. `online/page.tsx`) `useEffect`
 * temizliğinde çağrılması BEKLENİR — bu fonksiyon kendi başına bir yaşam
 * döngüsü YÖNETMEZ (`connectRaceSocket` ile AYNI sözleşme).
 */
export function connectLobbySocket(apiBaseUrl: string, token: string, handlers: LobbySocketHandlers): Socket {
  const socket = io(`${deriveSocketOrigin(apiBaseUrl)}/races`, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect_error', (error: Error) => {
    handlers.onConnectError(error.message);
  });

  socket.on('lobby.update', (result: PvpMatchResult) => {
    handlers.onMatched(result);
  });

  return socket;
}
