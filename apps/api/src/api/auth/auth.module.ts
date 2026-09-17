import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IDENTITY_PROVIDER_VERIFIER } from '../../application/ports/identity-provider';
import { PLAYER_AUTH_PROVIDER_REPOSITORY } from '../../application/ports/player-auth-provider.repository';
import { LoginWithProviderUseCase } from '../../application/use-cases/login-with-provider.use-case';
import { GoogleAppleIdentityProvider } from '../../infrastructure/auth/google-apple-identity-provider';
import { PostgresPlayerAuthProviderRepository } from '../../infrastructure/player/postgres-player-auth-provider.repository';
import { HorseModule } from '../horse/horse.module';
import { PlayerModule } from '../player/player.module';
import { AuthController } from './auth.controller';
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
  controllers: [AuthController],
  providers: [
    LoginWithProviderUseCase,
    { provide: IDENTITY_PROVIDER_VERIFIER, useClass: GoogleAppleIdentityProvider },
    { provide: PLAYER_AUTH_PROVIDER_REPOSITORY, useClass: PostgresPlayerAuthProviderRepository },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
