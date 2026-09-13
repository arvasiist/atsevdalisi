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
