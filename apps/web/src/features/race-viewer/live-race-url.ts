/**
 * F2 canlı yayın entegrasyonu (bu turda EKLENDİ) — `live-race-socket.ts`'in
 * tek saf (framework/bağımlılık-bağımsız) parçası, bu yüzden bu dosya
 * `apps/web/tsconfig.logic.json`'a dahil edilip bu sandbox'ta GERÇEKTEN
 * `tsc --noEmit` ile doğrulanabilir (`socket.io-client`'ın kendisi bu
 * sandbox'ta kurulu OLMADIĞINDAN, onu import eden `live-race-socket.ts`
 * yalnızca `ts.transpileModule` ile sözdizimi kontrolünden geçirilebilir —
 * bu ayrım BİLİNÇLİDİR, `track-path.ts`/`timeline-playback.ts` ile AYNI
 * "saf mantığı ayır" deseni).
 */

/**
 * `NEXT_PUBLIC_API_URL` (ör. `http://localhost:3000/api/v1`) REST için
 * bir `/api/v1` önekine sahiptir, ama `race.gateway.ts`
 * (`@WebSocketGateway({ namespace: '/races' })`) kök origin'de dinleyen,
 * HTTP REST önekinden TAMAMEN bağımsız bir NestJS/socket.io kavramıdır —
 * `io(...)`'ya bu önekle bağlanmaya çalışmak YANLIŞ bir adrese bağlanır.
 *
 * KASITLI OLARAK global `URL` API'si KULLANILMAZ — bu dosya `apps/web/
 * tsconfig.logic.json`'un "lib"i (`tsconfig.base.json`: yalnızca
 * `ES2022`, DOM/Node lib'i YOK — bu dosyanın ait olduğu "framework'ten
 * bağımsız saf mantık" grubunun GERÇEK bir kısıtı, bkz. `track-path.ts`
 * ile aynı dosya grubu) altında `URL`'i TANIMAZ; basit bir düzenli ifade
 * ile `<şema>://<host[:port]>` önekini ayıklamak hem DOM'a bağımlılığı
 * ORTADAN KALDIRIR hem de tarayıcı/Node ortam farkını ÖNEMSİZ kılar.
 * Eşleşmezse (geçersiz/beklenmeyen bir biçim) girdi OLDUĞU GİBİ geri
 * döner — çağıran taraf (bkz. `live-race-socket.ts`) zaten geçerli bir
 * `NEXT_PUBLIC_API_URL`/varsayılan kullanır, bu yalnızca savunmacı bir
 * son çare.
 */
const ORIGIN_PATTERN = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i;

export function deriveSocketOrigin(apiBaseUrl: string): string {
  const match = ORIGIN_PATTERN.exec(apiBaseUrl);
  return match?.[1] ?? apiBaseUrl;
}
