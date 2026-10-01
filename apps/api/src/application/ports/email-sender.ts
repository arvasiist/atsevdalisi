/**
 * E-posta gönderim portu (30.09.2026, şifre sıfırlama). Somut sınıflar
 * `infrastructure/email/`dedir: `ResendEmailSender` (gerçek gönderim) ve
 * `OutboxEmailSender` (anahtar yokken — geliştirme/test).
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /** Gönderim hatası FIRLATIR; çağıran kullanıcıya genel bir yanıt döner. */
  send(email: OutgoingEmail): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
