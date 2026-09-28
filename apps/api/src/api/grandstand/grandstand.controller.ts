import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import type {
  ApiSuccess,
  RaceTicketPurchaseResult,
  RaceTicketRefundResult,
  WatchableRaceView,
} from '@at-sevdalisi/shared-types';
import { ListWatchableRacesUseCase } from '../../application/use-cases/list-watchable-races.use-case';
import { PurchaseRaceTicketUseCase } from '../../application/use-cases/purchase-race-ticket.use-case';
import { RefundRaceTicketUseCase } from '../../application/use-cases/refund-race-ticket.use-case';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * Tribün (proje sahibinin açık talebi, 27.09.2026: "yarış yapılan yerlerde
 * tribüne ücretli girişler olsun insanlar yarışları izleyebilsin").
 *
 * `@Controller('races')` — `RaceTimelineController` ile AYNI prefix, AYNI
 * gerekçeyle (`RecentRacesController`'ın `RaceController` ile AYNI modülü
 * farklı prefix'le paylaştığı desen, bkz. o dosyaların doc yorumları):
 * tam rota yolları çakışmaz — `GET races/watchable` (1 segment) ile
 * `GET races/:id/timeline` (2 segment) FARKLI yollardır.
 *
 * **Yetkilendirme `GetRaceTimelineUseCase`'in KENDİSİNDEDİR** — bu
 * dilimde o kapıya ikinci bir meşru gerekçe eklendi (bilet sahibi olmak).
 * Bu controller yalnızca BİLETİ SATAR; izleme iznini ayrıca VERMEZ veya
 * KONTROL ETMEZ (tek bir yetki kaynağı olsun diye).
 */
@Controller('races')
export class GrandstandController {
  constructor(
    @Inject(ListWatchableRacesUseCase) private readonly listWatchableRacesUseCase: ListWatchableRacesUseCase,
    @Inject(PurchaseRaceTicketUseCase) private readonly purchaseRaceTicketUseCase: PurchaseRaceTicketUseCase,
    @Inject(RefundRaceTicketUseCase) private readonly refundRaceTicketUseCase: RefundRaceTicketUseCase,
  ) {}

  /**
   * "Şu an tribünden izlenebilecek yarışlar" — kendi yarışları hariç,
   * son `watchWindowHours` saat içinde bitmiş yarışlar (bkz.
   * `WatchableRaceView` doc yorumu). Her satır, istek sahibinin o yarış
   * için ZATEN bileti olup olmadığını da taşır — istemci "Bilet Al" ile
   * "İzle" arasında seçim yapmak için ikinci bir istek atmaz.
   */
  @Get('watchable')
  async getWatchableRaces(
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<WatchableRaceView[]>> {
    const races = await this.listWatchableRacesUseCase.execute(currentPlayer.id);
    return { success: true, data: races };
  }

  /**
   * Bilet satın alma — **PARA YOLU**, bu yüzden `Idempotency-Key` header'ı
   * ZORUNLUDUR (`IdempotencyInterceptor` yoksa isteği bu satıra hiç
   * ULAŞTIRMAZ; `RunPracticeRace`/market `listings/:id/buy` ile AYNI
   * desen). `@IdempotencyScope('player')` — kapsam `:id` DEĞİL, kimliği
   * doğrulanmış oyuncudur (market buy ile AYNI gerekçe: `:id` burada
   * yarışın id'sidir, anahtarın kapsamı OLMAMALIDIR — aksi halde aynı
   * oyuncunun FARKLI yarışlara aynı anahtarla alacağı biletler
   * yanlışlıkla "aynı istek" sayılırdı).
   *
   * `RateLimit` — `docs/SECURITY.md` §7'nin "kritik ekonomi
   * endpoint'leri" kategorisi (market buy ile AYNI `keyBy: 'player'`
   * gerekçesi: IP değil oyuncu bazlı, çünkü limitin amacı paylaşılan bir
   * IP'yi cezalandırmak değil, tek bir hesabın saniyeler içinde onlarca
   * farklı yarışa bilet almasını durdurmaktır).
   */
  @RateLimit({ name: 'grandstand-ticket', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Post(':id/tickets')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async purchaseTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceTicketPurchaseResult>> {
    const result = await this.purchaseRaceTicketUseCase.execute(id, currentPlayer.id, idempotencyKey ?? null);
    return { success: true, data: result };
  }

  /**
   * Bilet iadesi ("tribünden ayrıl") — **PARA YOLU (ters yön)**, bu yüzden
   * `Idempotency-Key` header'ı satın almada olduğu gibi ZORUNLUDUR.
   *
   * **`DELETE`, `POST .../refund` DEĞİL:** silinen kaynak biletin
   * KENDİSİDİR (oyuncu-yarış çifti), yani `DELETE /races/:id/tickets`
   * doğru REST karşılığıdır — `DELETE /players/:id/blocks/:blockedId`
   * ile AYNI desen. Gövdesiz bir `POST` alt yolu, aynı kaynağa iki farklı
   * adres yaratırdı.
   *
   * `@IdempotencyScope('player')` ve `keyBy: 'player'` gerekçeleri satın
   * almayla AYNIDIR (`:id` yarışın id'sidir, anahtarın kapsamı değil).
   *
   * **Ayrı bir `RateLimit` sayacı** (`grandstand-ticket-refund`):
   * `RateLimitOptions.name` sayacı PAYLAŞIR — satın alma ile aynı adı
   * kullanmak, iki rotanın tek bütçeyi bölmesi demek olurdu
   * (`CLAUDE.md`'nin kopyala-yapıştır tuzağı notu).
   */
  @RateLimit({ name: 'grandstand-ticket-refund', limit: 20, windowSeconds: 60, keyBy: 'player' })
  @IdempotencyScope('player')
  @Delete(':id/tickets')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async refundTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<RaceTicketRefundResult>> {
    const result = await this.refundRaceTicketUseCase.execute(id, currentPlayer.id, idempotencyKey ?? null);
    return { success: true, data: result };
  }
}
