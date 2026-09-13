import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Player } from '@at-sevdalisi/shared-types';
import { assertUsernameAvailable, createNewPlayer } from '../../domain/player/player';
import { createStarterHorse, pickStarterHorseName } from '../../domain/horse/horse';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

export interface RegisterPlayerInput {
  username: string;
  displayName: string;
  avatarId?: string | null;
}

/**
 * FAZ 1 wiring — brief §7/§31 kayıt akışının kimlik doğrulama
 * sağlayıcısından BAĞIMSIZ kısmı (bkz. `domain/player/player.ts` üstündeki
 * not). Gerçek Google/Apple ID token doğrulaması (brief §41/§50) bu
 * teslimatın kapsamı DIŞINDADIR — bu, proje sahibinin Google/Apple
 * geliştirici konsolunda OAuth kimlik bilgileri (client id/secret)
 * oluşturmasını gerektirir (canlıya alma/hosting hesaplarıyla aynı
 * kategoride, dışarıdan bir kurulum adımı). Bu use-case, o adım
 * tamamlanana kadar geliştirme/test amaçlı DOĞRUDAN kayıt sağlar; gerçek
 * OAuth eklendiğinde bu use-case DEĞİŞMEZ — sadece onu çağıran controller,
 * `username`/`displayName`'i client'tan değil, doğrulanmış sağlayıcı
 * kimliğinden türetilen bir değerden alacak şekilde güncellenir.
 *
 * NOT — `AppConfigService` de (aşağıda) artık açık `@Inject()` ile enjekte
 * ediliyor; bkz. `PlayerController` üstündeki not — Vitest'in esbuild
 * dönüştürücüsü, tsc'nin aksine `design:paramtypes` üst verisini
 * yaymadığından örtük (yalnızca-tip) enjeksiyon gerçek e2e testlerinde
 * `undefined`'a çözülüyordu.
 *
 * FAZ 1 wiring, ikinci dilim (bu oturum): kayıt artık oyuncuya bir
 * BAŞLANGIÇ ATI da veriyor (bkz. `domain/horse/horse.ts`
 * `createStarterHorse`) — brief'te açık bir "yeni oyuncu bir atla
 * başlar" cümlesi yoktur, ama bu, at yetiştiriciliği temalı bir oyunda
 * (brief §1 "amaç") standart ve gerekli bir varsayımdır: at OLMADAN
 * Antrenman/Bakım/Yarış ekranlarının hiçbiri anlamlı şekilde
 * gösterilemez. At oluşturma ücretsizdir (Economy'den bir düşüş
 * YAPILMAZ) — gerçek para/gem harcayan at edinme akışı (At Pazarı,
 * FAZ 2 `domain/economy/wallet.ts` `transfer`) ayrı bir wiring
 * dilimidir.
 *
 * FAZ 1 wiring, on dördüncü dilim (bu oturum): `createNewPlayer`'a
 * artık üçüncü parametre olarak `this.config.online.elo.initialRating`
 * geçirilir (brief §43 Elo, bkz. `domain/player/player.ts` doc yorumu) —
 * yeni oyuncu PvP Eşleştirme kuyruğuna hiç girmemiş olsa bile baştan
 * itibaren bir reytinge sahiptir (`Player.rating`).
 */
@Injectable()
export class RegisterPlayerUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(input: RegisterPlayerInput): Promise<Player> {
    const existing = await this.playerRepository.findByUsername(input.username);
    assertUsernameAvailable(input.username, existing !== null);

    const player = createNewPlayer(
      {
        id: randomUUID(),
        username: input.username,
        displayName: input.displayName,
        avatarId: input.avatarId ?? null,
      },
      this.config.economy,
      this.config.online.elo.initialRating,
    );

    await this.playerRepository.save(player);

    const starterHorse = createStarterHorse({
      id: randomUUID(),
      ownerId: player.id,
      name: pickStarterHorseName(Math.random()),
    });
    await this.horseRepository.save(starterHorse);

    return player;
  }
}
