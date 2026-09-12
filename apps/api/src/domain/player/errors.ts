/** Oyuncu/kimlik doğrulama domain'ine özgü hata tipleri. */

export class InvalidUsernameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUsernameError';
  }
}

export class InvalidDisplayNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDisplayNameError';
  }
}

export class InvalidAuthProviderTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuthProviderTokenError';
  }
}
