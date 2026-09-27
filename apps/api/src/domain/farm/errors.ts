/** Çiftlik (Farm) tesisleri domain'ine özgü hata tipleri (brief §32). */

export class MaxFacilityLevelReachedError extends Error {
  constructor(
    public readonly facilityType: string,
    public readonly currentLevel: number,
  ) {
    super(`"${facilityType}" tesisi zaten en yüksek seviyede (${currentLevel}) — daha fazla yükseltilemez.`);
    this.name = 'MaxFacilityLevelReachedError';
  }
}

/** `staff_building` seviyesinin izin verdiği personel kapasitesi dolduğunda fırlatılır. */
export class StaffCapacityExceededError extends Error {
  constructor(public readonly capacity: number) {
    super(`Personel kapasitesi (${capacity}) dolu — daha fazla personel kiralamak için Personel Binası'nı yükselt.`);
    this.name = 'StaffCapacityExceededError';
  }
}

/**
 * Çiftlik uç noktalarına geçersiz bir tesis tipi geldiğinde fırlatılır
 * (bu turda EKLENDİ — bkz. `validation.ts` `parseFacilityType`).
 *
 * `InvalidTrainingInputError`/`InvalidCareInputError`/`InvalidEquipmentInputError`
 * ile AYNI kategori: GERÇEK bir doğrulama hatasıdır (kalıcı — aynı isteği
 * tekrar denemek düzeltmez), bu yüzden HTTP katmanında 400'e eşlenir.
 * Mesajda geçerli tipler BİLEREK listelenmez: liste `validation.ts`'te
 * yaşar ve buraya kopyalanırsa sessizce eskir (bu projede yaşanmış bir hata
 * sınıfı) — istemci geçerli tipleri `GET .../farm` yanıtından zaten görür.
 */
export class InvalidFacilityTypeError extends Error {
  constructor(public readonly value: unknown) {
    super(`Geçersiz tesis tipi: "${String(value)}".`);
    this.name = 'InvalidFacilityTypeError';
  }
}
