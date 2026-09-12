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

export class WeakPasswordError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`Şifre yeterince güçlü değil: ${reasons.join(', ')}`);
    this.name = 'WeakPasswordError';
  }
}
