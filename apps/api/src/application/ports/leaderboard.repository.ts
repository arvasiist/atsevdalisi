/**
 * Sıralama (leaderboard) verisi için port — `domain/ranking/leaderboard.ts`
 * (saf toplama + sıralama/rank atama) ile `GetLeaderboardUseCase`
 * (orkestrasyon) arasındaki tek veri kaynağıdır.
 *
 * NEDEN HAM SATIRLAR DÖNER, SQL'DE TOPLANMIŞ PUAN DEĞİL: sıralama puanının
 * kuralı `domain/ranking/ranking-score.ts`'te TEK bir yerde yaşar ve
 * config'e bağlıdır (`racePerformanceWeight`, `winBonus`,
 * `placementBonusByPlacement`, `tournamentBonusMultiplier`). Puanı SQL'de
 * toplamak aynı formülün İKİNCİ bir kopyasını yaratırdı; config değiştiğinde
 * ikisi sessizce ayrışır ve hiçbir test bunu yakalayamazdı (CLAUDE.md
 * "SİHİRLİ SAYI YOK" + tek-kaynak kuralı). Bu yüzden port HAM yarış
 * kayıtlarını döner; puanlama application/domain katmanında yapılır.
 *
 * ÖLÇEK NOTU: bu, tamamlanmış TÜM yarış kayıtlarını okur. Bugünkü ölçekte
 * (yalnızca pratik yarış var, oyuncu sayısı küçük) sorun değildir. Kalıcı
 * çözüm `leaderboards` tablosudur ve o BİLİNÇLİ olarak FAZ 7'ye bırakılmıştır
 * (bkz. `database/migrations/0009_create_indexes.up.sql:23`). Bu port
 * değişmeden kalır: tablo geldiğinde yalnızca implementasyon değişir.
 */
export const LEADERBOARD_REPOSITORY = Symbol('LEADERBOARD_REPOSITORY');

/**
 * Tamamlanmış bir yarıştaki tek bir atın (ve sahibinin) ham sonucu.
 * Alan adları `domain/ranking/leaderboard.ts`'teki `PlayerRaceOutcome` ile
 * UYUMLUdur (fazladan `displayName` taşır) — böylece application katmanı bu
 * kayıtları dönüştürmeden doğrudan domain fonksiyonuna geçirebilir.
 */
export interface PlayerRaceRecord {
  playerId: string;
  /** Sıralamada gösterilecek ad — `players.display_name`. */
  displayName: string;
  /** `race_entries.performance_score` (NUMERIC(6,2)). */
  performanceScore: number;
  /** `race_entries.finish_position`. 1 = birinci. */
  finishPosition: number;
  /** Yarış kaydının oluşma anı, ISO 8601 (UTC). */
  finishedAt: string;
}

export interface LeaderboardRepository {
  /**
   * Dereceye girmiş (yani `finish_position` DOLU olan) tüm yarış kayıtlarını
   * döner. Bitmemiş/iptal edilmiş yarışların kayıtları BURADA süzülür; bu
   * kuralın SQL'de olmasının sebebi, yarım bir kaydın `finish_position`
   * değerinin anlamsız olmasıdır (puanlama kuralı değil, VERİ BÜTÜNLÜĞÜ).
   */
  findAllFinishedRaceRecords(): Promise<PlayerRaceRecord[]>;
}
