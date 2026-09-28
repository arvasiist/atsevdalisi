import { Inject, Injectable } from '@nestjs/common';
import type { RemoveBlockResult } from '@at-sevdalisi/shared-types';
import { BlockNotFoundError } from '../../domain/social/errors';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Engeli kaldırma. `DELETE /players/:id/blocks/:blockedId`.
 *
 * **`assertNotSelfBlock` YOKTUR ve GEREKMEZ** (`RemoveFriendUseCase`in
 * gerekçesiyle AYNI): kendini engellemek zaten mümkün olmadığından
 * (`player_blocks_not_self`) kendine ait bir engel satırı hiçbir zaman
 * var olmaz; `DELETE` sıfır satır siler ve aşağıdaki 404 döner.
 *
 * **"ZATEN YOK" 404'TÜR, sessiz başarı DEĞİL:** engel KOYMAK idempotenttir
 * (istenen sonuç zaten geçerli), ama engel KALDIRMAK bir silmedir —
 * istemci bayat bir listeyle çalışıyorsa bunu bilmelidir
 * (`RemoveFriendUseCase` ile AYNI ayrım).
 *
 * **ARKADAŞLIK GERİ GELMEZ:** engelleme arkadaşlık satırını silmediği
 * için (bkz. `BlockPlayerUseCase`), burada geri yüklenecek bir şey de
 * yoktur; kaldırma sonrası iki oyuncu eskiden arkadaşsa yine arkadaştır
 * ve mesajlaşma kendiliğinden yeniden açılır.
 */
@Injectable()
export class UnblockPlayerUseCase {
  constructor(@Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository) {}

  async execute(playerId: string, blockedId: string): Promise<RemoveBlockResult> {
    const removed = await this.socialRepository.unblockPlayer(playerId, blockedId);
    if (!removed) {
      throw new BlockNotFoundError(blockedId);
    }
    // Gövdesiz 204 DEĞİL — gerekçe `RemoveBlockResult` doc yorumunda
    // (istemcinin `request()` yardımcısı her yanıtta JSON ayrıştırır).
    return { blockedId };
  }
}
