/** Personel (staff) domain'ine özgü hata tipleri (brief §33). */

export class StaffAlreadyHiredError extends Error {
  constructor(public readonly staffId: string) {
    super(`Personel (${staffId}) zaten başka bir oyuncuya ait.`);
    this.name = 'StaffAlreadyHiredError';
  }
}

export class StaffContractExpiredError extends Error {
  constructor(public readonly staffId: string) {
    super(`Personelin (${staffId}) sözleşmesi sona erdi.`);
    this.name = 'StaffContractExpiredError';
  }
}

/** Personel bulunamadı (404). */
export class StaffNotFoundError extends Error {
  constructor(public readonly staffId: string) {
    super(`Personel bulunamadı (${staffId}).`);
    this.name = 'StaffNotFoundError';
  }
}

/** Personel çağıranın değil — sahipsiz ile başkasının AYNI hatadır (yön sızdırılmaz). */
export class StaffNotOwnedError extends Error {
  constructor(public readonly staffId: string) {
    super('Bu personel senin kadronda değil.');
    this.name = 'StaffNotOwnedError';
  }
}

/** Yenileme penceresi henüz açılmadı (409) — çift ödemeyi bu durum kuralı engeller. */
export class StaffRenewalNotDueError extends Error {
  constructor(public readonly renewWindowDays: number) {
    super(`Sözleşme yalnızca bitimine ${renewWindowDays} gün kala ya da bittikten sonra yenilenebilir.`);
    this.name = 'StaffRenewalNotDueError';
  }
}

/** Bu rol pazarda kiralanamaz — etkisi oyuna bağlı değil (400). */
export class StaffRoleNotHireableError extends Error {
  constructor(public readonly role: string) {
    super(`"${role}" rolü şu an kiralanamaz.`);
    this.name = 'StaffRoleNotHireableError';
  }
}
