/** Jokey (jockey) domain'ine özgü hata tipleri (brief §13). */

export class JockeyAlreadyOwnedError extends Error {
  constructor(public readonly jockeyId: string) {
    super(`Jokey (${jockeyId}) zaten başka bir oyuncuya ait.`);
    this.name = 'JockeyAlreadyOwnedError';
  }
}
