/** Bakım (care) domain'ine özgü hata tipleri (brief §11). */

export class CareActionOnCooldownError extends Error {
  constructor(
    public readonly remainingMinutes: number,
  ) {
    super(`Bu bakım eylemi henüz tekrar kullanılamaz (${remainingMinutes} dakika kaldı).`);
    this.name = 'CareActionOnCooldownError';
  }
}

/**
 * FAZ 1 wiring, beşinci dilim — Antrenman diliminde CI'da yakalanan
 * Hata 7'nin (bkz. `docs/ARCHITECTURE.md` §9.1) dersi BAŞTAN uygulanır:
 * `POST /horses/:id/care`/`feed` DTO'larındaki `@IsIn(...)` kontrolü
 * NestJS'in `ValidationPipe`'ı Vitest/esbuild altında metatype'ı
 * çözemediğinde sessizce ATLANABİLİR — bu yüzden domain katmanı
 * `actionType`/`feedType`'ı KENDİSİ de bağımsız olarak doğrular.
 * `config/care.config.json`'da tanımsız bir değer verilirse fırlatılır.
 */
export class InvalidCareInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCareInputError';
  }
}
