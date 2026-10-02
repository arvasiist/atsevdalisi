import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IDENTITY_PROVIDER_VERIFIER } from '../../application/ports/identity-provider';
import { PLAYER_AUTH_PROVIDER_REPOSITORY } from '../../application/ports/player-auth-provider.repository';
import { LinkProviderUseCase } from '../../application/use-cases/link-provider.use-case';
import { LoginWithProviderUseCase } from '../../application/use-cases/login-with-provider.use-case';
import { PasswordAuthUseCase } from '../../application/use-cases/password-auth.use-case';
import { EmailVerificationUseCase } from '../../application/use-cases/email-verification.use-case';
import { PASSWORD_HASHER } from '../../application/ports/password-hasher';
import { PLAYER_CREDENTIALS_REPOSITORY } from '../../application/ports/player-credentials.repository';
import { PostgresPlayerCredentialsRepository } from '../../infrastructure/auth/postgres-player-credentials.repository';
import { ScryptPasswordHasher } from '../../infrastructure/auth/scrypt-password-hasher';
import { EMAIL_SENDER } from '../../application/ports/email-sender';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { OutboxEmailSender } from '../../infrastructure/email/outbox-email-sender';
import { ResendEmailSender } from '../../infrastructure/email/resend-email-sender';
import { GoogleAppleIdentityProvider } from '../../infrastructure/auth/google-apple-identity-provider';
import { PostgresPlayerAuthProviderRepository } from '../../infrastructure/player/postgres-player-auth-provider.repository';
import { HorseModule } from '../horse/horse.module';
import { PlayerModule } from '../player/player.module';
import { AuthController } from './auth.controller';
import { AccountController } from './account.controller';
import { DeleteAccountUseCase } from '../../application/use-cases/delete-account.use-case';
import { ACCOUNT_DELETION_REPOSITORY } from '../../application/ports/account-deletion.repository';
import { PostgresAccountDeletionRepository } from '../../infrastructure/account/postgres-account-deletion.repository';
import { AuthGuard } from './auth.guard';

/**
 * AUDIT_REPORT.md Bulgu S1 (Critical) hardening (bu oturum) — brief §41/§50
 * Google/Apple Sign-In. `AuthGuard` burada `APP_GUARD` özel token'ıyla
 * GLOBAL olarak kaydedilir (Nest, `APP_GUARD`/`APP_FILTER`/`APP_INTERCEPTOR`
 * gibi özel token'ları HANGİ modülden sağlandığından bağımsız olarak
 * uygulama genelinde uygular) — bu, `@Public()` işaretli olmayan HER
 * rotanın (health/register/login hariç TÜMÜ) artık geçerli bir
 * `Authorization: Bearer <token>` header'ı gerektirdiği anlamına gelir.
 *
 * `PlayerModule`'ü import eder (`PLAYER_REPOSITORY` için — `LoginWithProviderUseCase`
 * mevcut oyuncuyu bulmak/yeni oyuncu kaydetmek için kullanır) VE `HorseModule`'ü
 * AYRICA import eder (`PlayerModule` `HORSE_REPOSITORY`'yi kendi `exports`'una
 * eklemez — bkz. `player.module.ts` — bu yüzden başlangıç atı vermek için
 * `HORSE_REPOSITORY`'ye ihtiyaç duyan bu modülün onu DOĞRUDAN import etmesi
 * gerekir, `stable.module.ts`/`matchmaking.module.ts` ile AYNI desen).
 */
@Module({
  imports: [PlayerModule, HorseModule],
  controllers: [AuthController, AccountController],
  providers: [
    LoginWithProviderUseCase,
    // 01.10.2026 — Google hesabı bağlama (migration 0048).
    LinkProviderUseCase,
    // 30.09.2026 — e-posta + şifre girişi (migration 0046).
    PasswordAuthUseCase,
    // 02.10.2026 — e-posta doğrulama (migration 0058).
    EmailVerificationUseCase,
    // 02.10.2026 — hesap silme (migration 0059).
    DeleteAccountUseCase,
    { provide: ACCOUNT_DELETION_REPOSITORY, useClass: PostgresAccountDeletionRepository },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: PLAYER_CREDENTIALS_REPOSITORY, useClass: PostgresPlayerCredentialsRepository },
    // Şifre sıfırlama e-postası (migration 0047): `RESEND_API_KEY` varsa
    // gerçek gönderim, yoksa bellek içi giden kutusu (bkz. sınıf doc yorumları).
    {
      provide: EMAIL_SENDER,
      useFactory: (config: AppConfigService) =>
        config.env.resendApiKey !== ''
          ? new ResendEmailSender(config.env.resendApiKey, config.env.mailFrom)
          : new OutboxEmailSender(config.env.nodeEnv),
      inject: [AppConfigService],
    },
    { provide: IDENTITY_PROVIDER_VERIFIER, useClass: GoogleAppleIdentityProvider },
    { provide: PLAYER_AUTH_PROVIDER_REPOSITORY, useClass: PostgresPlayerAuthProviderRepository },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // Testler sıfırlama e-postasını giden kutusundan okur (`app.get(EMAIL_SENDER)`).
  exports: [EMAIL_SENDER],
})
export class AuthModule {}
