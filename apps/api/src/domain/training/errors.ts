/**
 * Antrenman domain'ine özgü hata tipleri (brief §10, §75 MVP kriteri:
 * "Antrenman stat/fatigue etkisi oluşturuyor" — ancak at hazır değilse
 * antrenman hiç başlatılmamalıdır).
 */

export class HorseNotReadyForTrainingError extends Error {
  constructor(public readonly reason: 'INSUFFICIENT_ENERGY' | 'HORSE_TOO_TIRED') {
    super(`At antrenmana hazır değil: ${reason}`);
    this.name = 'HorseNotReadyForTrainingError';
  }
}
