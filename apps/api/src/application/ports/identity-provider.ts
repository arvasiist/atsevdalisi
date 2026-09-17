import type { AuthProvider, VerifiedProviderIdentity } from '../../domain/player/auth-provider';

/**
 * `IdentityProviderVerifier` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface). `domain/player/auth-provider.ts`'in üstündeki
 * nota bkz.: gerçek Google/Apple ID token doğrulaması (imza/audience/issuer/
 * expiry kontrolü) TAMAMEN infrastructure katmanının sorumluluğudur —
 * `application`/`domain` katmanları hangi kütüphanenin (google-auth-library,
 * jwks-rsa, ...) kullanıldığını asla bilmez.
 */
export interface IdentityProviderVerifier {
  /** Google'ın ID token'ını doğrular (imza + `aud` == `GOOGLE_OAUTH_CLIENT_ID`). Geçersizse `InvalidProviderTokenError` fırlatır. */
  verifyGoogleIdToken(idToken: string): Promise<VerifiedProviderIdentity>;
  /** Apple'ın ID token'ını doğrular (JWKS imza + `aud` == `APPLE_OAUTH_CLIENT_ID`). Geçersizse `InvalidProviderTokenError` fırlatır. */
  verifyAppleIdToken(idToken: string): Promise<VerifiedProviderIdentity>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const IDENTITY_PROVIDER_VERIFIER = Symbol('IDENTITY_PROVIDER_VERIFIER');

/** `provider` alanına göre doğru doğrulama metodunu seçen küçük bir yardımcı (bkz. `LoginWithProviderUseCase`). */
export function verifyProviderIdToken(
  verifier: IdentityProviderVerifier,
  provider: AuthProvider,
  idToken: string,
): Promise<VerifiedProviderIdentity> {
  return provider === 'google' ? verifier.verifyGoogleIdToken(idToken) : verifier.verifyAppleIdToken(idToken);
}
