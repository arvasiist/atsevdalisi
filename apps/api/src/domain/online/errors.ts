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

export class NoOpponentFoundError extends Error {
  constructor() {
    super('Eşleştirme kriterlerine uyan bir rakip bulunamadı.');
    this.name = 'NoOpponentFoundError';
  }
}
