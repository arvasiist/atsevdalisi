import { Inject, Injectable } from '@nestjs/common';
import type { BlockedPlayerView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { assertNotSelfBlock } from '../../domain/social/moderation';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Oyuncu engelleme. `POST /players/:id/blocks`.
 *
 * **Akış — sıra ÖNEMLİDİR:**
 *   1. `assertNotSelfBlock` — kendini engelleme (400). DB'ye gitmeden:
 *      `player_blocks_not_self` CHECK'ine varmak 500 üretirdi.
 *   2. Hedef okunur; yoksa `PlayerNotFoundError` (404) — FK `23503`
 *      yerine anlamlı hata (`SendMessageUseCase`'in AYNI adımı). Ayrıca
 *      yanıtın gövdesi hedefin görünen adını taşır, yani o satır zaten
 *      okunmak ZORUNDADIR.
 *   3. `blockPlayer` — idempotent.
 *
 * **ARKADAŞLIK GEREKMEZ ve ARANMAZ (bilinçli):** mesaj/hediye/davet
 * yollarının aksine engelleme, arkadaş OLUNMAYAN birini de kapsamalıdır —
 * asıl ihtiyaç duyulan durum tam olarak budur (istenmeyen arkadaşlık
 * istekleri, lobide rahatsız eden bir oyuncu). `areFriends` çağrılsaydı
 * engelleme yalnızca zaten arkadaş olduğun kişilerle sınırlı kalırdı.
 *
 * **MEVCUT ARKADAŞLIK SİLİNMEZ ve MESAJ GEÇMİŞİ SİLİNMEZ:** engelleme bir
 * yazma KAPISIDIR, bir temizlik işlemi değil (bkz. migration 0040 notu).
 * Engel kaldırıldığında arkadaşlık ve geçmiş olduğu gibi yerinde durur.
 *
 * **KARŞI TARAFA BİLDİRİM GİTMEZ:** gerekçe
 * `PostgresSocialRepository.blockPlayer` doc yorumunda.
 */
@Injectable()
export class BlockPlayerUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
  ) {}

  async execute(playerId: string, blockedId: string): Promise<BlockedPlayerView> {
    assertNotSelfBlock(playerId, blockedId);

    const blocked = await this.playerRepository.findById(blockedId);
    if (blocked === null) {
      throw new PlayerNotFoundError(blockedId);
    }

    // Dönen tarih "yürürlükteki" olandır: zaten engelli bir oyuncu için
    // repository var olan satırın `created_at`ini döner, çağıranın
    // `new Date()`ini DEĞİL (gerekçe: port doc yorumu).
    const blockedAt = await this.socialRepository.blockPlayer(playerId, blockedId, new Date());

    return {
      playerId: blockedId,
      displayName: blocked.displayName,
      level: blocked.level,
      blockedAt: blockedAt.toISOString(),
    };
  }
}
