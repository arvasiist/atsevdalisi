import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Player } from '@at-sevdalisi/shared-types';
import { normalizeEmail, validateEmail, validatePassword } from '../../domain/auth/credentials';
import {
  CredentialsAlreadySetError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidCredentialsInputError,
  InvalidResetTokenError,
} from '../../domain/auth/errors';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { EMAIL_SENDER, type EmailSender } from '../ports/email-sender';
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
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

/** Sıfırlama bağlantısının saklanan biçimi — düz bağlantı veritabanına YAZILMAZ. */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordAuthUseCase {
  /** Kayıtlı olmayan e-postada doğrulanan sahte özet — ilk kullanımda üretilir. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(PLAYER_CREDENTIALS_REPOSITORY) private readonly credentials: PlayerCredentialsRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PLAYER_REPOSITORY) private readonly players: PlayerRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  private readonly logger = new Logger(PasswordAuthUseCase.name);

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

  /**
   * ŞİFRE SIFIRLAMA İSTEĞİ (30.09.2026, migration 0047). **Yanıt HER ZAMAN
   * aynıdır** — e-posta kayıtlı mı değil mi, çağıran öğrenemez (enumerasyon
   * yok). Kayıtlıysa: rastgele bir bağlantı üretilir, YALNIZCA SHA-256 özeti
   * saklanır ve düz bağlantı e-postayla gönderilir. Aynı oyuncuya
   * `minIntervalSeconds` içinde ikinci e-posta GÖNDERİLMEZ (posta kutusunu
   * doldurma) — yanıt yine aynıdır. Gönderim hatası da yutulur ve
   * loglanır: istemciye farklı bir yanıt "bu e-posta kayıtlı" demek olurdu.
   */
  async requestPasswordReset(rawEmail: unknown, now: Date = new Date()): Promise<void> {
    if (typeof rawEmail !== 'string') {
      throw new InvalidCredentialsInputError('E-posta bir metin olmalıdır.');
    }
    const found = await this.credentials.findByEmail(normalizeEmail(rawEmail));
    if (found === null) {
      return;
    }
    const resetConfig = this.config.auth.passwordReset;
    const latest = await this.credentials.findLatestResetRequestAt(found.playerId);
    if (latest !== null && now.getTime() - latest.getTime() < resetConfig.minIntervalSeconds * MS_PER_SECOND) {
      return;
    }
    const token = randomBytes(resetConfig.tokenBytes).toString('base64url');
    await this.credentials.createResetToken({
      playerId: found.playerId,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(now.getTime() + resetConfig.tokenTtlMinutes * MS_PER_MINUTE),
    });
    const link = `${this.config.env.webBaseUrl}/account/reset?token=${encodeURIComponent(token)}`;
    const email = await this.credentials.findEmailByPlayerId(found.playerId);
    try {
      await this.emailSender.send({
        to: email ?? normalizeEmail(rawEmail),
        subject: 'At Sevdalısı — şifre sıfırlama',
        text:
          `Şifreni sıfırlamak için bu bağlantıyı aç (${resetConfig.tokenTtlMinutes} dakika geçerli, tek kullanımlık):\n\n` +
          `${link}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.`,
      });
    } catch (error) {
      this.logger.error(`Şifre sıfırlama e-postası gönderilemedi: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ŞİFRE SIFIRLAMA ONAYI. Yeni şifre `validatePassword` kurallarına uyar;
   * bağlantı geçersiz/süresi dolmuş/kullanılmışsa TEK hata
   * (`InvalidResetTokenError`). Başarılı onay oyuncunun diğer bekleyen
   * bağlantılarını da geçersiz kılar.
   */
  async confirmPasswordReset(rawToken: unknown, rawPassword: unknown, now: Date = new Date()): Promise<void> {
    const password = validatePassword(rawPassword, this.config.auth);
    if (typeof rawToken !== 'string' || rawToken.trim() === '') {
      throw new InvalidResetTokenError();
    }
    const playerId = await this.credentials.consumeResetToken({
      tokenHash: hashResetToken(rawToken.trim()),
      now,
      passwordHash: await this.hasher.hash(password),
    });
    if (playerId === null) {
      throw new InvalidResetTokenError();
    }
  }

  private getDummyHash(): Promise<string> {
    if (this.dummyHash === null) {
      this.dummyHash = this.hasher.hash('sahte-ozet-zamanlama-esitleme');
    }
    return this.dummyHash;
  }
}
