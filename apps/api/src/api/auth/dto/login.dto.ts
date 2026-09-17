import { IsIn, IsString, MinLength } from 'class-validator';

const MIN_ID_TOKEN_LENGTH = 10;

/**
 * `POST /auth/login` gövde şeması (brief §41/§50). `idToken`, Google/Apple
 * SDK'sının istemci tarafında (mobil/web) ürettiği HAM ID token'dır — bu
 * DTO yalnızca FORMAT ön-kontrolüdür, gerçek imza/audience/issuer/expiry
 * doğrulaması `GoogleAppleIdentityProvider`'da (infrastructure katmanı) yapılır.
 */
export class LoginDto {
  @IsIn(['google', 'apple'])
  provider!: 'google' | 'apple';

  @IsString()
  @MinLength(MIN_ID_TOKEN_LENGTH)
  idToken!: string;
}
