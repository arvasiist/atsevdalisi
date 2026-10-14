# 🐎 AT SEVDALISI

**3D at yarışı + at sahibi/yönetici simülasyonu + ekonomik yönetim + antrenman + yetiştiricilik + çevrimiçi rekabet**

> Küçük bir ahırla başlayıp güçlü atlar yetiştiren, yarış kazanan, ekonomik olarak
> büyüyen ve kendi yarış ekosistemini kuran başarılı bir at sahibi/yönetici olma
> fantezisini sunan, web tabanlı, mobil uyumlu, responsive bir simülasyon oyunu.

Bu doküman, projeye yeni başlayan herkesin (geliştirici, tasarımcı, ya da Claude Code
gibi bir yapay zekâ asistanı) 5 dakikada projenin ne olduğunu, nasıl çalıştığını ve
nereden devam edeceğini anlaması için hazırlanmıştır.

---

## 1. Proje durumu

> **14.10.2026:** Buradaki eski faz tablosu ("FAZ 0 devam ediyor") projenin ilk
> gününden beri güncellenmediği için kaldırıldı. Gerçek ve koda göre doğrulanmış durum
> [`MASTER_STATUS.md`](MASTER_STATUS.md) ve [`PROJE_DURUMU.md`](PROJE_DURUMU.md)
> §5'tedir. Kısaca: sunucu (oyuncu, at, ahır, antrenman, bakım, ekonomi,
> pazar/müzayede, yetiştirme, yarış motoru, lobi/turnuva/takvim, kulüp, sezon,
> sosyal, yönetim) ve web arayüzü çalışır durumdadır; 3D at/jokey/hipodrom
> görüntüleri hâlâ prosedüreldir (gerçek model dosyası yok).

Detaylı yol haritası için bkz. [`docs/ROADMAP.md`](docs/ROADMAP.md).

> **Not:** Orijinal proje brief'i Unity + C# istemci öngörmekteydi. Proje sahibinin
> talebi üzerine istemci **web tabanlı, responsive ve mobil uyumlu** bir mimariye
> pivot edilmiştir. Gerekçeler ve detaylar için [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 2. Teknoloji yığını

```text
Frontend   : Next.js 16 + React 19 (TypeScript) — responsive, PWA-uyumlu, mobil-öncelikli
3D/Görsel  : Three.js (react-three-fiber 9) — yarış sahnesi görselleştirme
Backend    : NestJS 11 (Node.js, TypeScript) — katmanlı mimari (Domain/Application/Infra/API)
Veritabanı : PostgreSQL — authoritative oyun verisi
Cache      : Redis — session, leaderboard, aktif yarış lobisi
Realtime   : WebSocket (Socket.IO / Nest Gateways) — canlı yarış ve online lobi
Test       : Vitest / Jest — unit + entegrasyon testleri
CI         : GitHub Actions
```

Detaylar: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 3. Klasör yapısı

```text
at-sevdalisi/
├── docs/                  # Tüm mimari, tasarım ve süreç dokümantasyonu (source of truth)
├── apps/
│   ├── web/               # Next.js web istemcisi (responsive, mobil uyumlu)
│   └── api/               # NestJS backend (Domain/Application/Infrastructure/API katmanları)
├── packages/
│   ├── shared-types/      # Frontend + backend arasında paylaşılan TypeScript tipleri
│   └── game-config/       # Tip güvenli config loader (config/ altındaki JSON'ları okur)
├── database/
│   ├── migrations/        # Sıralı SQL migration dosyaları
│   └── seeds/             # Geliştirme ortamı için örnek veri
├── config/                # Oyun dengesi parametreleri (JSON) — kod değişmeden ayarlanabilir
└── tools/                 # Yardımcı scriptler (balance simülatörü, vb.)
```

## 4. Kurulum (yerel geliştirme ortamı)

Gereken: Node.js 22, PostgreSQL (16+), Redis (6379).

### Windows — tek komut

Proje klasöründe `cmd` açıp:

```bat
tools\dev\yerel-baslat.cmd
```

Betik projeye özel bir PostgreSQL kümesi kurar (`%LOCALAPPDATA%\at-sevdalisi\pgdata`,
port **5433**, kurulu PostgreSQL servisiyle çakışmaz), Redis'i kontrol eder,
`npm install` + paket derleme + migration yapar, API (4000) ve web (3000)
sunucularını ayrı pencerelerde açar ve tarayıcıyı getirir. Durdurmak için
pencereleri kapatıp `tools\dev\yerel-durdur.cmd` (veriler silinmez).

### Elle (her işletim sistemi)

> ⚠️ API `.env` dosyasını **okumaz** (dotenv yok): değişkenler terminalde
> verilmelidir. Tam liste `apps/api/.env.example`te.

```bash
npm install
npm run build:packages          # shared-types + game-config (dist/ gitignore'lu)
export DATABASE_URL=postgres://at_sevdalisi:at_sevdalisi@localhost:5432/at_sevdalisi
export REDIS_URL=redis://localhost:6379
export JWT_SECRET=yerel-gelistirme-anahtari
npm run migrate
npm run dev:api    # http://localhost:4000  (aynı değişkenlerle)
npm run dev:web    # http://localhost:3000
```

## 5. Dokümantasyon haritası

| Doküman | İçerik |
|---|---|
| [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) | Orijinal proje brief'i (source of truth) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Mimari kararlar, teknoloji seçimleri, gerekçeler |
| [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) | Oyun tasarımı, ekranlar, UX prensipleri |
| [`docs/GAME_FLOW.md`](docs/GAME_FLOW.md) | Oyun döngüleri (günlük döngü, ana döngü, kariyer) |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Veritabanı şeması ve ilişkiler |
| [`docs/API.md`](docs/API.md) | REST API endpoint tasarımı |
| [`docs/RACE_ENGINE.md`](docs/RACE_ENGINE.md) | Yarış motoru mimarisi ve aşamaları |
| [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) | Antrenman, yarış performansı, pace, overtaking formülleri |
| [`docs/GENETICS.md`](docs/GENETICS.md) | Kalıtım, mutasyon, soy ağacı sistemi |
| [`docs/ECONOMY.md`](docs/ECONOMY.md) | Gelir/gider modeli, para birimleri, piyasa |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Server-authoritative kurallar, anti-cheat, idempotency |
| [`docs/TESTING.md`](docs/TESTING.md) | Test stratejisi ve kabul kriterleri |
| [`docs/CODING_CONVENTIONS.md`](docs/CODING_CONVENTIONS.md) | Kod standartları, katman kuralları |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Faz bazlı yol haritası ve modül sırası |

## 6. Temel tasarım ilkeleri

Bu ilkeler proje boyunca korunmalıdır (bkz. `docs/PROJECT_BRIEF.md` §89):

1. **Stat ≠ otomatik galibiyet** — En yüksek rating her zaman kazanmaz.
2. **Animasyon ≠ oyun sonucu** — Sonuç önce simüle edilir, sonra görselleştirilir.
3. **Client ≠ authoritative** — Kritik veriler (para, stat, sonuç) her zaman sunucuda hesaplanır.
4. **Randomness ≠ haksızlık** — Kontrollü rastgelelik, adil ama öngörülemez sonuçlar üretir.
5. **Daha pahalı ≠ her zaman daha iyi** — Beslenme/bakım seçimleri bağlama duyarlıdır.
6. **Her önemli değer config'den yönetilebilir olmalı** — Magic number yok.

## 7. Katkı ve geliştirme kuralları

Bkz. [`docs/CODING_CONVENTIONS.md`](docs/CODING_CONVENTIONS.md) ve proje brief'inin
71-72. bölümleri (Claude Code çalışma kuralları ve geliştirme protokolü). Özetle:

- Büyük özellikler küçük, test edilebilir parçalara bölünür.
- Kritik sistemler (Race Engine, Genetics, Economy) test edilmeden bir sonraki
  sisteme geçilmez.
- Domain mantığı UI'dan ve veritabanı erişiminden izole tutulur.
- Aynı `seed` + aynı `snapshot` + aynı `config` = aynı yarış sonucu (determinism).

## 8. Lisans

Bu proje şu an için özel (private) geliştirme aşamasındadır.
