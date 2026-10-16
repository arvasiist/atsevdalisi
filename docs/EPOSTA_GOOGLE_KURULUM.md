# E-posta (Resend) + Google Girişi Kurulumu

Kod hazır. Gerçek anahtarlar depoya girmez; aşağıdaki adımlar senin
hesaplarında yapılır. Değerler sunucunun ortam değişkenine (barındırma
panelinde) ve istersen yalnızca kontrol için GitHub Secrets'a yazılır.

## 1. Resend (doğrulama + şifre sıfırlama e-postaları)

1. https://resend.com → hesap aç.
2. **Domains → Add domain**: e-postanın gideceği alan adını ekle (ör.
   `atsevdalisi.com.tr`). Verilen **SPF ve DKIM** DNS kayıtlarını alan adı
   sağlayıcına gir; durum **Verified** olana kadar bekle.
3. **API Keys → Create**: yetki **Sending access** yeter. Anahtar `re_` ile
   başlar; bir kez gösterilir.
4. Sunucu ortamına:
   - `RESEND_API_KEY=re_…`
   - `MAIL_FROM=At Sevdalısı <no-reply@atsevdalisi.com.tr>` (doğrulanmış alan adı)
   - `WEB_BASE_URL=https://oyun-adresin` (e-postadaki bağlantılar buraya gider)

API, üretimde anahtar biçimi yanlışsa, `MAIL_FROM` eksik/yer tutucuysa ya da
`WEB_BASE_URL` `https://` değilse **açılmaz** ve nedenini yazar
(`production-env.ts`). Anahtar yoksa yalnızca uyarı verir; o durumda e-posta
gitmez ve "tekrar gönder" düğmesi 503 `EMAIL_NOT_CONFIGURED` alır.

## 2. Google ile giriş

1. https://console.cloud.google.com → proje seç/oluştur.
2. **API'ler ve Hizmetler → OAuth izin ekranı**: uygulama adı, destek
   e-postası, gizlilik politikası adresi (`https://oyun-adresin/yasal/gizlilik`),
   kullanım şartları adresi (`/yasal/kullanim-sartlari`). Kapsam olarak
   yalnızca `openid`, `email`, `profile`. Yayına almak için "Production".
3. **Kimlik bilgileri → Kimlik bilgisi oluştur → OAuth istemci kimliği →
   Web uygulaması**.
   - **Yetkili JavaScript kaynakları**: `https://oyun-adresin` (+ staging adresi,
     yerelde `http://localhost:3000`).
   - **Yetkili yönlendirme URI'leri: BOŞ bırakılabilir** — giriş, Google'ın açılır
     penceresinden kimlik token'ı alır; sunucu bu token'ı istemci kimliğiyle
     (`aud`), imzayla ve süreyle doğrular.
4. Sunucu ortamına yalnızca **istemci kimliği**:
   `GOOGLE_OAUTH_CLIENT_ID=123456789012-xxxx.apps.googleusercontent.com`.
   İstemci **sırrı** (`GOCSPX-…`) kullanılmaz; hiçbir yere yazma.

Web uygulamasına ayrıca değişken gerekmez: düğme kimliği `GET /auth/providers`
ucundan alır; kimlik tanımlı değilse düğme gizlidir.

## 3. Kontrol

- **GitHub'da (önerilen):** Settings → Secrets and variables → Actions →
  `RESEND_API_KEY`, `MAIL_FROM`, `INTEGRATION_TEST_EMAIL` (kendi adresin),
  `GOOGLE_OAUTH_CLIENT_ID`. Sonra Actions → **Entegrasyon kontrolü** → Run
  workflow. Resend gerçek bir test e-postası yollar; Google kimliğinin biçimi
  denetlenir. Tanımsız secret "ATLANDI" yazar (başarı sayılmaz). Normal CI bu
  secrets'ı KULLANMAZ.
- **Yerelde:** `cd apps/api && RESEND_API_KEY=… MAIL_FROM=… INTEGRATION_TEST_EMAIL=… GOOGLE_OAUTH_CLIENT_ID=… npx tsx tools/check-integrations.ts`
- **Google'ın gerçekten çalıştığı** yalnızca tarayıcıda kanıtlanır: canlı sitede
  `/account` → "Google ile oturum aç". "Origin mismatch" görürsen JavaScript
  kaynaklarına tam adresi (https, alt alan, port) ekle.

## Güvenlik notları

- `.env`, `.env.local`, `.env.production`, `.env.staging` `.gitignore`'dadır;
  depoda yalnızca `*.example` dosyaları var.
- Anahtar, alıcı adresi ve e-posta içeriği (sıfırlama bağlantısı) loglanmaz;
  Google token'ı loglanmaz (kütüphane hata mesajına token eklediği için yalnızca
  gerekçe yazılır).
- Resend anahtarını yalnızca **Sending access** ile oluştur; sızarsa Resend
  panelinden iptal edip yenisini gir.
