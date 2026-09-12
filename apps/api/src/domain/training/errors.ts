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

/**
 * FAZ 1 wiring, dördüncü dilim (CI Hata 7, bkz. docs/ARCHITECTURE.md
 * §9.1) — `TrainHorseDto`'daki `@IsIn(...)` kontrolü, NestJS'in
 * `ValidationPipe`'ının hangi DTO sınıfını doğrulayacağını bilmek için
 * gereken `design:paramtypes` üst verisi Vitest/esbuild altında
 * YAYINLANMADIĞINDAN (Hata 6 ile AYNI kök neden — bu kez constructor
 * enjeksiyonu değil, metod PARAMETRESİ tip üst verisi) sessizce
 * ATLANABİLİR. Bu yüzden domain katmanı `type`/`intensity`'yi KENDİSİ de
 * bağımsız olarak doğrular — `register-player.dto.ts`'teki "hiçbir tek
 * katmana güvenme" ilkesiyle AYNI gerekçe, ama bu kez BULUNMA nedeni bir
 * varsayım değil, CI'da gerçekten yakalanan bir 500 hatasıydı.
 */
export class InvalidTrainingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTrainingInputError';
  }
}
