import type { HorsePedigreeView } from '@at-sevdalisi/shared-types';

/**
 * `PedigreeRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). Bkz. `application/ports/horse.repository.ts` ile AYNI
 * desen (docs/ARCHITECTURE.md §4).
 *
 * NEDEN AYRI BİR PORT: soy ağacı okuması `horses` + `pedigrees` olmak üzere
 * İKİ tabloya dokunur ve `Pedigree` şemasının tamamını (2 nesil + kan hattı)
 * tek seferde döndürür. Bunu `HorseRepository`'ye eklemek, at okuma
 * yolunun geri kalanını hiç ilgilendirmeyen bir metodu o port'a sızdırırdı
 * (`horse.repository.ts`'in `update`/`updateWithLock` ayrımındaki AYNI
 * "sorumluluğu dar tut" gerekçesi).
 */
export interface PedigreeRepository {
  /**
   * Bir atın soy ağacını görünen adlarıyla birlikte okur.
   *
   * **At YOKSA `null` döner** (use-case bundan `HorseNotFoundError`/404
   * üretir). At VARSA ama soy kaydı yoksa `null` DEĞİL, ata alanları boş
   * bir `HorsePedigreeView` döner — bu ayrım, "olmayan at" ile "soy kaydı
   * olmayan at"ın HTTP'de karışmaması için kritiktir (bkz.
   * `HorsePedigreeView` doc yorumu).
   */
  findByHorseId(horseId: string): Promise<HorsePedigreeView | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const PEDIGREE_REPOSITORY = Symbol('PEDIGREE_REPOSITORY');
