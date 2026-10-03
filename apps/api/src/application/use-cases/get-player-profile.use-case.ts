import { Inject, Injectable } from '@nestjs/common';
import type { PlayerProfileView } from '@at-sevdalisi/shared-types';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { validateUsername } from '../../domain/player/validation';
import { AchievementUseCase } from './achievement.use-case';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * brief §24 "SOCIAL PROFILE" (PHASE 14) — `GET /players/profile/:username`.
 *
 * **NEDEN `username`, `id` DEĞİL:** brief §24 profilin `/profile/:username`
 * yolundan görüntülenmesini ister ve bu, paylaşılabilir bir adres üretir
 * (bir oyuncuya "profili şu adreste" denebilir). `GET /players/:id` ise
 * ZATEN vardır ve yalnızca kendi profilini döner (`assertSelf`) — bu uç
 * nokta onu GEVŞETMEZ, ondan AYRI bir okuma yoludur.
 *
 * **HERKESE AÇIKTIR** (`@Public()`) — ve bu yüzden dönen tip
 * `PlayerProfileView`'dir ve `money`/`gems` TAŞIMAZ (bkz. o tipin doc
 * yorumu — AUDIT_REPORT.md Bulgu S4). Bu use-case'in "isteyen kim" diye bir
 * girdisi YOKTUR: global `AuthGuard` herkese açık rotalarda token'ı hiç
 * ayrıştırmadığından (bkz. `PlayerProfileView`'in `isSelf` notu) böyle bir
 * bilgi zaten mevcut değildir.
 *
 * **Kullanıcı adı doğrulaması BURADA, DTO'da DEĞİL:** CLAUDE.md'nin "Kardeş
 * tuzak" kuralı — Vitest/esbuild `design:paramtypes` üretmediği için
 * `ValidationPipe` gövde doğrulamasını atlar; bu bir YOL PARAMETRESİ olduğu
 * için `ParseUUIDPipe` de uygulanamaz (kullanıcı adı UUID değildir).
 * `validateUsername` (domain) tek doğruluk kaynağıdır ve kayıt akışının
 * kullandığı AYNI fonksiyondur — geçersiz bir ad 404 yerine 400 alır, çünkü
 * "bu ad hiçbir zaman var olamaz" ile "bu ad henüz alınmamış" farklı
 * cevaplardır ve istemcinin ilkini bilmesi gerekir (istemci tarafı
 * doğrulamanın sunucudaki karşılığı).
 */
@Injectable()
export class GetPlayerProfileUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(AchievementUseCase) private readonly achievements: AchievementUseCase,
  ) {}

  /**
   * @param rawUsername YOL PARAMETRESİ — ham `string`. Tipi daraltılmaz:
   *   doğrulama `validateUsername`'in işidir.
   */
  async execute(rawUsername: string): Promise<PlayerProfileView> {
    validateUsername(rawUsername);

    const profile = await this.playerRepository.findProfileByUsername(rawUsername);
    if (profile === null) {
      throw new PlayerNotFoundError(rawUsername);
    }

    return {
      playerId: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarId: profile.avatarId,
      level: profile.level,
      xp: profile.xp,
      memberSince: profile.memberSince,
      stats: {
        raceCount: profile.raceCount,
        winCount: profile.winCount,
        podiumCount: profile.podiumCount,
      },
      friendCount: profile.friendCount,
      giftCount: profile.giftCount,
      // brief §24 "Achievements" (03.10.2026) — kazanılmış başarımlar.
      achievements: await this.achievements.forProfile(profile.id),
    };
  }
}
