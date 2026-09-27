import { Inject, Injectable } from '@nestjs/common';
import type { WalletView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { normalizeWalletHistoryLimit } from '../../domain/economy/wallet-history';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { WALLET_REPOSITORY, type WalletRepository } from '../ports/wallet.repository';

/**
 * `GET /players/:id/wallet` — brief §20 "WALLET SYSTEM" ve §42 PHASE 4.
 *
 * **SALT OKUMA — PARA YOLU DEĞİL.** `IdempotencyInterceptor` YOKTUR
 * (tekrarlanan bir okuma ikinci bir hareket üretmez), `FOR UPDATE` yoktur,
 * `economy_transactions`'a yazılmaz. Bu yüzden `assertSelf` ile korunması
 * yeterlidir: başkasının cüzdanını okumak 403'tür (`PlayerController.
 * getById`'nin AYNI deseni).
 *
 * `limit` HAM (`unknown`) alınır ve domain'de normalize edilir — gerekçe
 * `normalizeWalletHistoryLimit`'in doc yorumunda (sorgu parametreleri
 * metindir ve esbuild altında doğrulanmaz).
 */
@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepository: WalletRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string, rawLimit: unknown): Promise<WalletView> {
    const limit = normalizeWalletHistoryLimit(rawLimit, this.config.economy);
    const wallet = await this.walletRepository.findWallet(playerId, limit);
    if (wallet === null) {
      throw new PlayerNotFoundError(playerId);
    }
    return wallet;
  }
}
