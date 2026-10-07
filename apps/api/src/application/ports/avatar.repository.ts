import type { AvatarAppearance } from '@at-sevdalisi/shared-types';

export const AVATAR_REPOSITORY = Symbol('AVATAR_REPOSITORY');

export interface StoredAvatar {
  appearance: Record<string, unknown>;
  updatedAt: Date;
}

export interface AvatarRepository {
  /** Kaydedilmiş avatar; oyuncu hiç kaydetmediyse `null`. */
  find(playerId: string): Promise<StoredAvatar | null>;
  save(playerId: string, appearance: AvatarAppearance, now: Date): Promise<StoredAvatar>;
}
