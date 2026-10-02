# Dağıtım (02.10.2026, Faz 13-A)

Bu belge yalnızca **depoda gerçekten olanı** anlatır. Staging/production
ortamı, imaj kayıt defteri ve gizli anahtar yöneticisi henüz YOKTUR.

## İmajlar

Kök dizinden derlenir:

```bash
docker build -f apps/api/Dockerfile -t at-sevdalisi-api .
docker build -f apps/api/Dockerfile --target migrate -t at-sevdalisi-migrate .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.alan-adi/api/v1 -t at-sevdalisi-web .
```

- API ve web imajları `node` kullanıcısıyla (root değil) çalışır ve
  `HEALTHCHECK` taşır.
- **Sıra:** önce `migrate` imajı tek seferlik iş olarak (`npm run migrate`),
  sonra API. Migration'lar yalnızca eklemelidir; geri alma `migrate:undo`.
- `NEXT_PUBLIC_*` değerleri web paketine DERLEME anında gömülür ve
  tarayıcıya gider — buraya gizli değer konmaz.
- CI her değişiklikte üç imajı derler ve API imajının eksik ortamla
  **açılmayı reddettiğini** dener (`.github/workflows/ci.yml` → `docker`).

## Ortam değişkenleri (API)

`NODE_ENV=production` iken açılışta doğrulanır
(`apps/api/src/infrastructure/ops/production-env.ts`); hata varsa süreç
çıkış kodu 1 ile durur. Değerlerin kendisi loglanmaz.

| Değişken | Üretimde | Not |
|---|---|---|
| `JWT_SECRET` | zorunlu, ≥32 karakter, test değeri olamaz | `openssl rand -base64 48` |
| `DATABASE_URL` | zorunlu | |
| `REDIS_URL` | zorunlu | |
| `CORS_ORIGIN` | zorunlu, localhost olamaz | web adresi |
| `WEB_BASE_URL` | zorunlu, localhost olamaz | e-posta bağlantıları |
| `DISABLE_RATE_LIMIT` | `true` YASAK | yalnızca test |
| `RESEND_API_KEY` | uyarı | yoksa e-posta gitmez |
| `GOOGLE_OAUTH_CLIENT_ID` | uyarı | yoksa Google düğmesi gizli |

Sahte para yatırma üretimde HER ZAMAN kapalıdır (`MockPaymentProvider`);
web formu sunucunun `depositAvailable` bayrağına uyar.

## Sağlık uçları

- `GET /api/v1/health` — canlılık; bağımlılık sorgulamaz (orkestratör
  veritabanı kesintisinde süreci öldürmesin).
- `GET /api/v1/health/ready` — hazırlık; PostgreSQL `SELECT 1` + Redis
  `PING`, `config/ops.config.json` zaman aşımıyla. Biri düşükse 503, ayrıntı
  sızdırmaz.

## İstek kimliği

Her yanıt `X-Request-Id` taşır (gelen geçerli kimlik korunur, yoksa
üretilir); hata zarfı `error.requestId` içerir ve beklenmeyen hata logu
aynı kimlikle yazılır. Kullanıcı destek talebinde bu kimliği verir.

## Güvenlik taramaları (CI `security` işi)

- **Bağımlılık kapısı** (`tools/security/audit-gate.mjs`): yüksek/kritik
  her danışman `security/audit-allowlist.json`da gerekçeli ve süresi
  dolmamış olmalı. 02.10.2026 itibarıyla liste BOŞTUR (Nest 11 + Next 16
  yükseltmeleriyle yüksek/kritik açık kalmadı).
- **Gizli anahtar taraması**: gitleaks (sürüm sabit, SHA-256 doğrulamalı),
  tüm git geçmişi. İncelenmiş yanlış pozitifler `.gitleaksignore`da.
