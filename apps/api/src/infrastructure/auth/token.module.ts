import { Global, Module } from '@nestjs/common';
import { TOKEN_SERVICE } from '../../application/ports/token.service';
import { JsonWebTokenService } from './jsonwebtoken-token.service';

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
@Global()
@Module({
  providers: [{ provide: TOKEN_SERVICE, useClass: JsonWebTokenService }],
  exports: [TOKEN_SERVICE],
})
export class TokenModule {}
