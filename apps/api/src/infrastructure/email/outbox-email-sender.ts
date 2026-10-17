import { Logger } from '@nestjs/common';
import type { EmailSender, OutgoingEmail } from '../../application/ports/email-sender';
import { EmailNotConfiguredError } from '../../domain/auth/errors';

const OUTBOX_LIMIT = 100;

/**
 * `RESEND_API_KEY` YOKKEN kullanılan gönderici (30.09.2026). E-posta
 * GÖNDERİLMEZ; bellek içi giden kutusuna yazılır (e2e testleri sıfırlama
 * bağlantısını buradan okur).
 *
 * **ÜRETİMDE İÇERİK LOGLANMAZ:** sıfırlama bağlantısı bir parola eşdeğeridir;
 * log'a düşmesi, log'u okuyabilen herkese hesap ele geçirme yolu açardı.
 * Geliştirmede (NODE_ENV≠production) bağlantı konsola yazılır ki e-posta
 * servisi olmadan akış denenebilsin.
 */
export class OutboxEmailSender implements EmailSender {
  private readonly logger = new Logger(OutboxEmailSender.name);
  readonly outbox: OutgoingEmail[] = [];

  constructor(private readonly nodeEnv: string) {}

  async send(email: OutgoingEmail): Promise<void> {
    if (this.nodeEnv === 'production') {
      this.logger.warn('RESEND_API_KEY tanımlı değil — e-posta GÖNDERİLMEDİ (içerik güvenlik gereği loglanmaz).');
      // 16.10.2026 — üretimde "gönderildi" denmez ve içerik bellekte de TUTULMAZ:
      // çağıran yol hatayı yakalar (kayıt/sıfırlama yutar ve loglar; elle
      // "tekrar gönder" 503 görür).
      throw new EmailNotConfiguredError();
    }
    this.outbox.push(email);
    if (this.outbox.length > OUTBOX_LIMIT) {
      this.outbox.shift();
    }
    if (this.nodeEnv !== 'test') {
      this.logger.log(`[geliştirme] E-posta (gönderilmedi) → ${email.to}: ${email.subject}\n${email.text}`);
    }
  }
}
