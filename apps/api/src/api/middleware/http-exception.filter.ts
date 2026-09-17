import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@at-sevdalisi/shared-types';
import {
  HorseInjuredError,
  HorseListedInMarketError,
  HorseNotFoundError,
  InvalidHorseNameError,
} from '../../domain/horse/errors';
import {
  InvalidDisplayNameError,
  InvalidUsernameError,
  PlayerNotFoundError,
  UsernameAlreadyTakenError,
} from '../../domain/player/errors';
import {
  ForbiddenError,
  InvalidAuthTokenError,
  InvalidProviderTokenError,
  MissingAuthTokenError,
} from '../../domain/auth/errors';
import { HorseNotReadyForTrainingError, InvalidTrainingInputError } from '../../domain/training/errors';
import { CareActionOnCooldownError, InvalidCareInputError } from '../../domain/care/errors';
import { MaxStableLevelReachedError, StableCapacityExceededError } from '../../domain/stable/errors';
import { DailyRewardAlreadyClaimedError, InsufficientFundsError } from '../../domain/economy/errors';
import { InvalidRaceTacticError } from '../../domain/race/errors';
import { AlreadyInMatchmakingQueueError, NotInMatchmakingQueueError } from '../../domain/online/errors';
import {
  CannotBuyOwnListingError,
  HorseAlreadyListedError,
  InvalidListingExpiryError,
  InvalidListingPriceError,
  ListingExpiredError,
  ListingNotActiveError,
  ListingNotFoundError,
  ListingStaleOwnerError,
} from '../../domain/market/errors';
import { IdempotencyKeyInProgressError, IdempotencyKeyRequiredError } from '../idempotency/idempotency.errors';

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
  // FAZ 1 wiring, dördüncü dilim — Antrenman (brief §10). "Çok yorgun"/
  // "yetersiz enerji" durumları GEÇİCİDİR (biraz bekleyince tekrar
  // denenebilir), sabit bir kaynak kısıtı DEĞİLDİR — bu yüzden 409
  // Conflict, 400 Bad Request DEĞİL (`UsernameAlreadyTaken` ile AYNI
  // gerekçe).
  [HorseInjuredError, { status: HttpStatus.CONFLICT, code: ErrorCode.HorseInjured }],
  // AUDIT_REPORT.md Bulgu H2 (Medium) — pazarda aktif ilanı olan bir at antrenmana veya yarışa sokulamaz.
  [HorseListedInMarketError, { status: HttpStatus.CONFLICT, code: 'HORSE_LISTED_IN_MARKET' }],
  // CI Hata 7 (bkz. domain/training/errors.ts InvalidTrainingInputError) —
  // DTO doğrulaması esbuild altında atlanabildiğinde domain katmanının
  // kendi bağımsız kontrolünün fırlattığı hata; gerçek bir DOĞRULAMA
  // hatasıdır, bu yüzden diğerleri gibi 400.
  [InvalidTrainingInputError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // FAZ 1 wiring, beşinci dilim — Bakım (brief §11). "Cooldown dolmadı"
  // GEÇİCİDİR — `HorseInjuredError`/`HorseNotReadyForTrainingError` ile
  // AYNI gerekçeyle 409 Conflict.
  [CareActionOnCooldownError, { status: HttpStatus.CONFLICT, code: ErrorCode.CareActionOnCooldown }],
  // Hata 7'nin (bkz. domain/care/errors.ts InvalidCareInputError) BAŞTAN
  // uygulanmış hali — gerçek bir DOĞRULAMA hatasıdır, 400.
  [InvalidCareInputError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // FAZ 1 wiring, altıncı dilim — Ahır Yükseltme (brief §32). "Zaten en
  // yüksek seviyede" mevcut duruma bağlı bir engeldir (yeni bir seviye
  // config'e eklenirse değişebilir) — kalıcı bir doğrulama hatası DEĞİL,
  // `HorseInjuredError` ile AYNI gerekçeyle 409 Conflict.
  [MaxStableLevelReachedError, { status: HttpStatus.CONFLICT, code: ErrorCode.MaxStableLevelReached }],
  // "Yetersiz bakiye" de GEÇİCİDİR (oyuncu daha fazla para kazanınca
  // çözülür) — `HorseNotReadyForTrainingError`'ın INSUFFICIENT_ENERGY
  // dalıyla AYNI gerekçeyle 409 Conflict, 402/400 DEĞİL.
  [InsufficientFundsError, { status: HttpStatus.CONFLICT, code: ErrorCode.InsufficientFunds }],
  // FAZ 1 wiring, yedinci dilim — Günlük Ödül (brief §37).
  // `CareActionOnCooldownError` ile AYNI gerekçeyle 409 Conflict.
  [DailyRewardAlreadyClaimedError, { status: HttpStatus.CONFLICT, code: ErrorCode.DailyRewardAlreadyClaimed }],
  // FAZ 1 wiring, sekizinci dilim — Pratik Yarış (brief §6). Geçersiz bir
  // taktik alanı `InvalidTrainingInputError`/`InvalidCareInputError` ile
  // AYNI gerekçeyle gerçek bir DOĞRULAMA hatasıdır, 400.
  [InvalidRaceTacticError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.ValidationError }],
  // FAZ 1 wiring, dokuzuncu dilim — brief §54 Idempotency-Key. Eksik
  // header GERÇEK bir doğrulama hatası DEĞİLDİR (DTO/gövde şeklini
  // ilgilendirmez) — kendi özel `ErrorCode.IdempotencyKeyRequired`'ı
  // FAZ 0'dan beri taslakta duruyordu, ilk kez burada kullanılıyor.
  [IdempotencyKeyRequiredError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.IdempotencyKeyRequired }],
  // AUDIT_AND_HARDENING Öncelik 3 (bu oturum) — GEÇİCİ/duruma bağlı bir
  // engeldir (kısa süre sonra tekrar denenebilir), `HorseInjuredError`
  // ile AYNI gerekçeyle 409 Conflict, 400 DEĞİL.
  [IdempotencyKeyInProgressError, { status: HttpStatus.CONFLICT, code: ErrorCode.IdempotencyKeyInProgress }],
  // FAZ 1 wiring, on birinci dilim — At Pazarı (brief §30). `errors.ts`'teki
  // dört sınıf FAZ 0'dan beri TASLAKTA duruyordu, burada İLK KEZ gerçekten
  // fırlatılabilir hale geliyor. `InvalidListingPriceError` gerçek bir
  // DOĞRULAMA hatasıdır (Hata 7 ilkesiyle AYNI, 400); `CannotBuyOwnListingError`
  // da yapısal bir istek hatasıdır (kalıcı, tekrar denemekle DÜZELMEZ), 400.
  [InvalidListingPriceError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidListingPrice }],
  // FAZ 1 wiring, on üçüncü dilim — `InvalidListingPriceError` ile AYNI
  // gerekçe/desen (gerçek bir DOĞRULAMA hatası, 400), kendi bespoke
  // `ErrorCode.InvalidListingExpiry`'siyle (sibling hata sınıfıyla AYNI
  // dosyada, AYNI kategori).
  [InvalidListingExpiryError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.InvalidListingExpiry }],
  [CannotBuyOwnListingError, { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CannotBuyOwnListing }],
  [ListingNotFoundError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.ListingNotFound }],
  // "Aktif değil"/"süresi dolmuş" GEÇİCİ/duruma-bağlı engellerdir —
  // `MaxStableLevelReachedError`/`HorseInjuredError` ile AYNI gerekçeyle
  // 409 Conflict, 400/404 DEĞİL.
  [ListingNotActiveError, { status: HttpStatus.CONFLICT, code: ErrorCode.ListingNotActive }],
  [ListingExpiredError, { status: HttpStatus.CONFLICT, code: ErrorCode.ListingExpired }],
  [HorseAlreadyListedError, { status: HttpStatus.CONFLICT, code: ErrorCode.HorseAlreadyListed }],
  // AUDIT_REPORT.md Bulgu D2 (bu oturum) — bkz. domain/market/errors.ts `ListingStaleOwnerError`.
  [ListingStaleOwnerError, { status: HttpStatus.CONFLICT, code: ErrorCode.ListingStaleOwner }],
  // AUDIT_REPORT.md Bulgu C1 (bu oturum) — bkz. domain/stable/errors.ts `StableCapacityExceededError`.
  [StableCapacityExceededError, { status: HttpStatus.CONFLICT, code: ErrorCode.StableCapacityExceeded }],
  // FAZ 1 wiring, on dördüncü dilim — PvP Eşleştirme (brief §41).
  // `HorseAlreadyListedError` ile AYNI gerekçeyle (duruma bağlı, geçici —
  // önce kuyruktan çıkılırsa çözülür) 409 Conflict.
  [AlreadyInMatchmakingQueueError, { status: HttpStatus.CONFLICT, code: ErrorCode.AlreadyInMatchmakingQueue }],
  // `ListingNotFoundError` ile AYNI kategori (bulunamayan bir kaynak —
  // burada "bilet"), 404.
  [NotInMatchmakingQueueError, { status: HttpStatus.NOT_FOUND, code: ErrorCode.NotInMatchmakingQueue }],
  // AUDIT_REPORT.md Bulgu S1/S2/S4 hardening (bu oturum) — bkz.
  // `domain/auth/errors.ts` doc yorumu. İKİSİ de 401: token hiç YOK ya da
  // GEÇERSİZ — istemci için pratik fark yoktur (ikisinde de yeniden
  // giriş/kayıt gerekir), bu yüzden AYNI `ErrorCode.Unauthorized`'ı paylaşırlar.
  [MissingAuthTokenError, { status: HttpStatus.UNAUTHORIZED, code: ErrorCode.Unauthorized }],
  [InvalidAuthTokenError, { status: HttpStatus.UNAUTHORIZED, code: ErrorCode.Unauthorized }],
  // Token GEÇERLİ ama sahiplik yok — kavramsal olarak 401'den FARKLI, bkz.
  // `ForbiddenError` doc yorumu.
  [ForbiddenError, { status: HttpStatus.FORBIDDEN, code: ErrorCode.Forbidden }],
  // `POST /auth/login`'e özgü — bkz. `InvalidProviderTokenError` doc yorumu.
  [InvalidProviderTokenError, { status: HttpStatus.UNAUTHORIZED, code: ErrorCode.InvalidProviderToken }],
]);

/**
 * Tüm hataları docs/API.md §1.2'deki tutarlı zarfa dönüştürür:
 *    { "success": false, "error": { "code": "...", "message": "..." } }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HorseNotReadyForTrainingError) {
      const code = exception.reason === 'INSUFFICIENT_ENERGY' ? ErrorCode.InsufficientEnergy : ErrorCode.HorseTooTired;
      response.status(HttpStatus.CONFLICT).json({ success: false, error: { code, message: exception.message } });
      return;
    }

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