import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { ApiSuccess } from '@at-sevdalisi/shared-types';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { reportError } from '../../infrastructure/ops/error-reporting';
import { Public } from '../auth/public.decorator';
import type { RequestWithId } from '../middleware/request-id.middleware';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

const limits = loadOpsConfig().clientErrors;

function clip(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : undefined;
}

/**
 * İSTEMCİ HATA RAPORU (02.10.2026, Faz 13-C) — web'in hata sınırı
 * (`app/error.tsx`, `app/global-error.tsx`) yakaladığı hatayı buraya
 * bildirir; hata raporlayıcısından (`reportError`) geçer. Oturum açmamış
 * oyuncuda da hata olabileceği için `@Public()`; kötüye kullanıma karşı IP
 * başına hız sınırı ve alan uzunluk sınırı (`ops.clientErrors`, aşan
 * kırpılır). Veritabanına YAZMAZ.
 *
 * İstemci yalnızca mesaj/özet/yol gönderir — kullanıcı girdisi, token ya da
 * kişisel veri GÖNDERMEZ (web tarafı yalnızca bu alanları doldurur).
 */
@Controller('client-errors')
export class ClientErrorsController {
  @RateLimit({ name: 'client-errors', limit: 30, windowSeconds: 300, keyBy: 'ip' })
  @Public()
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  report(
    @Body() body: { message?: unknown; digest?: unknown; path?: unknown },
    @Req() request: RequestWithId,
  ): ApiSuccess<{ accepted: true }> {
    const message = clip(body?.message, limits.maxMessageLength);
    if (message === undefined) {
      throw new BadRequestException('message boş olmayan bir metin olmalıdır.');
    }
    reportError(message, {
      source: 'client',
      requestId: request.requestId,
      digest: clip(body?.digest, limits.maxDigestLength),
      clientPath: clip(body?.path, limits.maxPathLength),
    });
    return { success: true, data: { accepted: true } };
  }
}
