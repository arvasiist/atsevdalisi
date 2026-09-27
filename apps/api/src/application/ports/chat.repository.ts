/**
 * `ChatRepository` — yarış sohbeti diliminin Application →
 * Infrastructure portu (brief §13, proje sahibinin açık talebi,
 * 27.09.2026). `SocialRepository` ile AYNI desen (docs/ARCHITECTURE.md §4):
 * HTTP/NestJS/WebSocket bilmez, yalnızca "ne yapılabilir" sorusunu
 * tanımlar.
 *
 * **BU PORT BİR PARA YOLU DEĞİLDİR.** Burada tek bir `players` satırı bile
 * güncellenmez, `wallet`/`economy_transactions` hiç geçmez — bu yüzden
 * `withTransaction`/`SELECT ... FOR UPDATE` GEREKMEZ (bkz. `SocialRepository`
 * dosya başı notu ve CLAUDE.md "PARA/MUTASYON YOLU").
 *
 * **YETKİLENDİRME BU PORTUN İŞİ DEĞİLDİR.** "Bu oyuncu bu yarışı
 * izleyebilir mi" sorusunun TEK cevabı `GetRaceTimelineUseCase`'tir
 * (katılımcı VEYA tribün bileti sahibi — bkz. o use-case'in doc yorumu).
 * Bu port onu TEKRAR SORMAZ; çağıran (`RaceGateway`), mesajı bu porta
 * ulaştırmadan ÖNCE abonelik kapısını kapatmış olmalıdır.
 */

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

export interface ChatRepository {
  /**
   * Mesajı YAZAR ve yazılan satırı gönderenin `username`'iyle birlikte
   * döner (tek ifadede — bkz. `PostgresChatRepository.save`'in CTE
   * gerekçesi). `race_id`/`player_id` FK'leri satırların varlığını
   * garanti eder; gövde doğrulaması ÇAĞIRANIN işidir
   * (`normalizeMessageBody`).
   */
  save(input: SaveRaceMessageInput): Promise<RaceChatMessageRow>;

  /**
   * Bir yarışın SON `limit` mesajı, KRONOLOJİK sırada (en eski → en yeni).
   *
   * **NEDEN "son N" ve neden kronolojik:** sohbet ekranı yarışın
   * ORTASINDA açılır — kullanıcı en yeni konuşmayı görmek ister, yarışın
   * ilk saniyelerindeki mesajları değil. Sıralamanın kronolojik olması ise
   * istemcinin listeyi olduğu gibi basabilmesi içindir (ters çevirme
   * SUNUCUDA, tek yerde yapılır). Salt okunur.
   */
  findRecent(raceId: string, limit: number): Promise<RaceChatMessageRow[]>;
}

/** `race_messages` satırı + `players` JOIN'inden gelen `username` (snake_case → camelCase). */
export interface RaceChatMessageRow {
  messageId: string;
  raceId: string;
  playerId: string;
  /** `players.username` — sohbet kanalı herkese açık bir yüzey olduğundan `displayName` DEĞİL. */
  username: string;
  body: string;
  createdAt: Date;
}

/** `ChatRepository.save` girdisi. */
export interface SaveRaceMessageInput {
  raceId: string;
  /** Gönderen — SUNUCUNUN doğruladığı oturumdan gelir, istemci gövdesinden DEĞİL. */
  playerId: string;
  /** `normalizeMessageBody` ile kırpılmış/doğrulanmış gövde. */
  body: string;
}
