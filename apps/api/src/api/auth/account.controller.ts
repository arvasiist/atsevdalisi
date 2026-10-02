import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type { AccountDeletionCheck, ApiSuccess } from '@at-sevdalisi/shared-types';
import { DeleteAccountUseCase } from '../../application/use-cases/delete-account.use-case';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { CurrentPlayer, type AuthenticatedPlayer } from './current-player.decorator';

/**
 * HESAP SİLME (02.10.2026, migration 0059). Oyuncu YALNIZCA token'dan gelir;
 * gövdede başka bir oyuncu kimliği kabul edilmez. Gövde HAM geçirilir,
 * doğrulama use-case'tedir (CLAUDE.md kural 5).
 */
@Controller('account')
export class AccountController {
  constructor(@Inject(DeleteAccountUseCase) private readonly deleteAccount: DeleteAccountUseCase) {}

  @Get('deletion')
  @HttpCode(HttpStatus.OK)
  async check(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<AccountDeletionCheck>> {
    return { success: true, data: await this.deleteAccount.check(currentPlayer.id) };
  }

  @RateLimit({ name: 'account-delete', limit: 5, windowSeconds: 900, keyBy: 'player' })
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Body() body: { confirmUsername?: unknown; password?: unknown },
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<{ deleted: true }>> {
    await this.deleteAccount.execute(currentPlayer.id, body?.confirmUsername, body?.password);
    return { success: true, data: { deleted: true } };
  }
}
