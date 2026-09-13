import type { MatchmakingTicket } from '@at-sevdalisi/shared-types';

/**
 * `MatchmakingTicketRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), diğer repository port'larıyla AYNI desen
 * (docs/ARCHITECTURE.md §4). `database/migrations/0018_add_pvp_matchmaking.up.sql`
 * `matchmaking_tickets` tablosuna karşılık gelir.
 *
 * FAZ 1 wiring, on dördüncü dilim (bu oturum) — PvP Eşleştirme (brief
 * §41). `domain/online/matchmaking.ts` `findBestMatch` SAF bir fonksiyondur
 * (bir bilet listesi ALIR, DB'ye erişmez) — kuyruğun kendisinin
 * okunması/yazılması bu port'un sorumluluğudur.
 */
export interface MatchmakingTicketRepository {
  /**
   * Kuyruktaki TÜM bekleyen biletleri döner — `findBestMatch`'in `candidates`
   * girdisi. Kuyruk boyutunun büyük bir çevrimiçi oyuncu tabanında pratik
   * bir üst sınırı olması gerekebilir (bu dilimde YOK — bkz.
   * `JoinMatchmakingQueueUseCase` doc yorumu "BİLİNÇLİ SINIRLAMA").
   */
  findAll(): Promise<MatchmakingTicket[]>;

  /** Bir oyuncunun (varsa) kuyruktaki biletini döner — `player_id` PRIMARY KEY olduğundan en fazla bir tane olabilir. */
  findByPlayerId(playerId: string): Promise<MatchmakingTicket | null>;

  /** Yeni bir bilet ekler. Var olan bir `playerId`'yi GÜNCELLEMEZ (application katmanı önce `findByPlayerId` ile kontrol eder). */
  save(ticket: MatchmakingTicket): Promise<void>;

  /**
   * Bir oyuncunun biletini kuyruktan siler (`DELETE /matchmaking/queue`
   * VEYA bir eşleşme bulunduğunda rakibin bileti için). Silinen bir satır
   * VARSA `true`, hiç satır yoksa `false` döner — `JoinMatchmakingQueueUseCase`
   * bu dönüş değerini, eşzamanlı iki oyuncunun AYNI rakip biletini
   * yakalamaya çalışması durumuna karşı bir "kim önce geldi" sinyali
   * olarak kullanır (bkz. o use-case'in doc yorumu — TEK bir DB
   * transaction'ı/kilit YOK, bu `DELETE ... RETURNING` tabanlı basit
   * ama etkili bir "claim" deseni).
   */
  deleteByPlayerId(playerId: string): Promise<boolean>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const MATCHMAKING_TICKET_REPOSITORY = Symbol('MATCHMAKING_TICKET_REPOSITORY');
