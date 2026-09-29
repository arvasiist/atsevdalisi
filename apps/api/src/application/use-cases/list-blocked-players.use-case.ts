import { Inject, Injectable } from '@nestjs/common';
import type { BlockedPlayerView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import { SOCIAL_REPOSITORY, type SocialRepository } from '../ports/social.repository';

/**
 * Engellenen oyuncuların listesi. `GET /players/:id/blocks`.
 *
 * **NEDEN AYRI BİR UÇ NOKTA (sosyal özete eklenmedi):** `GET /players/:id/
 * social` ekranın açılışında çağrılır ve engel listesi oraya konsaydı her
 * açılışta fazladan bir JOIN + sıralama yapılırdı. Engel listesine yalnızca
 * kullanıcı AYARLAR ekranına girdiğinde bakılır (nadir). `SocialOverviewView`
 * sözleşmesini büyütmek yerine bağımsız bir uç nokta tercih edildi.
 *
 * `GetSocialOverviewUseCase` ile AYNI desen: iş kuralı İÇERMEZ, oyuncunun
 * var olduğunu doğrular (yoksa 404 — sessizce boş liste dönmez) ve
 * `Date` → ISO dönüşümünü yapar.
 *
 * **`isBlockedBetween` İLE KARIŞTIRILMAMALIDIR:** bu liste YALNIZCA TEK
 * YÖNÜ (`blocker_id = playerId`) taşır — "beni engelleyenler" burada
 * YOKTUR ve olmamalıdır (gerekçe: `SocialRepository.findBlockedPlayers`
 * doc yorumu).
 */
@Injectable()
export class ListBlockedPlayersUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(SOCIAL_REPOSITORY) private readonly socialRepository: SocialRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(playerId: string): Promise<BlockedPlayerView[]> {
    const player = await this.playerRepository.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }

    const rows = await this.socialRepository.findBlockedPlayers(
      playerId,
      this.config.social.blockListLimit,
    );
    return rows.map((row) => ({
      playerId: row.playerId,
      username: row.username,
      displayName: row.displayName,
      level: row.level,
      blockedAt: row.blockedAt.toISOString(),
    }));
  }
}
