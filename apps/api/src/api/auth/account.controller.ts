import { Body, Controller, Get, Header, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type { AccountDataExport, AccountDeletionCheck, ApiSuccess } from '@at-sevdalisi/shared-types';
import { DeleteAccountUseCase } from '../../application/use-cases/delete-account.use-case';
import { ExportAccountDataUseCase } from '../../application/use-cases/export-account-data.use-case';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { CurrentPlayer, type AuthenticatedPlayer } from './current-player.decorator';

/**
 * HESAP SİLME (02.10.2026, migration 0059). Oyuncu YALNIZCA token'dan gelir;
 * gövdede başka bir oyuncu kimliği kabul edilmez. Gövde HAM geçirilir,
 * doğrulama use-case'tedir (CLAUDE.md kural 5).
 */
@Controller('account')
export class AccountController {
  constructor(
    @Inject(DeleteAccountUseCase) private readonly deleteAccount: DeleteAccountUseCase,
    @Inject(ExportAccountDataUseCase) private readonly exportData: ExportAccountDataUseCase,
  ) {}

  /**
   * KİŞİSEL VERİ DIŞA AKTARMA (02.10.2026, KVKK md. 11 / GDPR md. 15, 20).
   * Ağır bir okuma olduğu için sık çağrılamaz; yanıt önbelleğe alınmaz.
   */
  @RateLimit({ name: 'account-export', limit: 3, windowSeconds: 3600, keyBy: 'player' })
  @Get('export')
  @Header('Cache-Control', 'no-store')
  async export(@CurrentPlayer() currentPlayer: AuthenticatedPlayer): Promise<ApiSuccess<AccountDataExport>> {
    return { success: true, data: await this.exportData.execute(currentPlayer.id) };
  }

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
