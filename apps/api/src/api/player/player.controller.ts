import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
 */
@Controller('players')
export class PlayerController {
  constructor(
    private readonly registerPlayerUseCase: RegisterPlayerUseCase,
    private readonly getPlayerUseCase: GetPlayerUseCase,
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
