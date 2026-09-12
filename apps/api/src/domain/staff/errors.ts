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
