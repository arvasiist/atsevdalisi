/** Online (FAZ 7) domain'ine özgü hata tipleri — brief §41-42. */

export class DuplicateHorseInRaceRoomError extends Error {
  constructor(public readonly horseId: string) {
    super(`At (${horseId}) aynı yarış odasında birden fazla kez yer alamaz.`);
    this.name = 'DuplicateHorseInRaceRoomError';
  }
}

export class InvalidRaceRoomParticipantCountError extends Error {
  constructor(public readonly count: number, public readonly min: number, public readonly max: number) {
    super(`Yarış odası katılımcı sayısı (${count}) izin verilen aralığın (${min}-${max}) dışında.`);
    this.name = 'InvalidRaceRoomParticipantCountError';
  }
}

/**
 * brief §42 ONLINE GÜVENLİK: "horse_speed, horse_money, race_result,
 * reward_amount gibi kritik veriler authoritative kabul edilmemelidir."
 * Bu hata, client'tan gelen bir snapshot'ın server'ın kendi hesapladığı
 * authoritative snapshot ile UYUŞMADIĞI (yani client'ın kritik bir alanı
 * değiştirmeye çalıştığı) durumlarda fırlatılır.
 */
export class AntiCheatViolationError extends Error {
  constructor(public readonly field: string, public readonly reason: string) {
    super(`Anti-cheat ihlali — alan: "${field}". ${reason}`);
    this.name = 'AntiCheatViolationError';
  }
}

/**
 * FAZ 7 domain'inde TASLAKTA duruyordu — bkz. üstündeki JSDoc'un ima
 * ettiği "eşleşme yoksa hata" tasarımı. FAZ 1 wiring, on dördüncü dilim
 * (bu oturum) BİLİNÇLİ olarak BU HATAYI HİÇ FIRLATMAZ: `JoinMatchmakingQueueUseCase`'de
 * "uygun rakip yok" NORMAL bir 200 yanıtıdır (`{matched: false, ticket}`
 * — oyuncu kuyrukta bekletilir), gerçek bir hata durumu DEĞİLDİR (bkz. o
 * use-case'in doc yorumu). Bu sınıf, `domain/market/errors.ts`
 * `ListingExpiredError`'ın on üçüncü dilimde "tanımlı ama fiilen artık
 * dönmüyor" hâline gelmesiyle AYNI kategoride, bilinçli olarak KULLANILMADAN
 * bırakılmıştır — ileride SENKRON olmayan bir eşleştirme tasarımı
 * (örn. bir arka plan işçisi) benimsenirse gerçek bir kullanıcı bulabilir.
 */
export class NoOpponentFoundError extends Error {
  constructor() {
    super('Eşleştirme kriterlerine uyan bir rakip bulunamadı.');
    this.name = 'NoOpponentFoundError';
  }
}

/**
 * FAZ 1 wiring, on dördüncü dilim (bu oturum) — `domain/market/errors.ts`
 * `HorseAlreadyListedError` ile AYNI desen/gerekçe: bir oyuncunun aynı anda
 * yalnızca TEK bir eşleştirme bileti olabilir (`matchmaking_tickets.player_id`
 * PRIMARY KEY, bkz. migration `0018_add_pvp_matchmaking`). Application
 * katmanında (`JoinMatchmakingQueueUseCase`), var olan bir bilet
 * bulunduğunda fırlatılır — domain katmanının kendisi (bu dosyanın
 * kalan hataları gibi) hiçbir DB sorgusu yapmaz.
 */
export class AlreadyInMatchmakingQueueError extends Error {
  constructor(public readonly playerId: string) {
    super(`Oyuncu (${playerId}) zaten eşleştirme kuyruğunda.`);
    this.name = 'AlreadyInMatchmakingQueueError';
  }
}

/**
 * FAZ 1 wiring, on dördüncü dilim (bu oturum) — `DELETE
 * /matchmaking/queue` (docs/API.md §9) için `domain/market/errors.ts`
 * `ListingNotFoundError` ile AYNI kategori: application katmanı
 * (`LeaveMatchmakingQueueUseCase`), `MatchmakingTicketRepository.
 * findByPlayerId` `null` döndüğünde bu hatayı fırlatır.
 */
export class NotInMatchmakingQueueError extends Error {
  constructor(public readonly playerId: string) {
    super(`Oyuncu (${playerId}) eşleştirme kuyruğunda değil.`);
    this.name = 'NotInMatchmakingQueueError';
  }
}
