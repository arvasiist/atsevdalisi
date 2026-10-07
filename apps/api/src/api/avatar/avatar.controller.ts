import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import type { ApiSuccess, AvatarView } from '@at-sevdalisi/shared-types';
import { AvatarUseCase } from '../../application/use-cases/avatar.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * AVATAR (07.10.2026). Oyuncu kimliği YALNIZCA token'dan gelir; gövde
 * `{ appearance }` alan alan katalogla doğrulanır (DTO'ya güvenilmez —
 * CLAUDE.md kural 5'in kardeş tuzağı).
 */
@Controller('avatar')
export class AvatarController {
  constructor(@Inject(AvatarUseCase) private readonly avatars: AvatarUseCase) {}

  @Get()
  async get(@CurrentPlayer() player: AuthenticatedPlayer): Promise<ApiSuccess<AvatarView>> {
    return { success: true, data: await this.avatars.get(player.id) };
  }

  @RateLimit({ name: 'avatar-save', limit: 30, windowSeconds: 300, keyBy: 'player' })
  @Put()
  async save(
    @Body() body: { appearance?: unknown } | undefined,
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<ApiSuccess<AvatarView>> {
    return { success: true, data: await this.avatars.save(player.id, body?.appearance) };
  }
}
