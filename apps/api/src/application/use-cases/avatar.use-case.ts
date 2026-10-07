import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AvatarAppearance, AvatarView } from '@at-sevdalisi/shared-types';
import { loadAvatarConfig } from '@at-sevdalisi/game-config';
import { deriveDefaultAvatar, validateAvatarAppearance } from '../../domain/avatar/avatar';
import { InvalidAvatarError } from '../../domain/avatar/errors';
import { AVATAR_REPOSITORY, type AvatarRepository } from '../ports/avatar.repository';

const config = loadAvatarConfig();

/**
 * MANUEL AVATAR (07.10.2026, brief §44/§49). Oyuncu kataloğdan seçer; sunucu
 * doğrular ve saklar. Kaydı olmayan oyuncu kimliğinden türetilen varsayılan
 * avatarla görünür — "avatarsız" durum yoktur (§49: oyuncu oyuna devam eder).
 */
@Injectable()
export class AvatarUseCase {
  private readonly logger = new Logger(AvatarUseCase.name);

  constructor(@Inject(AVATAR_REPOSITORY) private readonly repository: AvatarRepository) {}

  async get(playerId: string): Promise<AvatarView> {
    const stored = await this.repository.find(playerId);
    if (stored) {
      try {
        return {
          appearance: validateAvatarAppearance(stored.appearance, config),
          source: 'manual',
          updatedAt: stored.updatedAt.toISOString(),
        };
      } catch (error) {
        // Katalogdan bir seçenek kaldırılmışsa eski kayıt geçersizleşir: oyuncu
        // varsayılanla görünür, yeni seçimi kaydedene kadar (kayıt silinmez).
        if (!(error instanceof InvalidAvatarError)) throw error;
        this.logger.warn(`Kayıtlı avatar artık katalogla uyuşmuyor (oyuncu ${playerId}); varsayılan gösteriliyor.`);
      }
    }
    return { appearance: deriveDefaultAvatar(playerId, config), source: 'default', updatedAt: null };
  }

  /** Herkese açık profil için yalnızca görünüş. */
  async appearanceOf(playerId: string): Promise<AvatarAppearance> {
    return (await this.get(playerId)).appearance;
  }

  async save(playerId: string, raw: unknown, now: Date = new Date()): Promise<AvatarView> {
    const appearance = validateAvatarAppearance(raw, config);
    const stored = await this.repository.save(playerId, appearance, now);
    return { appearance, source: 'manual', updatedAt: stored.updatedAt.toISOString() };
  }
}
