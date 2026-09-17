import { Inject, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type { IdentityProviderVerifier } from '../../application/ports/identity-provider';
import type { VerifiedProviderIdentity } from '../../domain/player/auth-provider';
import { InvalidProviderTokenError } from '../../domain/auth/errors';
import { AppConfigService } from '../config/config.service';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

/**
 * `IdentityProviderVerifier`'ın gerçek Google/Apple implementasyonu.
 * AUDIT_REPORT.md Bulgu S1 hardening (bu oturum) — brief §41/§50.
 *
 * ÖNEMLİ (proje sahibiyle netleştirilen açık karar): proje sahibi henüz
 * gerçek bir Google Cloud OAuth Client ID / Apple Services ID
 * OLUŞTURMADI — `GOOGLE_OAUTH_CLIENT_ID`/`APPLE_OAUTH_CLIENT_ID` ortam
 * değişkenleri boş bırakıldığında bu sınıf BİLİNÇLİ olarak HER ZAMAN
 * `InvalidProviderTokenError` fırlatır (asla "audience kontrolü atla,
 * geçir" gibi güvensiz bir varsayılana düşmez — docs/SECURITY.md §2 "asla
 * client'a güvenme" ilkesiyle AYNI gerekçe). Gerçek kimlik bilgileri
 * sağlandığında `POST /auth/login` gerçek Google/Apple hesaplarıyla uçtan
 * uca çalışır hale gelir; bu sınıfın KENDİSİ değişmez.
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: bağımlılık açık `@Inject()`
 * ile enjekte edilir.
 */
@Injectable()
export class GoogleAppleIdentityProvider implements IdentityProviderVerifier {
  private readonly googleClient: OAuth2Client;
  private readonly appleJwksClient: jwksClient.JwksClient;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.googleClient = new OAuth2Client(this.config.env.googleOAuthClientId || undefined);
    // `cache`/`rateLimit`: Apple'ın JWKS uç noktasına HER token doğrulamasında
    // yeniden istek atmamak için (Apple, aşırı istekte rate-limit uygular) —
    // `jwks-rsa`'nın kendi tavsiye edilen varsayılan sertleştirmesi.
    this.appleJwksClient = jwksClient({ jwksUri: APPLE_JWKS_URI, cache: true, rateLimit: true });
  }

  async verifyGoogleIdToken(idToken: string): Promise<VerifiedProviderIdentity> {
    if (!this.config.env.googleOAuthClientId) {
      throw new InvalidProviderTokenError(
        'GOOGLE_OAUTH_CLIENT_ID yapılandırılmamış — Google ile giriş şu an kullanılamaz.',
      );
    }
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.config.env.googleOAuthClientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        throw new InvalidProviderTokenError('Google ID token geçerli bir "sub" claim\'i içermiyor.');
      }
      return { provider: 'google', providerUserId: payload.sub, email: payload.email ?? null };
    } catch (error) {
      if (error instanceof InvalidProviderTokenError) {
        throw error;
      }
      throw new InvalidProviderTokenError(
        `Google ID token doğrulanamadı: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async verifyAppleIdToken(idToken: string): Promise<VerifiedProviderIdentity> {
    if (!this.config.env.appleOAuthClientId) {
      throw new InvalidProviderTokenError(
        'APPLE_OAUTH_CLIENT_ID yapılandırılmamış — Apple ile giriş şu an kullanılamaz.',
      );
    }
    try {
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        throw new InvalidProviderTokenError('Apple ID token başlığı ("kid") okunamadı.');
      }
      const signingKey = await this.appleJwksClient.getSigningKey(decoded.header.kid);
      const publicKey = signingKey.getPublicKey();
      const payload = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        audience: this.config.env.appleOAuthClientId,
        issuer: APPLE_ISSUER,
      });
      if (typeof payload === 'string' || !payload.sub) {
        throw new InvalidProviderTokenError('Apple ID token geçerli bir "sub" claim\'i içermiyor.');
      }
      const email = typeof payload.email === 'string' ? payload.email : null;
      return { provider: 'apple', providerUserId: payload.sub, email };
    } catch (error) {
      if (error instanceof InvalidProviderTokenError) {
        throw error;
      }
      throw new InvalidProviderTokenError(
        `Apple ID token doğrulanamadı: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
