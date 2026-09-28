import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import type { ApiSuccess, ClaimDailyRewardResult, WalletDepositResult, WalletView } from '@at-sevdalisi/shared-types';
import { ClaimDailyRewardUseCase } from '../../application/use-cases/claim-daily-reward.use-case';
import { DepositFundsUseCase } from '../../application/use-cases/deposit-funds.use-case';
import { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case';
import { assertSelf } from '../auth/assert-self';
import { CurrentPlayer, type AuthenticatedPlayer } from '../auth/current-player.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { IdempotencyScope } from '../idempotency/idempotency-scope.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

/**
 * docs/API.md §3.1 "Günlük Ödül" (brief §37). `@Controller('players')`
 * `PlayerController`/`StableController` ile AYNI prefix'i paylaşır —
 * `StableController`'daki AYNI gerekçeyle güvenlidir (tam rota yolları
 * çakışmaz).
 */
@Controller('players')
export class EconomyController {
  constructor(
    @Inject(ClaimDailyRewardUseCase) private readonly claimDailyRewardUseCase: ClaimDailyRewardUseCase,
    @Inject(GetWalletUseCase) private readonly getWalletUseCase: GetWalletUseCase,
    @Inject(DepositFundsUseCase) private readonly depositFundsUseCase: DepositFundsUseCase,
  ) {}

  /**
   * SANAL para yatırma — brief §20 DEPOSIT, §21, §41, §42 PHASE 4b.
   *
   * `@Post(':id/wallet/deposit')` — mevcut `@Get(':id/wallet')` ile AYNI
   * prefix/segment desenindedir; tam yollar çakışmaz (`StableController`
   * gerekçesinin AYNISI).
   *
   * **GÖVDE İÇİN DTO SINIFI YOK — bilinçlidir.** CLAUDE.md kural 5:
   * esbuild altında `@Body()`'nin metatipi `undefined` kalır ve global
   * `ValidationPipe` gövde doğrulamasını sessizce atlar; yani
   * `class-validator` dekoratörleriyle süslenmiş bir DTO, ÇALIŞMA ANINDA
   * hiçbir şey doğrulamaz — güvenlik hissi verir, güvenlik vermez. Bu
   * yüzden gövde burada düz bir tip olarak alınır ve GERÇEK doğrulama
   * `domain/economy/mock-deposit.ts`'te yapılır (`InvalidRaceJoinInputError`/
   * `InvalidGiftAmountError` ile AYNI savunma).
   *
   * `@RateLimit` `keyBy: 'player'` — kişiye özel bir uçtur (`assertSelf`),
   * yani limit oyuncu başına sayılmalıdır. Sayaç limiti
   * `daily-reward`'dan (5/60 sn) YÜKSEKTİR: burada kazanç sağlayan bir
   * "ödül" yok, yalnızca kendi cüzdanına sanal para ekleme var, ve
   * gerçek bir kullanıcı birkaç denemede tutarı düzeltip tekrar
   * gönderebilir. Asıl koruma `Idempotency-Key` + tek işlem tavanıdır.
   */
  @RateLimit({ name: 'wallet-deposit', limit: 10, windowSeconds: 60, keyBy: 'player' })
  @Post(':id/wallet/deposit')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @IdempotencyScope('player')
  async deposit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { amount?: unknown },
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<WalletDepositResult>> {
    assertSelf(currentPlayer.id, id);
    // `body.amount` bilerek `unknown` olarak geçer: doğrulama domain'de,
    // hatanın kendi kodunu (`INVALID_DEPOSIT_AMOUNT`) üretecek şekilde
    // yapılır. `body?.amount` — gövde hiç gönderilmezse `body` `undefined`
    // olabilir (esbuild altında doğrulanmadığı için bu gerçek bir olasılık).
    const result = await this.depositFundsUseCase.execute(id, body?.amount);
    return { success: true, data: result };
  }

  /**
   * Cüzdan + işlem geçmişi — brief §20 "WALLET SYSTEM", §42 PHASE 4.
   *
   * `@Get(':id/wallet')` `PlayerController`'ın `@Get(':id')`'siyle
   * ÇAKIŞMAZ: tam yollar farklıdır (`/players/:id` ile
   * `/players/:id/wallet`) — `StableController`'ın aynı prefix'i paylaşma
   * gerekçesinin AYNISI.
   *
   * `@RateLimit` `keyBy: 'player'` — bu uç nokta kişiye özeldir
   * (`assertSelf` başkasınınkini reddeder), yani limit oyuncu başına
   * sayılmalıdır; IP başına saymak aynı NAT arkasındaki oyuncuları
   * birbirine bağlardı. Limit `daily-reward`'dan (5/60 sn) YÜKSEKTİR çünkü
   * bu bir OKUMA ucudur ve cüzdan ekranı açılışta birkaç kez çağırabilir.
   */
  @RateLimit({ name: 'wallet-read', limit: 60, windowSeconds: 60, keyBy: 'player' })
  @Get(':id/wallet')
  @HttpCode(HttpStatus.OK)
  async getWallet(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit: string | undefined,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<WalletView>> {
    assertSelf(currentPlayer.id, id);
    const wallet = await this.getWalletUseCase.execute(id, limit);
    return { success: true, data: wallet };
  }

  // Yeni bir KAYNAK yaratmaz — `TrainingController.train`/`CareController.care`/
  // `StableController.upgradeStable` ile AYNI gerekçeyle 200 OK döner
  // (201 Created DEĞİL).
  // AUDIT_REPORT.md Bulgu S4 hardening (bu oturum) — bkz. `assertSelf` doc yorumu.
  // AUDIT_REPORT.md Bulgu S5 (High) hardening, ikinci dilim (bu oturum) —
  // docs/SECURITY.md §7'nin "ödül talebi" örneği. Zaten kendi günlük
  // cooldown kuralı (`DailyRewardAlreadyClaimedError`, 409) var — bu limit
  // yalnızca o kontrole ulaşmadan ÖNCE gereksiz spam denemelerini keser,
  // ikinci bir savunma katmanıdır.
  @RateLimit({ name: 'daily-reward', limit: 5, windowSeconds: 60, keyBy: 'player' })
  @Post(':id/daily-reward')
  @HttpCode(HttpStatus.OK)
  async claimDailyReward(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlayer() currentPlayer: AuthenticatedPlayer,
  ): Promise<ApiSuccess<ClaimDailyRewardResult>> {
    assertSelf(currentPlayer.id, id);
    const result = await this.claimDailyRewardUseCase.execute(id);
    return { success: true, data: result };
  }
}
