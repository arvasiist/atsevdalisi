import { Inject, Injectable } from '@nestjs/common';
import type { Player } from '@at-sevdalisi/shared-types';
import { normalizeEmail, validateEmail, validatePassword } from '../../domain/auth/credentials';
import {
  CredentialsAlreadySetError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidCredentialsInputError,
} from '../../domain/auth/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher';
import {
  PLAYER_CREDENTIALS_REPOSITORY,
  type PlayerCredentialsRepository,
} from '../ports/player-credentials.repository';
import { PLAYER_REPOSITORY, type PlayerRepository } from '../ports/player.repository';

/**
 * E-POSTA + ŞİFRE GİRİŞİ (30.09.2026, migration 0046) — proje sahibinin
 * talebi: hesaplar yalnızca tarayıcıda yaşıyordu ve tarayıcı verisi
 * silinince / cihaz değişince / 30 günlük token dolunca kalıcı olarak
 * kayboluyordu.
 *
 *  - `saveAccount`: MİSAFİR oyuncuya e-posta + şifre bağlar. Oyuncu satırı
 *    değişmez; atlar ve para aynı `player_id`de kalır.
 *  - `login`: e-posta + şifre → oyuncu (controller token imzalar).
 *  - `accountEmail`: kayıtlı e-posta ya da `null` (misafir).
 *
 * **GİRİŞTE TEK HATA:** e-posta biçimsizse, kayıtlı değilse ya da şifre
 * yanlışsa HEPSİ `InvalidCredentialsError` (401). Kayıtlı değilse bile
 * sahte bir özet doğrulanır ki yanıt süresi "e-posta var mı"yı sızdırmasın.
 */
@Injectable()
export class PasswordAuthUseCase {
  /** Kayıtlı olmayan e-postada doğrulanan sahte özet — ilk kullanımda üretilir. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(PLAYER_CREDENTIALS_REPOSITORY) private readonly credentials: PlayerCredentialsRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PLAYER_REPOSITORY) private readonly players: PlayerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async saveAccount(playerId: string, rawEmail: unknown, rawPassword: unknown): Promise<{ email: string }> {
    const email = validateEmail(rawEmail, this.config.auth);
    const password = validatePassword(rawPassword, this.config.auth);
    if ((await this.players.findById(playerId)) === null) {
      throw new PlayerNotFoundError(playerId);
    }
    if ((await this.credentials.findEmailByPlayerId(playerId)) !== null) {
      throw new CredentialsAlreadySetError();
    }
    if ((await this.credentials.findByEmail(email)) !== null) {
      throw new EmailAlreadyRegisteredError();
    }
    await this.credentials.create({ playerId, email, passwordHash: await this.hasher.hash(password) });
    return { email };
  }

  async login(rawEmail: unknown, rawPassword: unknown): Promise<Player> {
    if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
      throw new InvalidCredentialsInputError('E-posta ve şifre metin olmalıdır.');
    }
    const found = await this.credentials.findByEmail(normalizeEmail(rawEmail));
    if (found === null) {
      await this.hasher.verify(rawPassword, await this.getDummyHash());
      throw new InvalidCredentialsError();
    }
    if (!(await this.hasher.verify(rawPassword, found.passwordHash))) {
      throw new InvalidCredentialsError();
    }
    const player = await this.players.findById(found.playerId);
    if (player === null) {
      throw new InvalidCredentialsError();
    }
    return player;
  }

  async accountEmail(playerId: string): Promise<string | null> {
    return this.credentials.findEmailByPlayerId(playerId);
  }

  private getDummyHash(): Promise<string> {
    if (this.dummyHash === null) {
      this.dummyHash = this.hasher.hash('sahte-ozet-zamanlama-esitleme');
    }
    return this.dummyHash;
  }
}
