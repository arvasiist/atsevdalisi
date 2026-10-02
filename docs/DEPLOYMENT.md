# Dağıtım (02.10.2026, Faz 13-A)

Bu belge yalnızca **depoda gerçekten olanı** anlatır. Barındırma
sağlayıcısı, imaj kayıt defteri, gizli anahtar yöneticisi ve hata izleme
hizmeti henüz SEÇİLMEDİ (sahibinin kararı) — aşağıdakiler sağlayıcıdan
bağımsızdır ve oraya olduğu gibi taşınır.

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

## Staging yığını (Faz 13-C)

`docker-compose.staging.yml` tüm sistemi ÜRETİM modunda kurar: postgres +
redis → `migrate` (tek seferlik, başarıyla bitmeli) → api → web.

```bash
cp .env.staging.example .env.staging     # gerçek değerleri doldur; gitignore'lu
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build --wait
node tools/ops/smoke.mjs http://localhost:4000/api/v1 http://localhost:3000
```

`tools/ops/smoke.mjs` uçtan uca temel akışı dener (hazırlık, istek kimliği,
misafir kaydı + oturum, korumalı uç, sahte yatırmanın üretimde KAPALI
olduğu, oturum yenileme, web ana sayfa). CI her değişiklikte aynı yığını
kurup bu testi koşar (`docker` işi).

## Yedek ve geri yükleme (Faz 13-C)

```bash
DATABASE_URL=... tools/ops/db-backup.sh yedek.dump          # pg_dump custom, sahiplik/yetki yok
TARGET_DATABASE_URL=... tools/ops/db-restore.sh yedek.dump  # hedef BOŞ değilse REDDEDER
DATABASE_URL=... tools/ops/backup-drill.sh                  # yedek → geçici DB → parmak izi karşılaştırması
```

- Yedek dosyası KİŞİSEL VERİ içerir: şifreli depoda tut, depoya commit etme.
- `db-fingerprint.mjs` satır sayıları, migration listesi, defter özeti
  (SHA-256) ve bakiye toplamını karşılaştırır; tek bir bakiyede +1 fark
  bile yakalanır (denendi).
- CI her değişiklikte testlerin bıraktığı gerçek veriyle provayı koşar.
- Zamanlanmış yedek ve saklama süresi barındırma sağlayıcısına bağlıdır
  (henüz yok): yönetilen Postgres'in anlık görüntüsü + bu betikle günlük
  mantıksal yedek önerilir. Geri yükleme hedefi her zaman BOŞ bir
  veritabanıdır; doğrulamadan trafik çevrilmez.

## Loglar ve hata izleme (Faz 13-C)

- Üretimde API logları **tek satır JSON**dur (`ts`, `level`, `msg`, alanlar)
  — her log toplayıcı ayrıştırır. Gizli değer (token, şifre, bağlantı)
  loglanmaz.
- Beklenmeyen sunucu hataları ve web hata sınırlarının bildirdiği istemci
  hataları (`POST /client-errors`, oturumsuz, IP başına hız sınırlı, alanlar
  kırpılır) `infrastructure/ops/error-reporting.ts`ten geçer. Varsayılan
  raporlayıcı JSON log yazar; Sentry vb. seçildiğinde `setErrorReporter` ile
  takılır — çağıranlar değişmez.
- Web: `app/error.tsx` (sayfa) ve `app/global-error.tsx` (kök) hata
  sınırları; ekrana hata ayrıntısı basılmaz.
