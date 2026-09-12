import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@at-sevdalisi/shared-types';
import { HorseNotFoundError, InvalidHorseNameError } from '../../domain/horse/errors';
import {
  InvalidDisplayNameError,
  InvalidUsernameError,
  PlayerNotFoundError,
  UsernameAlreadyTakenError,
} from '../../domain/player/errors';

/**
 * Bir hata sınıfının constructor'ı (`instanceof` ile karşılaştırılabilir).
 * `Function` (herhangi bir çağrılabilir değer) yerine bilinçli olarak bu
 * dar tip kullanılır — ESLint'in `@typescript-eslint/recommended` seti
 * `Function` tipini tip güvenliği sağlamadığı için HATA olarak yasaklar
 * (bkz. docs/ROADMAP.md "FAZ 1 wiring" — bu, üç CI denemesinin GERÇEK
 * kök nedeniydi, önceki teoriler yanlıştı).
 */
type ErrorClassConstructor = new (...args: never[]) => Error;

/**
 * Domain hata sınıfı → (HTTP durumu, hata kodu) eşlemesi. Her yeni domain
 * modülü wiring'e bağlandığında (Horse, Race, Market, ...) buraya bir satır
 * eklenir — domain katmanının KENDİSİ hiçbir zaman HTTP bilmez (bkz.
 * docs/ARCHITECTURE.md §4), bu eşleme yalnızca API katmanında yaşar.
 */
const DOMAIN_ERROR_MAP = new Map<ErrorClassConstructor, { status: number; code: string }>([
  [UsernameAlreadyTakenError, { status: HttpStatus.CONFLICT, code: ErrorCode.UsernameAlreadyTaken }],
  [PlayerNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.PlayerNotFound }],
  [InvalidUsernameError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  [InvalidDisplayNameError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  [HorseNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.HorseNotFound }],
  [InvalidHorseNameError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
]);

/**
 * Tüm hataları docs/API.md §1.2'deki tutarlı zarfa dönüştürür:
 *   { "success": false, "error": { "code": "...", "message": "..." } }
 *
 * Domain/Application katmanından fırlatılan özel hata sınıfları
 * `DOMAIN_ERROR_MAP`'te ilgili HTTP durum koduna ve hata koduna eşlenir
 * (FAZ 1 wiring, bu oturum); eşlemede olmayan (örn. class-validator'ın
 * fırlattığı `HttpException`) durumlar aşağıdaki genel akışla ele alınır.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    for (const [ErrorClass, mapping] of DOMAIN_ERROR_MAP) {
      if (exception instanceof ErrorClass) {
        response.status(mapping.status).json({
          success: false,
          error: { code: mapping.code, message: (exception as Error).message },
        });
        return;
      }
    }

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
