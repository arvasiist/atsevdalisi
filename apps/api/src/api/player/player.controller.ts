import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ApiSuccess, Player, PlayerSummary } from '@at-sevdalisi/shared-types';
import { GetPlayerUseCase } from '../../application/use-cases/get-player.use-case';
import { RegisterPlayerUseCase } from '../../application/use-cases/register-player.use-case';
import { RegisterPlayerDto } from './dto/register-player.dto';

function toSummary(player: Player): PlayerSummary {
  return {
    id: player.id,
    displayName: player.displayName,
    avatarId: player.avatarId,
    level: player.level,
    xp: player.xp,
    money: player.money,
    gems: player.gems,
  };
}

/**
 * docs/API.md §3 Player. İş kuralı İÇERMEZ — sadece Application katmanını
 * çağırır ve sonucu docs/API.md §1.1 zarfına sarar (bkz.
 * docs/ARCHITECTURE.md §4 "API: ... İş kuralı içermez").
 *
 * NOT — gerçek kimlik doğrulama (brief §41/§50 Google/Apple Sign-In)
 * henüz bağlı DEĞİLDİR (bkz. `RegisterPlayerUseCase` üstündeki not); bu
 * yüzden `POST /players` şimdilik doğrudan (token gerektirmeden) kayıt
 * sağlayan bir geliştirme/demo uç noktasıdır.
 *
 * NOT — kök neden (FAZ 1 wiring, beşinci CI hatası): buradaki iki
 * bağımlılık daha önce açık bir `@Inject()` token'ı OLMADAN, sadece
 * TypeScript tipine göre (örtük/implicit) enjekte ediliyordu. Bu, gerçek
 * `npm run build` (tsc) çıktısında çalışır çünkü tsc, `emitDecoratorMetadata`
 * ile `design:paramtypes` üst verisini yayınlar — ANCAK Vitest, dosyaları
 * esbuild ile dönüştürür ve esbuild tip bilgisine sahip olmadığından bu üst
 * veriyi HİÇBİR ZAMAN yaymaz (tsconfig'te `emitDecoratorMetadata: true`
 * olsa bile). Sonuç: `apps/api/test/api/player.e2e-spec.ts` gerçek Postgres'e
 * karşı çalışırken bu alanlar `undefined` kalıyor ve `.execute(...)`
 * çağrısı `TypeError: Cannot read properties of undefined (reading
 * 'execute')` ile patlıyor. Kalıcı çözüm: her yerde (bu projede zaten
 * `PLAYER_REPOSITORY`/`PG_POOL` için yapıldığı gibi) açık `@Inject()`
 * token'ı kullanmak — bu, hem tsc hem esbuild altında aynı şekilde çalışır.
 */
@Controller('players')
export class PlayerController {
  constructor(
    @Inject(RegisterPlayerUseCase) private readonly registerPlayerUseCase: RegisterPlayerUseCase,
    @Inject(GetPlayerUseCase) private readonly getPlayerUseCase: GetPlayerUseCase,
  ) {}

  @Post()
  async register(@Body() dto: RegisterPlayerDto): Promise<ApiSuccess<PlayerSummary>> {
    const player = await this.registerPlayerUseCase.execute(dto);
    return { success: true, data: toSummary(player) };
  }

  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<ApiSuccess<PlayerSummary>> {
    const player = await this.getPlayerUseCase.execute(id);
    return { success: true, data: toSummary(player) };
  }
}
