/**
 * Race domain'ine özgü hata tipleri (brief §6, §14.2 — oyuncu taktik
 * kararları: racingStyle/riskLevel/startApproach/finalStretchPlan).
 */

/**
 * FAZ 1 wiring, sekizinci dilim (Pratik Yarış) — `register-player.dto.ts`
 * üstündeki genel "hiçbir tek katmana güvenme" ilkesiyle AYNI gerekçe
 * (docs/SECURITY.md §2). NOT — bu, `InvalidTrainingInputError`/
 * `InvalidCareInputError`'ın ÇÖZDÜĞÜ türden bir "sessizce 500'e düşme"
 * riski DEĞİL: `racingStyle`/`riskLevel` zaten `config/race.config.json`
 * lookup'larında (`domain/race/overtaking.ts` → `courageByRiskLevel`,
 * `assignInitialLane`) güvenli varsayılanlarla ÇÖKMEDEN geri düşüyor, ve
 * `startApproach`/`finalStretchPlan` şu an motor tarafından HİÇ
 * okunmuyor (henüz kullanılmayan, taşınan alanlar). Buradaki asıl amaç,
 * DTO doğrulaması bir şekilde atlanırsa geçersiz/anlamsız bir taktik
 * değerinin sessizce veritabanına (`race_entries.horse_snapshot`)
 * yazılmasını önlemek — davranışsal bir çökme değil, veri bütünlüğü
 * garantisi.
 */
export class InvalidRaceTacticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRaceTacticError';
  }
}

/**
 * AUDIT_REPORT.md Bulgu R2 (Medium, bu oturum) — `GET /races/:id/timeline`
 * (tam alan replay) verilen `raceId` ile eşleşen bir `races` satırı yoksa
 * fırlatılır. `HorseNotFoundError`/`PlayerNotFoundError` ile AYNI "bulunamayan
 * kaynak" kategorisi, 404.
 */
export class RaceNotFoundError extends Error {
  constructor(raceId: string) {
    super(`Yarış bulunamadı: ${raceId}`);
    this.name = 'RaceNotFoundError';
  }
}

/**
 * Proje sahibinin açık talebi (27.09.2026) — "hazır olan kişiler
 * yarışabilsinler". `domain/race/readiness.ts`'teki `checkRaceReadiness`
 * `ready: false` döndüğünde fırlatılır.
 *
 * `HorseNotReadyForTrainingError` ile AYNI gerekçeyle 409 Conflict
 * (`http-exception.filter.ts`): bu GEÇİCİ bir engeldir — dinlenme/bakım
 * ile düzelir, kalıcı bir doğrulama hatası DEĞİLDİR (400 olmaz).
 */
export class HorseNotReadyToRaceError extends Error {
  constructor(public readonly reason: 'HORSE_NOT_ACTIVE' | 'INSUFFICIENT_HEALTH' | 'HORSE_TOO_TIRED' | 'INSUFFICIENT_ENERGY') {
    super(`At yarışa hazır değil: ${reason}`);
    this.name = 'HorseNotReadyToRaceError';
  }
}

/**
 * `POST /horses/:id/practice-race` gövdesindeki `tierId` config'deki
 * hiçbir kademeyle eşleşmiyorsa fırlatılır. `InvalidRaceTacticError` ile
 * AYNI kategori: gerçek bir DOĞRULAMA hatasıdır (kalıcı — aynı isteği
 * tekrarlamak düzeltmez), bu yüzden 400.
 *
 * NEDEN DOMAIN'DE: DTO'nun `@IsIn(...)` kontrolü statik bir liste ister,
 * oysa kademe kimlikleri `config/economy.config.json`'dan gelir. Ayrıca
 * esbuild altında DTO doğrulaması atlanabildiğinden (bkz. CLAUDE.md) bu
 * kontrol ZATEN domain katmanında olmak zorundadır.
 */
export class InvalidRaceTierError extends Error {
  constructor(public readonly tierId: string) {
    super(`Geçersiz yarış kademesi: ${tierId}`);
    this.name = 'InvalidRaceTierError';
  }
}
