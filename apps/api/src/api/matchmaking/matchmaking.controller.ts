import { BadRequestException, Body, Controller, Delete, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ApiSuccess, JoinMatchmakingQueueResult, MatchmakingTicket } from '@at-sevdalisi/shared-types';
import { JoinMatchmakingQueueUseCase } from '../../application/use-cases/join-matchmaking-queue.use-case';
import { LeaveMatchmakingQueueUseCase } from '../../application/use-cases/leave-matchmaking-queue.use-case';
import { JoinMatchmakingQueueDto } from './dto/join-matchmaking-queue.dto';

/**
 * docs/API.md §9 "Online / Sıralama / Kulüp / Turnuva / Sezon (FAZ 7)"
 * — `POST`/`DELETE /matchmaking/queue` (brief §41). FAZ 1 wiring, on
 * dördüncü dilim — `domain/online/{matchmaking,elo,race-room}.ts`'in
 * FAZ 0'dan beri hazır ama hiç wiring edilmemiş saf fonksiyonlarını
 * gerçek veritabanına bağlayan İLK dilim (bkz. `JoinMatchmakingQueueUseCase`
 * doc yorumu). Bu dilim, docs/API.md §9'da belgelenmiş 8 uç noktadan
 * (leaderboard/club/tournament/season) yalnızca BU İKİSİNİ wiring eder —
 * diğerleri (`domain/{ranking,club,tournament,season}`) KAPSAM DIŞI
 * bırakılmıştır (bkz. docs/ROADMAP.md).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık
 * `@Inject()` ile enjekte edilir.
 */
@Controller('matchmaking')
export class MatchmakingController {
  constructor(
    @Inject(JoinMatchmakingQueueUseCase) private readonly joinMatchmakingQueueUseCase: JoinMatchmakingQueueUseCase,
    @Inject(LeaveMatchmakingQueueUseCase) private readonly leaveMatchmakingQueueUseCase: LeaveMatchmakingQueueUseCase,
  ) {}

  // Eşleşme HEMEN bulunursa (bkz. use-case doc yorumu) yeni bir
  // KAYNAK (bir `pvp_matches` satırı) yaratılır; bulunamazsa yeni bir
  // kuyruk bileti yaratılır — HER İKİ dal da 201 Created'ı hak eder
  // (`PlayerController.register`/`MarketController.createListing` ile
  // AYNI gerekçe).
  @Post('queue')
  @HttpCode(HttpStatus.CREATED)
  async join(@Body() dto: JoinMatchmakingQueueDto): Promise<ApiSuccess<JoinMatchmakingQueueResult>> {
    // DÜZELTME (bu oturum, on dördüncü dilimin CI denemesi) — bkz.
    // docs/ARCHITECTURE.md §9.1 Hata 7'nin AYNI kök nedeninin BURADA da
    // yeniden ortaya çıkması: `@Body() dto: JoinMatchmakingQueueDto`'nun
    // `@IsUUID()` doğrulaması, `ValidationPipe`'ın metatype'ı çözmek için
    // ihtiyaç duyduğu `design:paramtypes` üst verisi Vitest/esbuild
    // altında YAYINLANMADIĞINDAN sessizce ATLANIR — geçersiz bir
    // `horseId` doğrudan `JoinMatchmakingQueueUseCase`'e ve oradan
    // `horseRepository.findById(...)`'e ulaşıp ham bir Postgres tip
    // hatasıyla 500'e dönüşüyordu (CI run'da gözlemlenen GERÇEK hata).
    // `leave()`'in (aşağıda) ve `horse.controller.ts` `listByOwner`'ın
    // ZATEN kullandığı elle `isUUID()` kontrolü, DTO'nun decorator'larına
    // TEK BAŞINA güvenmek yerine burada da bağımsız bir ikinci savunma
    // hattı olarak eklenir (Hata 6/7'nin ORTAK dersi, bkz. o dosya).
    if (!dto.horseId || !isUUID(dto.horseId)) {
      throw new BadRequestException('horseId geçerli bir UUID olmalıdır.');
    }
    const result = await this.joinMatchmakingQueueUseCase.execute({ horseId: dto.horseId });
    return { success: true, data: result };
  }

  // `horseId` query parametresi olarak alınır (`MarketController.listMyListings`'in
  // `sellerId` query parametresiyle AYNI gerekçe — bu projede henüz
  // gerçek bir kimlik doğrulama/oturum sistemi YOK). Var olan bir
  // kaynağı SİLER — `MarketController.cancelListing` ile AYNI gerekçeyle
  // 200 OK (201 DEĞİL).
  @Delete('queue')
  @HttpCode(HttpStatus.OK)
  async leave(@Query('horseId') horseId: string | undefined): Promise<ApiSuccess<MatchmakingTicket>> {
    if (!horseId || !isUUID(horseId)) {
      throw new BadRequestException('horseId geçerli bir UUID olmalıdır.');
    }
    const ticket = await this.leaveMatchmakingQueueUseCase.execute(horseId);
    return { success: true, data: ticket };
  }
}
