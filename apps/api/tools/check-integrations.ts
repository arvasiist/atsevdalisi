/**
 * E-POSTA + GOOGLE GİRİŞİ ENTEGRASYON KONTROLÜ (16.10.2026).
 *
 * Gerçek anahtarlar DEPOYA GİRMEZ; bu betik onları ortamdan okur (yerelde
 * kabuktan, GitHub'da `.github/workflows/integration-check.yml` → repository
 * secrets). Yaptıkları:
 *   1. Biçim: `RESEND_API_KEY`, `MAIL_FROM`, `GOOGLE_OAUTH_CLIENT_ID` —
 *      API açılışındaki kuralların AYNISI (`production-env.ts`, ikinci kopya yok).
 *   2. Resend: `INTEGRATION_TEST_EMAIL` verilmişse oyunun GERÇEK gönderim
 *      kodu (`ResendEmailSender`) ile bir test e-postası yollar.
 *   3. Google: istemci kimliği yalnızca biçimce denetlenir — kimliğin gerçekten
 *      çalıştığı ancak tarayıcıda bir Google girişiyle kanıtlanır (bkz. çıktı).
 * Anahtar değerleri hiçbir satırda yazdırılmaz.
 *
 *   cd apps/api && RESEND_API_KEY=… MAIL_FROM=… INTEGRATION_TEST_EMAIL=… \
 *     GOOGLE_OAUTH_CLIENT_ID=… npx tsx tools/check-integrations.ts
 */
import { loadAuthConfig } from '@at-sevdalisi/game-config';
import { ResendEmailSender } from '../src/infrastructure/email/resend-email-sender';
import { isGoogleWebClientId, looksLikeResendApiKey, mailFromProblem } from '../src/infrastructure/ops/production-env';

type Outcome = 'OK' | 'ATLANDI' | 'HATA';
const results: Array<{ check: string; outcome: Outcome; detail: string }> = [];
const record = (check: string, outcome: Outcome, detail: string): void => {
  results.push({ check, outcome, detail });
};
const env = (name: string): string => (process.env[name] ?? '').trim();
const maskEmail = (address: string): string => address.replace(/^(.).*(@.*)$/, '$1***$2');

async function main(): Promise<void> {
  const resendKey = env('RESEND_API_KEY');
  const mailFrom = env('MAIL_FROM');
  const testTo = env('INTEGRATION_TEST_EMAIL');
  const googleClientId = env('GOOGLE_OAUTH_CLIENT_ID');

  if (resendKey === '') {
    record('RESEND_API_KEY', 'ATLANDI', 'tanımlı değil — e-posta gönderimi doğrulanmadı');
  } else if (!looksLikeResendApiKey(resendKey)) {
    record('RESEND_API_KEY', 'HATA', 'biçim geçersiz (Resend anahtarları "re_" ile başlar)');
  } else {
    record('RESEND_API_KEY', 'OK', 'biçim doğru');
    const fromProblem = mailFromProblem(mailFrom);
    if (fromProblem) {
      record('MAIL_FROM', 'HATA', fromProblem);
    } else {
      record('MAIL_FROM', 'OK', mailFrom.replace(/<.*>/, '<…>'));
      if (testTo === '') {
        record('Resend gönderimi', 'ATLANDI', 'INTEGRATION_TEST_EMAIL yok — gerçek gönderim denenmedi');
      } else {
        try {
          await new ResendEmailSender(resendKey, mailFrom, loadAuthConfig().email.deliveryTimeoutMs).send({
            to: testTo,
            subject: 'At Sevdalısı — e-posta entegrasyon testi',
            text: 'Bu e-posta entegrasyon kontrolü tarafından gönderildi. Yanıt vermeniz gerekmez.',
          });
          record('Resend gönderimi', 'OK', `Resend kabul etti → ${maskEmail(testTo)} (gelen kutusunu kontrol et)`);
        } catch {
          record('Resend gönderimi', 'HATA', 'Resend reddetti ya da ulaşılamadı — ayrıntı yukarıdaki logda (alan adı doğrulandı mı?)');
        }
      }
    }
  }

  if (googleClientId === '') {
    record('GOOGLE_OAUTH_CLIENT_ID', 'ATLANDI', 'tanımlı değil — Google düğmesi gizli kalır');
  } else if (!isGoogleWebClientId(googleClientId)) {
    record('GOOGLE_OAUTH_CLIENT_ID', 'HATA', 'biçim geçersiz ("<sayı>-<kod>.apps.googleusercontent.com"; istemci SIRRI değil, KİMLİK)');
  } else {
    record(
      'GOOGLE_OAUTH_CLIENT_ID',
      'OK',
      'biçim doğru — çalıştığını kanıtlamak için canlı sitede /account → "Google ile oturum aç" denenmeli (Yetkili JavaScript kaynakları)',
    );
  }

  for (const row of results) console.log(`${row.outcome.padEnd(7)} ${row.check}: ${row.detail}`);
  if (results.some((row) => row.outcome === 'HATA')) process.exitCode = 1;
}

void main();
