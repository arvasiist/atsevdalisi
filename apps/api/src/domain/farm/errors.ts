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
