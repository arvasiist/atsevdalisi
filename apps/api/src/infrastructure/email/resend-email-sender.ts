import { Logger } from '@nestjs/common';
import type { EmailSender, OutgoingEmail } from '../../application/ports/email-sender';
import { EmailDeliveryError } from '../../domain/auth/errors';

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
    /** 16.10.2026 — `auth.email.deliveryTimeoutMs`: Resend yanıt vermezse istek asılı kalmasın. */
    private readonly timeoutMs: number,
  ) {}

  async send(email: OutgoingEmail): Promise<void> {
    let response: Response;
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // Zaman aşımı / ağ hatası. Anahtar, alıcı ve içerik loglanmaz.
      const reason = error instanceof Error ? error.name : 'bilinmeyen';
      this.logger.error(`Resend'e ulaşılamadı (${reason}, sınır ${this.timeoutMs} ms).`);
      throw new EmailDeliveryError();
    }
    if (!response.ok) {
      // Sağlayıcının hata gövdesi loglanır (ör. "alan adı doğrulanmadı"); ALICI ve
      // İÇERİK loglanmaz (sıfırlama bağlantısı içerir). Kullanıcıya genel mesaj gider.
      const detail = await response.text().catch(() => '');
      this.logger.error(`Resend gönderimi başarısız: HTTP ${response.status} ${detail.slice(0, 200)}`);
      throw new EmailDeliveryError();
    }
  }
}
