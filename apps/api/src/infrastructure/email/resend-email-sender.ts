import { Logger } from '@nestjs/common';
import type { EmailSender, OutgoingEmail } from '../../application/ports/email-sender';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend (https://resend.com) ile gerçek e-posta gönderimi. Yeni bağımlılık
 * YOK — Node'un yerleşik `fetch`i. `RESEND_API_KEY` doluysa seçilir.
 */
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: OutgoingEmail): Promise<void> {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!response.ok) {
      // Gövde loglanır ama ALICI ve İÇERİK loglanmaz (sıfırlama bağlantısı içerir).
      const detail = await response.text().catch(() => '');
      this.logger.error(`Resend gönderimi başarısız: HTTP ${response.status} ${detail.slice(0, 200)}`);
      throw new Error(`E-posta gönderilemedi (HTTP ${response.status}).`);
    }
  }
}
