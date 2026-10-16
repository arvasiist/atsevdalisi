import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EmailAlreadyVerifiedError,
  InvalidVerificationTokenError,
  NoAccountEmailError,
} from '../../domain/auth/errors';
import { AppConfigService } from '../../infrastructure/config/config.service';
import { EMAIL_SENDER, type EmailSender } from '../ports/email-sender';
import {
  PLAYER_CREDENTIALS_REPOSITORY,
  type PlayerCredentialsRepository,
} from '../ports/player-credentials.repository';

const MS_PER_SECOND = 1000;
const MS_PER_HOUR = 60 * 60 * MS_PER_SECOND;
/** Kabul edilen en uzun bağlantı — sınırsız girdi özetlenmez. */
const MAX_TOKEN_LENGTH = 512;

function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type VerificationSendResult = 'sent' | 'throttled';

/**
 * E-POSTA DOĞRULAMA (02.10.2026, migration 0058) — şifre sıfırlamayla aynı
 * desen: rastgele bağlantı, DB'de yalnızca SHA-256 özeti, tek kullanımlık,
 * süreli. Fark: çağıran KİMLİĞİ DOĞRULANMIŞ oyuncudur (e-postası zaten
 * kendisinde görünür) → enumerasyon kaygısı yoktur, durum açıkça söylenir.
 *
 * Doğrulama bugün hiçbir oyun özelliğini KAPATMAZ; e-postanın sahibine ait
 * olduğunu kaydeder ve hesap ekranında gösterilir.
 *
 * ⚠️ Bağlantı LOGLANMAZ — e-posta sahipliğinin kanıtıdır.
 */
@Injectable()
export class EmailVerificationUseCase {
  private readonly logger = new Logger(EmailVerificationUseCase.name);

  constructor(
    @Inject(PLAYER_CREDENTIALS_REPOSITORY) private readonly credentials: PlayerCredentialsRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async isVerified(playerId: string): Promise<boolean> {
    return (await this.credentials.findVerificationState(playerId))?.verifiedAt != null;
  }

  /**
   * Doğrulama e-postası yollar. `minIntervalSeconds` içinde ikinci istek
   * e-posta YOLLAMAZ (`throttled`). Gönderim hatası FIRLATILIR — çağıran
   * kendi e-postasının durumunu bilmek ister (enumerasyon kaygısı yok).
   */
  async send(playerId: string, now: Date = new Date()): Promise<VerificationSendResult> {
    const state = await this.credentials.findVerificationState(playerId);
    if (state === null) {
      throw new NoAccountEmailError();
    }
    if (state.verifiedAt !== null) {
      throw new EmailAlreadyVerifiedError();
    }
    const settings = this.config.auth.emailVerification;
    const latest = await this.credentials.findLatestVerificationRequestAt(playerId);
    if (latest !== null && now.getTime() - latest.getTime() < settings.minIntervalSeconds * MS_PER_SECOND) {
      return 'throttled';
    }
    const token = randomBytes(settings.tokenBytes).toString('base64url');
    await this.credentials.createVerificationToken({
      playerId,
      email: state.email,
      tokenHash: hashVerificationToken(token),
      expiresAt: new Date(now.getTime() + settings.tokenTtlHours * MS_PER_HOUR),
    });
    const link = `${this.config.env.webBaseUrl}/account/verify?token=${encodeURIComponent(token)}`;
    await this.emailSender.send({
      to: state.email,
      subject: 'At Sevdalısı — e-postanı doğrula',
      text:
        `E-posta adresini doğrulamak için bu bağlantıyı aç (${settings.tokenTtlHours} saat geçerli, tek kullanımlık):\n\n` +
        `${link}\n\nBu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.`,
    });
    return 'sent';
  }

  /** Kayıt sonrası otomatik gönderim — hata kaydı açmayı BOZMAZ, yalnızca loglanır (bağlantı değil). */
  async sendAfterRegistration(playerId: string): Promise<void> {
    try {
      await this.send(playerId);
    } catch (error) {
      this.logger.error(`Doğrulama e-postası gönderilemedi: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async verify(rawToken: unknown, now: Date = new Date()): Promise<void> {
    if (typeof rawToken !== 'string' || rawToken.trim() === '' || rawToken.length > MAX_TOKEN_LENGTH) {
      throw new InvalidVerificationTokenError();
    }
    const playerId = await this.credentials.consumeVerificationToken({
      tokenHash: hashVerificationToken(rawToken.trim()),
      now,
    });
    if (playerId === null) {
      throw new InvalidVerificationTokenError();
    }
  }
}
