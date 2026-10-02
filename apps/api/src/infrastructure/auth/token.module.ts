import { Global, Module } from '@nestjs/common';
import { TOKEN_SERVICE } from '../../application/ports/token.service';
import { AUTH_SESSION_REPOSITORY } from '../../application/ports/auth-session.repository';
import { AuthSessionUseCase } from '../../application/use-cases/auth-session.use-case';
import { JsonWebTokenService } from './jsonwebtoken-token.service';
import { PostgresAuthSessionRepository } from './postgres-auth-session.repository';

/**
 * `TokenModule` — `DatabaseModule`/`RedisModule`/`AppConfigModule` ile AYNI
 * desen: `@Global()` olduğundan `AppModule`'e BİR KEZ eklenmesi yeterlidir,
 * `TOKEN_SERVICE` her yerde (`AuthGuard`, `PlayerController`,
 * `AuthController`, ...) ayrıca `imports`'a eklemeye GEREK OLMADAN enjekte
 * edilebilir. Bilinçli olarak `AuthModule`'DEN AYRI bir modül: `AuthModule`
 * (`PlayerAuthProviderRepository` için) `PlayerModule`'ü import eder,
 * `PlayerModule` da (kayıt sırasında JWT imzalamak için) `TOKEN_SERVICE`'e
 * ihtiyaç duyar — bu, `TOKEN_SERVICE` `AuthModule` İÇİNDEN export edilseydi
 * DAİRESEL bir modül bağımlılığı (`PlayerModule` → `AuthModule` →
 * `PlayerModule`) yaratırdı. `@Global()` bu sorunu tamamen ORTADAN KALDIRIR.
 */
//
// 02.10.2026 — OTURUM (migration 0057): `AuthSessionUseCase` da burada
// yaşar; guard, soket el sıkışması ve kayıt/giriş uçları aynı örneği kullanır.
@Global()
@Module({
  providers: [
    { provide: TOKEN_SERVICE, useClass: JsonWebTokenService },
    { provide: AUTH_SESSION_REPOSITORY, useClass: PostgresAuthSessionRepository },
    AuthSessionUseCase,
  ],
  exports: [TOKEN_SERVICE, AuthSessionUseCase],
})
export class TokenModule {}
