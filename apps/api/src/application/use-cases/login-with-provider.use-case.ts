import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Player } from '@at-sevdalisi/shared-types';
import type { AuthProvider } from '../../domain/player/auth-provider';
import { createPlayerAuthProviderLink } from '../../domain/player/auth-provider';
import { createNewPlayer } from '../../domain/player/player';
import { createStarterHorse, pickStarterHorseName } from '../../domain/horse/horse';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { HORSE_REPOSITORY, type HorseRepository } from '../ports/horse.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';
import {
  PLAYER_AUTH_PROVIDER_REPOSITORY,
  type PlayerAuthProviderRepository,
} from '../ports/player-auth-provider.repository';
import {
  IDENTITY_PROVIDER_VERIFIER,
  type IdentityProviderVerifier,
  verifyProviderIdToken,
} from '../ports/identity-provider';

const USERNAME_RANDOM_SUFFIX_MAX = 100000;
const MAX_USERNAME_GENERATION_ATTEMPTS = 5;
const USERNAME_BASE_MAX_LENGTH = 12;

export interface LoginWithProviderInput {
  provider: AuthProvider;
  idToken: string;
}

export interface LoginWithProviderResult {
  player: Player;
  isNewPlayer: boolean;
}

/**
 * `POST /auth/login` — brief §41/§50 Google/Apple Sign-In. AUDIT_REPORT.md
 * Bulgu S1 hardening (bu oturum) — projenin kimlik doğrulaması olmadığı
 * (Critical) bulgusuna karşı GERÇEK çözüm; `RegisterPlayerUseCase` (token'sız
 * geliştirme/demo kaydı, hâlâ mevcut — bkz. o dosyanın doc yorumu) ile
 * BİRLİKTE var olmaya devam eder.
 *
 * `RegisterPlayerUseCase`'DEN FARKLI olarak `username`/`displayName` client'tan
 * GELMEZ — sağlayıcının doğrulanmış kimliğinden (`email`) TÜRETİLİR (bkz.
 * `generateUniqueUsername`). Bir sağlayıcı kimliği (`provider`+
 * `providerUserId`) DAHA ÖNCE giriş yapmışsa YENİ bir oyuncu OLUŞTURULMAZ —
 * var olan `players` satırı döner (`isNewPlayer: false`); ilk kez giriş
 * yapıyorsa `RegisterPlayerUseCase.execute`'un yaptığı GİBİ yeni oyuncu +
 * başlangıç atı oluşturulur VE bir `player_auth_providers` bağlantısı
 * eklenir (`isNewPlayer: true`).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: her bağımlılık açık `@Inject()`
 * ile enjekte edilir.
 */
@Injectable()
export class LoginWithProviderUseCase {
  constructor(
    @Inject(IDENTITY_PROVIDER_VERIFIER) private readonly identityProviderVerifier: IdentityProviderVerifier,
    @Inject(PLAYER_AUTH_PROVIDER_REPOSITORY)
    private readonly playerAuthProviderRepository: PlayerAuthProviderRepository,
    @Inject(PLAYER_REPOSITORY) private readonly playerRepository: PlayerRepository,
    @Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(input: LoginWithProviderInput): Promise<LoginWithProviderResult> {
    const identity = await verifyProviderIdToken(this.identityProviderVerifier, input.provider, input.idToken);

    const existingLink = await this.playerAuthProviderRepository.findByProviderIdentity(
      identity.provider,
      identity.providerUserId,
    );
    if (existingLink) {
      const player = await this.playerRepository.findById(existingLink.playerId);
      if (!player) {
        // Veri bütünlüğü ihlali — FK CASCADE nedeniyle pratikte imkansız
        // (bkz. `PlayerRepository.updateTwoWithLock`'taki AYNI savunma deseni).
        throw new Error(
          `Veri bütünlüğü ihlali: player_auth_providers bağlantısı olan oyuncu (${existingLink.playerId}) bulunamadı.`,
        );
      }
      return { player, isNewPlayer: false };
    }

    const username = await this.generateUniqueUsername(identity.email);
    const player = createNewPlayer(
      {
        id: randomUUID(),
        username,
        displayName: identity.email ? (identity.email.split('@')[0] ?? 'Yeni Binici') : 'Yeni Binici',
        avatarId: null,
      },
      this.config.economy,
      this.config.online.elo.initialRating,
    );
    await this.playerRepository.save(player);

    // `RegisterPlayerUseCase`'in ikinci diliminde eklenen "her yeni oyuncu
    // bir başlangıç atıyla başlar" kuralıyla AYNI (bkz. o dosyanın yorumu) —
    // giriş yolu (token'sız demo kaydı VEYA gerçek Google/Apple girişi)
    // BAĞIMSIZ olarak bu davranış TUTARLI olmalıdır.
    const starterHorse = createStarterHorse({
      id: randomUUID(),
      ownerId: player.id,
      name: pickStarterHorseName(Math.random()),
    });
    await this.horseRepository.save(starterHorse);

    const link = createPlayerAuthProviderLink(player.id, identity);
    await this.playerAuthProviderRepository.save(link);

    return { player, isNewPlayer: true };
  }

  /**
   * `domain/player/validation.ts`'in `[a-z0-9_]` kısıtına uyan, benzersiz
   * bir kullanıcı adı üretir. E-posta varsa ondan türetilir (ör.
   * `omer.arvas@gmail.com` → `omer_arvas_41234`); yoksa (Apple "Hide My
   * Email" gibi bir e-posta hiç GÖNDERMEDİYSE) `player` önekiyle rastgele
   * üretilir. Çakışma olursa (son derece nadir — rastgele sayısal son ek
   * ZATEN eklenir) `MAX_USERNAME_GENERATION_ATTEMPTS` kez yeniden denenir.
   */
  private async generateUniqueUsername(email: string | null): Promise<string> {
    const rawBase = email ? (email.split('@')[0] ?? 'player') : 'player';
    const sanitized = rawBase
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, USERNAME_BASE_MAX_LENGTH);
    const base = sanitized.length > 0 ? sanitized : 'player';

    for (let attempt = 0; attempt < MAX_USERNAME_GENERATION_ATTEMPTS; attempt += 1) {
      const suffix = Math.floor(Math.random() * USERNAME_RANDOM_SUFFIX_MAX);
      const candidate = `${base}_${suffix}`;
      const existing = await this.playerRepository.findByUsername(candidate);
      if (!existing) {
        return candidate;
      }
    }
    // Pratikte imkansız (5 ardışık rastgele çakışma) — yine de sonsuz
    // döngüye girmemek için bir üst sınır konur.
    return `${base}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  }
}
