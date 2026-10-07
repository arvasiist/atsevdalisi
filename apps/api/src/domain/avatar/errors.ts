/** Avatar hataları (07.10.2026). `http-exception.filter.ts` → `DOMAIN_ERROR_MAP`'te. */
export class InvalidAvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAvatarError';
  }
}
