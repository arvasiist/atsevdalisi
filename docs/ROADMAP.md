# ROADMAP.md — Yol Haritası

> Kaynak: `docs/PROJECT_BRIEF.md` §5 (Fazlar), §73 (İlk geliştirilecek
> modüller), §74 (İlk prototip hedefi). Sıra **rastgele değiştirilemez**
> (brief §73 başlığı). Web stack terimleriyle güncellenmiştir; mantık ve
> sıra birebir korunmuştur.

## Faz durumu

| Faz | Adı | Kapsam | Durum |
|---|---|---|---|
| **0** | Teknik keşif ve planlama | Repo, mimari, dokümantasyon, DB migration altyapısı, test altyapısı | 🟡 Bu depoda tamamlanıyor |
| 1 | Core | Player, Auth, Economy, Horse, Stable, Training, Care, Basic Race Engine, Race Result, Progression | ⏳ |
| 2 | Management | Horse Market, Buy/Sell, Vet, Farrier, Nutrition, Jockey, Staff, Stable capacity, Costs | ⏳ |
| 3 | Genetics | Pedigree, Mare/Stallion, Genetic traits, Inheritance, Mutation, Foal, Growth, Bloodline | ⏳ |
| 4 | Farm | Stable upgrade, Paddock, Training track, Vet center, Breeding center, Staff facilities | ⏳ |
| 5 | Advanced Race Engine | Continuous simulation, Pace, Position, Overtaking, Blocking, Turns, Lane changes, Sprint, Fatigue, Jockey decisions, Photo finish, Replay, Cameras | ⏳ |
| 6 | Web 3D/Görsel Sunum | Race track, Horse models, Jockey models, Animations, Camera system, UI, VFX, Audio, Crowd, Weather | ⏳ |
| 7 | Online | Matchmaking, PvP, Race rooms, Leaderboards, Clubs, Tournaments, Seasons, Anti-cheat, Server-authoritative simulation | ⏳ |

> **Not:** Orijinal brief'teki FAZ 6 "3D Presentation" Unity'ye özgüydü;
> güncel karşılığı "Web 3D/Görsel Sunum" (Three.js tabanlı) olarak
> güncellenmiştir. Sıra ve kapsam değişmemiştir.

## İlk geliştirilecek modüller (brief §73 — güncellenmiş sıra)

```text
1.  Repository                    ✅ (bu depo)
2.  Documentation                 ✅ (bu depo, docs/)
3.  Backend skeleton              ✅ (apps/api iskeleti, bu depoda)
4.  Database                      ✅ (migrations, bu depoda)
5.  Authentication                ⏳ FAZ 1
6.  Player                        ⏳ FAZ 1
7.  Economy                       ⏳ FAZ 1
8.  Horse                         ⏳ FAZ 1
9.  Stable                        ⏳ FAZ 1
10. Training                      ⏳ FAZ 1
11. Care                          ⏳ FAZ 1
12. Jockey                        ⏳ FAZ 1/2
13. Race domain                   ⏳ FAZ 1
14. Race Engine                   ⏳ FAZ 1 (temel) → FAZ 5 (gelişmiş)
15. Race Result                   ⏳ FAZ 1
16. Market                        ⏳ FAZ 2
17. Genetics                      ⏳ FAZ 3
18. Farm                          ⏳ FAZ 4
19. Web UI (Next.js)              ⏳ FAZ 1'den itibaren kademeli (Unity UI yerine)
20. Web 3D/Görsel Sunum (Three.js) ⏳ FAZ 6 (Unity 3D yerine)
21. Online                        ⏳ FAZ 7
22. Leaderboard                   ⏳ FAZ 7
23. Club                          ⏳ FAZ 7
24. Tournament                    ⏳ FAZ 7
```

## FAZ 0 tamamlanma kriterleri (bu depo)

- [x] Repository yapısı oluşturuldu (monorepo: `apps/`, `packages/`,
      `database/`, `config/`, `docs/`).
- [x] Teknoloji kararları yazılı hale getirildi (`ARCHITECTURE.md`).
- [x] Coding conventions belirlendi (`CODING_CONVENTIONS.md`).
- [x] Environment dosyaları hazırlandı (`.env.example` dosyaları).
- [x] Database migration altyapısı kuruldu (`database/migrations/`).
- [x] Test altyapısı kuruldu (Vitest config + örnek testler).
- [x] Dokümantasyon klasörü oluşturuldu ve tüm ana dokümanlar yazıldı.
- [ ] `npm install` gerçek bir ağ erişimi olan ortamda çalıştırılıp
      doğrulandı (bu oturumun ortam kısıtı nedeniyle proje sahibi
      tarafından yapılmalı — bkz. `ARCHITECTURE.md` §9).
- [ ] GitHub deposu proje sahibi tarafından oluşturuldu ve bu kod bu
      depoya push edildi.

## FAZ 1 önerilen alt sıra (bir sonraki oturum için)

1. `apps/api`: `players` domain modeli + `AuthModule` (register/login/JWT)
2. `apps/api`: `EconomyModule` (para/gem authoritative işlemler, transaction
   yardımcıları)
3. `apps/api`: `HorseModule` (CRUD + stat/health/durum okuma)
4. `apps/api`: `TrainingModule` (temel antrenman use-case'i + testler)
5. `apps/api`: `CareModule` (tımar/yem/su/temizlik/veteriner/nalbant/dinlendir)
6. `apps/api`: Temel (segment'siz, BaseAbility formülüyle) Race Engine +
   determinism testi
7. `apps/web`: Ana Sayfa + Ahırım ekranlarının gerçek API'ye bağlanması
   (bu depodaki statik iskeletin üzerine inşa edilir)
8. Uçtan uca "ilk oynanabilir prototip" akışının doğrulanması (brief §74)

Her adımdan sonra brief §72 protokolü (ANALYZE→PLAN→IMPLEMENT→TEST→
VERIFY→DOCUMENT) uygulanır; büyük miktarda kod tek seferde üretilmez
(brief §91).

## Açık kararlar (proje sahibinin onayı bekleniyor)

Bkz. `ARCHITECTURE.md` §10 için tam liste ve gerekçeler. Özet:

1. Kimlik doğrulama sağlayıcısı (e-posta/sosyal/misafir)
2. Çevrimdışı/zayıf bağlantı davranışı
3. Erişilebilirlik (a11y) hedefi
4. Yerelleştirme (i18n) kapsamı
5. Bildirim kanalı (push/in-app/e-posta)
6. Ödeme altyapısı sağlayıcısı
7. KVKK/gizlilik politikası
8. Rate limiting / bot koruması detayları
9. Gözlemlenebilirlik (log/hata izleme) araçları
10. Asset üretim hattı (görsel/3D varlıklar)
11. Barındırma/deploy sağlayıcısı (`ARCHITECTURE.md` §8)
12. GitHub deposu erişimi (bkz. altta)

## GitHub deposu — bekleyen adım

Bu geliştirme ortamının GitHub CLI'a bağlı bir kimlik doğrulaması yoktur.
Proje sahibi tercih ettiği üzere:

1. GitHub'da boş bir `at-sevdalisi` deposu oluşturulacak.
2. Depo remote URL'i ve bir erişim yöntemi (Personal Access Token veya
   deploy key) bu oturuma iletilecek.
3. Bu depodaki commit geçmişi o remote'a push edilecek.

Bu adım tamamlanana kadar kod bu oturumun çalışma alanında güvenle
saklanmaktadır ve talep edildiğinde sıkıştırılmış dosya olarak da teslim
edilebilir.
