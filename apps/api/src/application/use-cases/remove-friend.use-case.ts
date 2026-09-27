import { Inject, Injectable } from '@nestjs/common';
import type { RemoveFriendResult } from '@at-sevdalisi/shared-types';
import { FriendshipNotFoundError } from '../../domain/social/errors';
import { canonicalPair } from '../../domain/social/friendship';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Arkadaşlıktan çıkarma / bekleyen isteği geri çekme.
 * `DELETE /players/:id/friends/:friendId`.
 *
 * **İKİ ANLAMI VARDIR (bilinçli):** kabul edilmiş bir arkadaşlığı siler
 * VEYA bekleyen bir isteği (gönderdiğim ya da bana gelmiş) geri çeker.
 * Repository'nin `removeFriendship`'i durum filtresi UYGULAMAZ — gerekçesi
 * o metodun port doc yorumunda: yalnızca `accepted`'a izin verilseydi,
 * yanlışlıkla gönderilen istekler tavanı doldurup yeni istek göndermeyi
 * kilitlerdi.
 *
 * **`assertNotSelf` YOKTUR ve GEREKMEZ:** kendini çıkarmak isteyen bir
 * çağrı `canonicalPair(self, self)` üretir, `player_low_id < player_high_id`
 * CHECK'i yüzünden bu çiftte HİÇBİR satır yoktur, `DELETE` sıfır satır
 * siler ve aşağıdaki 404 döner — yani yanlış bir yazma mümkün değildir.
 *
 * **Mesaj geçmişi SİLİNMEZ** (ayrı tablo, bilinçli — bkz. migration 0033).
 * Arkadaşlıktan çıkan iki oyuncu eski yazışmayı okumaya devam eder ama
 * YENİ mesaj gönderemez (`NotFriendsError`).
 */
@Injectable()
export class RemoveFriendUseCase {
  constructor(@Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository) {}

  async execute(playerId: string, friendId: string): Promise<RemoveFriendResult> {
    const { lowId, highId } = canonicalPair(playerId, friendId);
    const removed = await this.socialRepository.removeFriendship({ lowId, highId });
    if (!removed) {
      throw new FriendshipNotFoundError(friendId);
    }
    // Gövdesiz 204 DEĞİL — gerekçe `RemoveFriendResult` doc yorumunda
    // (istemcinin `request()` yardımcısı her yanıtta JSON ayrıştırır).
    return { friendId };
  }
}
