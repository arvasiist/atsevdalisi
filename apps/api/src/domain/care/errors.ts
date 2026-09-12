/** Bakım (care) domain'ine özgü hata tipleri (brief §11). */

export class CareActionOnCooldownError extends Error {
  constructor(
    public readonly remainingMinutes: number,
  ) {
    super(`Bu bakım eylemi henüz tekrar kullanılamaz (${remainingMinutes} dakika kaldı).`);
    this.name = 'CareActionOnCooldownError';
  }
}
