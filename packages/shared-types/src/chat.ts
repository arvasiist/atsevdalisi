/**
 * Yarış sohbeti + canlı izleyici sayısı tipleri (brief §13, §27).
 *
 * `grandstand.ts`/`social.ts` ile AYNI ilke: bu tipler hem API'nin
 * (gateway'in yayınladığı payload'lar) hem `apps/web`'in (tüketici)
 * paylaştığı SÖZLEŞMEDİR. WebSocket üzerinden gittiği için
 * `@nestjs/swagger` şeması YOKTUR — sözleşme yalnızca buradadır.
 */

/**
 * Tek bir sohbet mesajının istemciye giden hâli.
 *
 * **`username` NEDEN VAR (`playerId` yeterli değil):** istemci her mesaj
 * için ikinci bir `GET /players/:id` isteği atsaydı N+1 olurdu — üstelik
 * bu bir WebSocket akışıdır, HTTP isteği atmak için doğal bir yer yoktur.
 * `players.username` JOIN'den gelir (`displayName` DEĞİL: sohbet kanalı
 * herkese açık bir yüzeydir ve `username` zaten herkese açık benzersiz
 * kimliktir — bkz. `players.username UNIQUE`).
 *
 * `createdAt` ISO 8601 METİNDİR (Date değil): bu tip WebSocket üzerinden
 * JSON olarak gider ve JSON'da Date yoktur — `Date` bırakmak, sunucuda
 * sessizce metne çevrilip istemcide `new Date(...)` gerektiren bir
 * tutarsızlık yaratırdı. Dönüşüm TEK bir yerde (`toRaceChatMessageView`)
 * yapılır.
 */
export interface RaceChatMessageView {
  messageId: string;
  raceId: string;
  /** Gönderen — SUNUCUNUN doğruladığı oturumdan, istemci gövdesinden DEĞİL. */
  playerId: string;
  /** Gönderenin `players.username`'i (JOIN). */
  username: string;
  body: string;
  /** ISO 8601. */
  createdAt: string;
}

/**
 * `race.subscribe` sonrası YALNIZCA abone olan istemciye gönderilen
 * geçmiş (brief §13). Odaya YAYINLANMAZ — her istemci kendi abone olma
 * anında bir kez alır, aksi halde her yeni izleyici tüm geçmişi odadaki
 * HERKESE tekrar gönderirdi (N izleyici için N² trafik).
 *
 * `messages` KRONOLOJİKTİR (en eski → en yeni): istemci doğrudan
 * ekrana basabilsin diye. Sunucu tarafında sorgu "son N" ile yapılır,
 * sıralama ters çevrilir (bkz. `PostgresChatRepository.findRecent`).
 */
export interface RaceChatHistoryPayload {
  raceId: string;
  messages: RaceChatMessageView[];
}

/**
 * `chat.message` (istemci → sunucu) gövdesi. `playerId` BİLİNÇLİ olarak
 * YOKTUR — gönderen sunucunun doğruladığı oturumdur; istemcinin kendini
 * başkası olarak tanıtabilmesi yapısal olarak imkânsız olmalıdır
 * (CLAUDE.md "SUNUCU OTORİTESİ").
 */
export interface SendRaceChatMessagePayload {
  raceId: string;
  body: string;
}

/**
 * Canlı izleyici sayısı (brief §27: "👥 348 spectators" — "WebSocket ile
 * güncellenmeli").
 *
 * `count`, o an `race:${raceId}` odasındaki AÇIK soket sayısıdır —
 * `race_entries`/`race_tickets` satır sayısı DEĞİL. Brief'in istediği şey
 * "şu an izleyen" sayısıdır; bilet satın almış ama bağlanmamış bir oyuncu
 * izleyici DEĞİLDİR.
 *
 * **BİLİNÇLİ SINIRLAMA (tek örnek):** sayı `server.sockets.adapter`
 * üzerinden okunur; bu, Socket.IO Redis adapter'ı BAĞLANMADAN yalnızca
 * TEK bir sunucu örneği için doğrudur (bkz. `race.gateway.ts` doc yorumu).
 */
export interface RaceSpectatorCountPayload {
  raceId: string;
  count: number;
}

/**
 * Sohbetle ilgili istemci hatası (`chat.error`). `race.error`'dan AYRI
 * bir olaydır: sohbet reddedilse bile yarış yayını DEVAM ETMELİDİR —
 * ikisini aynı olayda birleştirmek, istemcinin "yarış bitti" sanmasına
 * yol açardı.
 */
export interface RaceChatErrorPayload {
  message: string;
}
