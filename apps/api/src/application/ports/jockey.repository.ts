import type { Jockey } from '@at-sevdalisi/shared-types';

/**
 * `JockeyRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). Bkz. `application/ports/horse.repository.ts` ile AYNI
 * desen (docs/ARCHITECTURE.md §4).
 *
 * **NEDEN VAR (PHASE 6.2).** `jockeys` tablosu (migration 0004) ve
 * `domain/jockey/jockey.ts`'teki `calculateJockeySkillComposite` projenin
 * İLK gününden beri vardı, ama aralarında **hiçbir okuyucu yoktu**:
 * `RaceEntrantSnapshot.jockeySkillComposite` her zaman nötr `50`
 * (`NEUTRAL_UNMODELED_TRAIT_SCORE`) kalıyordu ve `race_entries.jockey_id`
 * sütununu YAZAN hiçbir kod yoktu. Yani "jokey yarış sonucunu etkiler"
 * (brief §13, migration 0004'ün kendi `COMMENT ON TABLE`'ı) **doğru
 * değildi**: jokey sistemi bir ekran/veri olarak vardı, motorda YOKTU.
 * Bu port o boşluğun veri tarafını kapatır.
 *
 * **PARA YOLU BURADA.** `hire` bir ödeme yapar, bu yüzden CLAUDE.md'nin 7.
 * kuralı geçerlidir: `SELECT ... FOR UPDATE` + AYNI transaction'da
 * `economy_transactions` defter kaydı. Kilit ve defter satırı
 * implementasyonun (repository) içindedir — application katmanı `pg`
 * `PoolClient`'ı BİLMEZ (bkz. `joinLobbyRace`'in aynı deseni).
 */
export interface JockeyRepository {
  /**
   * Kiralamaya AÇIK jokeyler: `owner_id IS NULL` (NPC/sistem jokeyleri,
   * migration 0004). Sıralama `salary` artan — ucuz olan önce görünür.
   */
  findAvailable(): Promise<Jockey[]>;

  findById(jockeyId: string): Promise<Jockey | null>;

  /**
   * Bir oyuncunun kiraladığı jokey — yoksa `null`.
   *
   * **BİR OYUNCUNUN EN FAZLA BİR JOKEYİ OLABİLİR** ve bu bir kısıtla
   * DEĞİL, kiralama yolunun kendisiyle korunur: `hire` zaten jokeyi olan
   * bir oyuncuya ikinci bir jokey vermez (`JockeyAlreadyHiredError`).
   * Bu yüzden `findByOwnerId` tekil bir jokey döndürür, liste değil —
   * bir liste döndürmek, "hangisi koşacak" sorusunu cevapsız bırakırdı.
   */
  findByOwnerId(ownerId: string): Promise<Jockey | null>;

  /**
   * **PARA YOLU.** Jokeyi kiralar: `jockeys.salary` tutarını oyuncudan
   * düşer ve deftere `jockey_hire` satırı yazar.
   *
   * **TEK TRANSACTION'DA:** (1) `jockeys` satırı `FOR UPDATE` ile
   * kilitlenir, (2) `owner_id` KİLİT ALTINDA yeniden `NULL` mu diye
   * bakılır (dışarıda okunan bir değerle karar vermek, iki eşzamanlı
   * kiralamanın aynı jokeyi İKİ oyuncuya vermesine izin verirdi — ve bu
   * hiçbir yerde hata üretmezdi), (3) oyuncunun bakiyesi kilitlenir ve
   * düşülür, (4) `economy_transactions`'a `jockey_hire` satırı yazılır.
   * Dördünden biri düşerse HİÇBİRİ kalıcı olmaz.
   *
   * **İDEMPOTENCY AYRI BİR ANAHTARLA DEĞİL, DURUMLA SAĞLANIR:** ikinci
   * çağrı `owner_id` dolu bulur ve `JockeyAlreadyOwnedError` alır. Aynı
   * desen `settleLobbyRace`'in `scheduled → finished` geçişinde de
   * kullanılır.
   *
   * Fırlatır: `JockeyNotFoundError` (404), `JockeyAlreadyOwnedError`
   * (409), `JockeyAlreadyHiredError` (409 — oyuncunun zaten jokeyi var),
   * `PlayerNotFoundError` (404), `InsufficientFundsError` (400).
   */
  hire(input: HireJockeyInput): Promise<HireJockeyResult>;
}

/** `JockeyRepository.hire` girdisi. */
export interface HireJockeyInput {
  jockeyId: string;
  playerId: string;
  /**
   * Ödemenin ve defter satırının zaman damgası — ÇAĞIRAN verir
   * (`lockLobbyRace`'in `now`'uyla AYNI desen: repository `new Date()`
   * çağırmaz, yoksa test edilebilirlik ve tek-zaman kaynağı kaybolurdu).
   */
  now: Date;
}

/** `JockeyRepository.hire` sonucu — çağıran yanıtı bundan kurar. */
export interface HireJockeyResult {
  jockey: Jockey;
  /** Ödenen kiralama bedeli (`jockeys.salary`) — ledger'a yazılan TUTARIN aynısı. */
  paid: number;
  balanceBefore: number;
  balanceAfter: number;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const JOCKEY_REPOSITORY = Symbol('JOCKEY_REPOSITORY');
