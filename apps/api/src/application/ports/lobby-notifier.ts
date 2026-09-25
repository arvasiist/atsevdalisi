import type { PvpMatchResult } from '@at-sevdalisi/shared-types';

/**
 * `LobbyNotifier` — Application katmanının Sunum/Infrastructure katmanına
 * (bir DB repository'si DEĞİL, bir WebSocket gateway'i) bağlandığı PORT
 * (interface) — `RaceRepository`/`MatchmakingTicketRepository` ile AYNI
 * desen (docs/ARCHITECTURE.md §4: application katmanı somut bir
 * implementasyona değil, KENDİ tanımladığı bir arayüze bağımlıdır), TEK
 * fark karşı tarafın bir DB satırı değil canlı bir soket bağlantısı olması.
 *
 * `lobby.update` (bu turda UYGULANDI, bkz. docs/API.md §10 — önceden
 * `[PLANLI]`): `JoinMatchmakingQueueUseCase`'in ÖNCEDEN kuyrukta bekleyen
 * oyuncuyu (rakip SONRADAN gelen bir `join` isteği İÇİNDE bulunduğunda)
 * bilgilendirmesi için kullanılır — bkz. o use-case'in "ÖNEMLİ, BİLİNÇLİ
 * SINIRLAMA" notu. Somut implementasyonu `RaceGateway`'dir (bkz. o
 * dosyanın `implements LobbyNotifier` bildirimi ve "lobby.update" doc
 * bölümü) — YENİ bir gateway/namespace İCAT EDİLMEDİ, `/races`
 * namespace'i ZATEN var olan bağlantı/kimlik doğrulama altyapısı
 * TEKRAR KULLANILDI.
 */
export interface LobbyNotifier {
  /**
   * `playerId`nin (ZATEN kuyrukta bekleyen, ÇAĞIRANIN rakibi olan tarafın)
   * o an `/races` namespace'inde açık bir soketi VARSA (bkz.
   * `RaceGateway.handleConnection`'ın HER istemciyi kendi
   * `player:${playerId}` odasına KATMASI) ona `lobby.update` olayıyla
   * `result`'ı yayınlar; soketi YOKSA (bağlı değil/sekme kapalı) Socket.IO'nun
   * standart davranışı gereği SESSİZCE hiçbir şey YAPMAZ — bu bir HATA
   * DEĞİL, bilinçli BEST-EFFORT tasarım kararıdır (garanti teslim/kuyruk
   * sistemi İCAT EDİLMEDİ). Bu metodun KENDİSİ normal koşullarda hiçbir
   * zaman fırlatmaz; yine de çağıran taraf (`JoinMatchmakingQueueUseCase`)
   * savunma amaçlı bir `try/catch` İÇİNDE çağırır (bkz. o use-case'in
   * `playMatch` metodu) — bu ikincil yan kanal, use-case'in ANA akışını
   * (DB yazımı zaten TAMAMLANMIŞTIR) ASLA etkilememelidir.
   *
   * `result`, ALICININ (yani `playerId`'nin) KENDİ perspektifinden bir
   * `PvpMatchResult`'tır — `own*`/`opponent*` alanları, use-case'in HTTP
   * yanıtı olarak ÇAĞIRANA döndürdüğü objeye göre TERS çevrilmiştir (bkz.
   * `JoinMatchmakingQueueUseCase.playMatch`'teki inşa mantığı ve
   * `RaceRepository.savePvpMatchWithRatings`'in A/B eşlemesi doc yorumu).
   */
  notifyMatchFound(playerId: string, result: PvpMatchResult): void;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const LOBBY_NOTIFIER = Symbol('LOBBY_NOTIFIER');
