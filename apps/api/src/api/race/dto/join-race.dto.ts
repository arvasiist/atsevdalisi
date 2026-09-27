import { IsString } from 'class-validator';

/**
 * `POST /races/:id/join` gövde şeması (brief §2/§3/§14.2, §42 PHASE 1b).
 *
 * **BU DTO'NUN ALANLARI DA `unknown`'DIR — `CreateRaceDto` ile AYNI VE AYNI
 * GEREKÇEYLE** (bkz. o dosyanın uzun doc yorumu): Vitest/esbuild
 * `design:paramtypes` üretmediği için `ValidationPipe` gövdeyi HİÇ
 * doğrulamaz, yani çalışma anında `dto.horseId` gerçekten bir sayı ya da
 * dizi olabilir. Alanı `string` diye tiplamak derleyiciyi susturur, hatayı
 * GİZLEMEZ. `unknown`, derleyiciyi "önce kontrol et" demeye ZORLAR ve tek
 * doğruluk kaynağını (`domain/race/lobby.ts` → `validateRaceJoin`) zorunlu
 * kılar.
 *
 * **`@IsUUID()` BİLİNÇLİ OLARAK YOK.** `send-gift.use-case`'in
 * `recipientId`'si için `CLAUDE.md`'de kayıtlı olan hata TAM OLARAK
 * budur: esbuild altında `@IsUUID()` atlanır ve UUID olmayan bir değer
 * veritabanına ulaşıp `22P02` (invalid input syntax for type uuid) ile
 * **500** döndürür — oysa doğru cevap 400'dür. Bu yüzden biçim denetimi
 * `validateRaceJoin` içinde `UUID_PATTERN` ile BAĞIMSIZ olarak yapılır;
 * buradaki `@IsString()` yalnızca gerçek bir HTTP sunucusunda çalışan ÖN
 * KONTROLDÜR.
 *
 * **`playerId` ALANI YOKTUR — ve bu bilinçlidir.** Katılan oyuncu
 * `CurrentPlayer()`'dan (JWT) gelir; gövdede böyle bir alan bulunsa bile
 * yok sayılır (CLAUDE.md kural 1 "SUNUCU OTORİTESİ").
 *
 * **`raceId` DE YOKTUR:** o, URL yolundan gelir ve `ParseUUIDPipe` ile
 * elenir (pipe'lar esbuild altında da çalışır — sınıf açıkça verilir,
 * `design:paramtypes`'a bağlı değildir).
 */
export class JoinRaceDto {
  /**
   * Katılınacak at — oyuncunun KENDİ atı olmak zorundadır (aksi hâlde 403
   * `HorseNotOwnedError`). Bu alan ZORUNLUDUR: giriş ücreti kişi başına
   * değil KATILIM başına alınır ve `race_entries` satırı bir at olmadan
   * anlamsızdır (bot satırları bu uçtan GEÇMEZ).
   */
  @IsString()
  horseId!: unknown;

  /**
   * brief §14.2 taktik — **isteğe bağlı**. Verilmezse `mid_pack` yazılır
   * (`DEFAULT_TACTICAL_STYLE`). Zorunlu tutmak, istemciyi katılım anında
   * henüz karar vermediği bir seçime mecbur bırakırdı; brief §6 zaten
   * katılımdan SONRA ayrı bir READY adımı öngörür (PHASE 3).
   *
   * **`?:` DEĞİL `!:`** — bu incelik kafa karıştırıcıdır ama bilinçlidir:
   * `RaceJoinInput` (domain) alanı ZORUNLU ama `unknown` diye tanımlar,
   * çünkü orada `undefined` "alan yok" değil, "varsayılanı uygula" demektir
   * (bkz. `lobby-join.spec.ts`'in `undefined` ↔ `null` ayrımı testi).
   * `?:` yazılsaydı DTO `RaceJoinInput`'a ATANAMAZDI (`TS2345`, yaşandı) —
   * ve `exactOptionalPropertyTypes` kapalı olduğu için `!:` ile gelen
   * `undefined` çalışma anında aynı sonucu verir.
   */
  @IsString()
  tacticalStyle!: unknown;

  /** brief §14.2 risk — isteğe bağlı, verilmezse `normal` (`DEFAULT_RISK_LEVEL`). */
  @IsString()
  riskLevel!: unknown;
}
