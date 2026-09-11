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

| Faz | Açıklama | Durum |
|---|---|---|
| **FAZ 0** | Teknik keşif, mimari kararlar, repo iskeleti, dokümantasyon | 🟡 Devam ediyor |
| FAZ 1 | Core (Player, Auth, Economy, Horse, Stable, Training, Care, Basic Race Engine) | ⏳ Planlandı |
| FAZ 2 | Management (Market, Vet, Farrier, Nutrition, Jockey, Staff) | ⏳ Planlandı |
| FAZ 3 | Genetics (Pedigree, Breeding, Inheritance, Mutation) | ⏳ Planlandı |
| FAZ 4 | Farm (Tesis yükseltmeleri) | ⏳ Planlandı |
| FAZ 5 | Advanced Race Engine (Pace, Overtaking, Blocking, Replay) | ⏳ Planlandı |
| FAZ 6 | 3D/Web Sunum Katmanı (Three.js, kamera, VFX, ses) | ⏳ Planlandı |
| FAZ 7 | Online (Matchmaking, PvP, Kulüpler, Turnuvalar, Anti-cheat) | ⏳ Planlandı |

Detaylı yol haritası için bkz. [`docs/ROADMAP.md`](docs/ROADMAP.md).

> **Not:** Orijinal proje brief'i Unity + C# istemci öngörmekteydi. Proje sahibinin
> talebi üzerine istemci **web tabanlı, responsive ve mobil uyumlu** bir mimariye
> pivot edilmiştir. Gerekçeler ve detaylar için [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 2. Teknoloji yığını

```text
Frontend   : Next.js 14+ (React, TypeScript) — responsive, PWA-uyumlu, mobil-öncelikli
3D/Görsel  : Three.js (react-three-fiber) — yarış sahnesi görselleştirme
Backend    : NestJS (Node.js, TypeScript) — katmanlı mimari (Domain/Application/Infra/API)
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

> ⚠️ **Önemli:** Bu iskelet, bağımlılıkları **kurulu olmadan** teslim edilmiştir çünkü
> bu depo geliştirme ortamının dış npm registry erişimi güvenlik politikasıyla
> kısıtlanmıştır. Kendi makinenizde veya CI ortamınızda aşağıdaki adımları
> çalıştırarak bağımlılıkları kurabilirsiniz.

```bash
# 1) Bağımlılıkları kurun (Node.js 20+ gereklidir)
npm install

# 2) Ortam değişkenlerini ayarlayın
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3) PostgreSQL ve Redis'i ayağa kaldırın (Docker öneriliyor)
docker compose up -d postgres redis

# 4) Veritabanı migration'larını çalıştırın
npm run migrate

# 5) Geliştirme sunucularını başlatın
npm run dev:api    # http://localhost:4000
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
