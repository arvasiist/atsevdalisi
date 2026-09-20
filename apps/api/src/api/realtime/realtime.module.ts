import { Module } from '@nestjs/common';
import { RaceModule } from '../race/race.module';
import { RaceGateway } from './race.gateway';

/**
 * AUDIT_REPORT.md Bulgu F2 (bu oturum) — bkz. `race.gateway.ts` doc
 * yorumu. `RaceModule`'ü import eder (yalnızca `GetRaceTimelineUseCase`
 * için — `RaceModule`'ün diğer sağlayıcılarına/controller'larına
 * dokunulmaz). `TOKEN_SERVICE` `@Global()` `TokenModule`'den geldiğinden
 * (bkz. `app.module.ts`) burada AYRICA import edilmesine GEREK YOK.
 */
@Module({
  imports: [RaceModule],
  providers: [RaceGateway],
})
export class RealtimeModule {}
