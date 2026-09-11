import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@at-sevdalisi/shared-types';

/**
 * Tüm hataları docs/API.md §1.2'deki tutarlı zarfa dönüştürür:
 *   { "success": false, "error": { "code": "...", "message": "..." } }
 *
 * Domain/Application katmanından fırlatılan özel hata sınıfları (FAZ 1'de
 * eklenecek, örn. HorseTooTiredError) burada ilgili HTTP durum koduna ve
 * hata koduna eşlenecektir.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string | string[] }).message ?? exception.message);

      response.status(status).json({
        success: false,
        error: {
          code: status === HttpStatus.BAD_REQUEST ? ErrorCode.ValidationError : ErrorCode.NotFound,
          message: Array.isArray(message) ? message.join(', ') : message,
        },
      });
      return;
    }

    // Beklenmeyen hata: detay istemciye sızdırılmaz (docs/SECURITY.md), sadece loglanır.
    // eslint-disable-next-line no-console
    console.error('Beklenmeyen hata:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Beklenmeyen bir hata oluştu.',
      },
    });
  }
}
