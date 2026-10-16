import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidProviderTokenError } from '../../src/domain/auth/errors';
import {
  GOOGLE_TOKEN_REJECTED_MESSAGE,
  GoogleAppleIdentityProvider,
} from '../../src/infrastructure/auth/google-apple-identity-provider';
import type { AppConfigService } from '../../src/infrastructure/config/config.service';

/**
 * 16.10.2026 — Google ID token doğrulayıcısı (ağ YOK: bozuk token kütüphanede
 * imza indirmeden reddedilir). Kullanıcı Türkçe genel mesaj görür; kütüphane
 * bazı mesajlara token'ı eklediği için log yalnızca gerekçeyi taşır.
 */
const configWith = (clientId: string) =>
  ({ env: { googleOAuthClientId: clientId, appleOAuthClientId: '' } }) as unknown as AppConfigService;

describe('GoogleAppleIdentityProvider.verifyGoogleIdToken', () => {
  afterEach(() => vi.restoreAllMocks());

  it('istemci kimliği yoksa açık "yapılandırılmamış" hatası', async () => {
    const error = await new GoogleAppleIdentityProvider(configWith('')).verifyGoogleIdToken('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidProviderTokenError);
    expect((error as Error).message).toContain('GOOGLE_OAUTH_CLIENT_ID');
  });

  it('bozuk token: genel Türkçe mesaj; log ve yanıt token\'ı taşımaz', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const token = 'gizli.parca.icerik.fazla';
    const provider = new GoogleAppleIdentityProvider(configWith('123456789012-abc.apps.googleusercontent.com'));
    const error = await provider.verifyGoogleIdToken(token).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidProviderTokenError);
    expect((error as Error).message).toBe(GOOGLE_TOKEN_REJECTED_MESSAGE);
    const logged = warn.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).toContain('Google ID token reddedildi');
    expect(logged).not.toContain(token);
  });
});
