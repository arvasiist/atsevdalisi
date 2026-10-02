import { Inject, Injectable } from '@nestjs/common';
import type { AccountDeletionCheck } from '@at-sevdalisi/shared-types';
import {
  ACCOUNT_DELETION_BLOCKER_LABELS,
  DELETED_DISPLAY_NAME,
  deletedUsername,
  isDeletionConfirmed,
} from '../../domain/account/account-deletion';
import {
  AccountDeletionBlockedError,
  DeletionConfirmationMismatchError,
  DeletionPasswordInvalidError,
} from '../../domain/auth/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { ACCOUNT_DELETION_REPOSITORY, type AccountDeletionRepository } from '../ports/account-deletion.repository';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher';
import {
  PLAYER_CREDENTIALS_REPOSITORY,
  type PlayerCredentialsRepository,
} from '../ports/player-credentials.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * HESAP SİLME (02.10.2026, migration 0059) — bkz. `domain/account/
 * account-deletion.ts`. Onay: kullanıcı adı + (e-postalı hesapta) şifre.
 * Geri alınamaz: e-posta, şifre, Google bağlantısı silinir; aynı e-postayla
 * yeniden kayıt YENİ bir hesap açar.
 */
@Injectable()
export class DeleteAccountUseCase {
  constructor(
    @Inject(ACCOUNT_DELETION_REPOSITORY) private readonly deletion: AccountDeletionRepository,
    @Inject(PLAYER_REPOSITORY) private readonly players: PlayerRepository,
    @Inject(PLAYER_CREDENTIALS_REPOSITORY) private readonly credentials: PlayerCredentialsRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async check(playerId: string): Promise<AccountDeletionCheck> {
    const [blockers, email] = await Promise.all([
      this.deletion.findBlockers(playerId),
      this.credentials.findEmailByPlayerId(playerId),
    ]);
    return {
      blockers: blockers.map((code) => ({ code, label: ACCOUNT_DELETION_BLOCKER_LABELS[code] })),
      requiresPassword: email !== null,
    };
  }

  async execute(playerId: string, rawConfirm: unknown, rawPassword: unknown, now: Date = new Date()): Promise<void> {
    const player = await this.players.findById(playerId);
    if (player === null) {
      throw new PlayerNotFoundError(playerId);
    }
    if (!isDeletionConfirmed(rawConfirm, player.username)) {
      throw new DeletionConfirmationMismatchError();
    }
    const email = await this.credentials.findEmailByPlayerId(playerId);
    if (email !== null) {
      const found = await this.credentials.findByEmail(email);
      if (
        typeof rawPassword !== 'string' ||
        found === null ||
        !(await this.hasher.verify(rawPassword, found.passwordHash))
      ) {
        throw new DeletionPasswordInvalidError();
      }
    }
    const blockers = await this.deletion.deleteAccount({
      playerId,
      anonymousUsername: deletedUsername(playerId),
      anonymousDisplayName: DELETED_DISPLAY_NAME,
      now,
    });
    if (blockers.length > 0) {
      throw new AccountDeletionBlockedError(blockers.map((code) => ACCOUNT_DELETION_BLOCKER_LABELS[code]));
    }
  }
}
