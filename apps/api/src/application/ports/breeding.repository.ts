import type { BreedingResultView, HorseGender } from '@at-sevdalisi/shared-types';

/**
 * `BreedingRepository` — Çiftleştirme YAZMA yolunun Application →
 * Infrastructure portu (soy ağacı veri zincirinin ÜÇÜNCÜ parçası; okuma
 * yolu `PedigreeRepository`'dir).
 *
 * **BU PORT BİR PARA YOLUDUR** (aygır başka bir oyuncununsa damızlık ücreti
 * transfer edilir) ve bu yüzden `PedigreeRepository`'den AYRI durur. Kendi
 * transaction'ını SAHİPLENİR — `MarketPurchaseRepository`/
 * `GiftRepository` ile AYNI gerekçe: İKİ `horses` satırı + İKİ `players`
 * satırı AYNI transaction'da kilitlenip güncellenecek, AYNI transaction'da
 * `breeding_pairs`/`pedigrees`/`horses`/`horse_stats`/`horse_health`
 * satırları yazılacak ve ücret varsa İKİ `economy_transactions` satırı
 * eklenecek.
 *
 * **KİLİT SIRASI (deadlock'tan kaçınmak için — "her yerde AYNI global
 * sıra" ilkesi):** önce İKİ `horses` satırı (id'lerin sözlüksel sırası),
 * sonra İKİ `players` satırı (id'lerin sözlüksel sırası). Bu sıra
 * `PostgresMarketPurchaseRepository`'nin (horses → players) sırasıyla
 * AYNIdır; `PostgresGiftRepository` yalnızca players'a dokunur, yani onunla
 * da bir döngü kurulamaz.
 *
 * **Domain kararı (`breedHorses`) TRANSACTION'IN İÇİNDE verilir** —
 * ebeveynlerin yaş/sağlık/durum değerleri KİLİTLİ satırlardan okunmalıdır
 * (`PostgresMarketPurchaseRepository`'nin `purchaseListing`'i kilitli
 * satırlarla çağırmasıyla AYNI gerekçe).
 */
export interface BreedingRepository {
  /**
   * Çiftleştirmeyi TEK bir transaction'da gerçekleştirir. Sıra:
   *   1. İKİ `horses` satırı `SELECT ... FOR UPDATE` (sözlüksel id sırası)
   *      + her birinin pazarda AKTİF ilanı olup olmadığı AYNI sorguda.
   *   2. Kısrağın sahibi çağıran mı (`MareNotOwnedError` → 403).
   *   3. Kısrağın son doğum tarihi (`breeding_pairs` — `foal_id IS NOT NULL`
   *      olan en yeni satır) + her iki ebeveynin `horse_stats` satırı.
   *   4. İKİ `players` satırı `SELECT ... FOR UPDATE` (sözlüksel id sırası;
   *      aynı sahipse TEK satır) + ahır kapasitesi sayımı.
   *   5. `calculateStudFee` + `transfer` (yalnızca farklı sahipse).
   *   6. `breedHorses` (domain) — kilitli satırlardan okunan güncel
   *      değerlerle; `NotEligibleForBreedingError` burada fırlar.
   *   7. YAZMA: `horses` (tay), `horse_stats`, `horse_health` (doğum
   *      riskiyle), `horse_surface_stats`, `horse_distance_stats`,
   *      `pedigrees`, `breeding_pairs`, ücret varsa İKİ `players` UPDATE +
   *      İKİ `economy_transactions` INSERT.
   *
   * Herhangi bir adım hata fırlatırsa `withTransaction` ROLLBACK yapar:
   * ne tay doğar, ne soy kaydı yazılır, ne para hareket eder.
   */
  breed(input: ExecuteBreedingInput): Promise<BreedingResultView>;
}

/**
 * `BreedingRepository.breed` girdisi.
 *
 * `foalId`/`pairId` **ÇAĞIRAN tarafından üretilir** (`RegisterPlayerUseCase`'in
 * `randomUUID()` ile at id'si üretmesiyle AYNI desen). `pairId` aynı
 * zamanda genetik **seed**'dir: `breedHorses`'a `seed: pairId` geçilir ve
 * `breeding_pairs.id` olarak SAKLANIR — böylece tayın statları, elde
 * yalnızca kayıt satırı varken bile yeniden üretilebilir (brief §18
 * determinizm). Seed için AYRI bir sütun açmak yerine zaten var olan
 * birincil anahtarın kullanılması bilinçli bir tercihtir.
 */
export interface ExecuteBreedingInput {
  /** İsteği yapan oyuncu = KISRAĞIN sahibi (ücreti ödeyen taraf). */
  playerId: string;
  mareId: string;
  stallionId: string;
  foalId: string;
  pairId: string;
  foalName: string;
  foalGender: HorseGender;
  now: Date;
  idempotencyKey: string | null;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const BREEDING_REPOSITORY = Symbol('BREEDING_REPOSITORY');
