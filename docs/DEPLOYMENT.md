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
| `WEB_BASE_URL` | zorunlu, localhost olamaz, `https://` | e-posta bağlantıları |
| `DISABLE_RATE_LIMIT` | `true` YASAK | yalnızca test |
| `RESEND_API_KEY` | uyarı; verilirse `re_` biçiminde | yoksa e-posta GİTMEZ (doğrulama/şifre sıfırlama; elle "tekrar gönder" 503 `EMAIL_NOT_CONFIGURED`). Yalnızca sunucuda — web paketine girmez. Kurulum: `docs/EPOSTA_GOOGLE_KURULUM.md` |
| `MAIL_FROM` | `RESEND_API_KEY` varsa ZORUNLU | `Ad <adres@alan.adi>`; alan adı Resend'de doğrulanmış olmalı (`.local`/`.example`/`alan-adiniz.com` reddedilir) |
| `GOOGLE_OAUTH_CLIENT_ID` | uyarı; verilirse `<sayı>-<kod>.apps.googleusercontent.com` | yoksa Google düğmesi gizli. İstemci KİMLİĞİDİR (herkese açık, `GET /auth/providers` web'e verir); istemci SIRRI (`GOCSPX-…`) gerekmez, hiçbir yere yazılmaz |
| `AVATAR_PROVIDER` | isteğe bağlı | fotoğraftan AI avatar sağlayıcısının adı; boşsa özellik KAPALI (selfie kabul edilmez, manuel avatar çalışır). Bugün kodda tanımlı sağlayıcı YOK — bilinmeyen ad açılışta hata verir. Sağlayıcının API anahtarı da ortam değişkenidir, istemciye gitmez. |
| `PAYMENT_PROVIDER` | isteğe bağlı | gerçek para ödeme sağlayıcısının adı; boşsa mağaza KAPALI. Bugün kodda tanımlı sağlayıcı YOK — bilinmeyen ad açılışta hata verir. Webhook adresi: `POST {API}/api/v1/payments/webhook/{PAYMENT_PROVIDER}` (sağlayıcı panelinde tanımlanır). Sağlayıcının gizli anahtarı ve webhook imza sırrı ortam değişkenidir; loglanmaz, istemciye gitmez. Açmadan önce yasal inceleme şart. |
| `METRICS_TOKEN` | uyarı; verilirse ≥24 karakter | `GET /api/v1/metrics` (Prometheus) için Bearer token. Yoksa uç 404 — izleme verisi toplanmaz. `openssl rand -hex 32` |
| `ALERT_WEBHOOK_URL` | uyarı; verilirse `https://` | beklenmeyen sunucu hatalarında (500) JSON POST — Slack (`text`) ve Discord (`content`) uyumlu. Adresin kendisi gizli anahtardır; loglanmaz. |
| `AVATAR_STORAGE_DIR` | `AVATAR_PROVIDER` varsa ZORUNLU | selfie (geçici), GLB ve küçük resimlerin yerel dizini. Tek örnekli kurulum içindir; çok örnekte paylaşılan nesne deposu (S3 uyumlu) gerekir. **Kişisel veri** içerir: yedekleme/erişim buna göre. |

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

## Metrikler ve alarm (08.10.2026)

- `GET /api/v1/metrics` — Prometheus metin biçimi; `METRICS_TOKEN` ile
  (`Authorization: Bearer …`). Toplayıcı örneği:
  ```yaml
  scrape_configs:
    - job_name: at-sevdalisi-api
      metrics_path: /api/v1/metrics
      authorization: { type: Bearer, credentials_file: /etc/prometheus/at-metrics-token }
      static_configs: [{ targets: ['api:4000'] }]
  ```
  Sayaçlar SÜREÇ başınadır: birden çok örnekte her örnek ayrı kazınır,
  toplama Prometheus'ta (`sum by (route)`) yapılır. Önerilen alarm kuralları:
  `rate(http_requests_total{status=~"5.."}[5m])` artışı,
  `histogram_quantile(0.95, …http_request_duration_seconds_bucket…)`
  `ops.loadTest` bütçesini aşması, `game_gauge_query_up == 0`,
  `db_pool_connections{state="waiting"} > 0` uzun süre.
- `ALERT_WEBHOOK_URL` — beklenmeyen sunucu hatası (500) anında POST; en
  fazla `ops.alerts.cooldownSeconds`te bir mesaj, aradakiler sonraki mesajda
  sayılır. Gövde yalnızca hata ADI, yöntem, yol (sorgu dizesi atılır) ve
  istek kimliği taşır — mesaj/yığın/girdi YOK; ayrıntı loglarda istek
  kimliğiyle bulunur. İstemci hata raporları alarm üretmez.

## Yük testi (Faz 7)

```
DISABLE_RATE_LIMIT=true PORT=4100 node apps/api/dist/main.js   # ayrı bir test örneği
node tools/ops/load-test.mjs http://localhost:4100/api/v1 [--users N] [--iterations N] [--report rapor.json]
```

Bütçe `config/ops.config.json` → `loadTest`. Sanal oyuncular kalıcı misafir hesaplardır;
staging dışındaki bir adrese yalnızca `--allow-remote` ile gider — üretimde koşma.
Yerel ölçüm: tek örnek ~350 istek/sn'de doyar (CPU). Zamanlayıcılar için lider kilidi VAR
(`ops.schedulerLeader`, yalnızca lider örnek koşar). Socket.IO Redis köprüsü VAR
(`ops.realtime.redisAdapter`, `REDIS_URL`): sohbet, emote, bildirim, lobi güncellemesi ve
izleyici sayısı örnekler arası yayılır. Yarış oynatması örneğe YERELDİR (her örnek kendi
izleyicisine oynatır). Yük dengeleyici WebSocket yükseltmesini geçirmelidir; istemci yalnızca
`websocket` taşıması kullanmıyorsa (uzun yoklama) yapışkan oturum (sticky session) şarttır.
