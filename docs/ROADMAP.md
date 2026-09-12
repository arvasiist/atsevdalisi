# ROADMAP.md — Yol Haritası

> Kaynak: `docs/PROJECT_BRIEF.md` §5 (Fazlar), §73 (İlk geliştirilecek
> modüller), §74 (İlk prototip hedefi). Sıra **rastgele değiştirilemez**
> (brief §73 başlığı). Web stack terimleriyle güncellenmiştir; mantık ve
> sıra birebir korunmuştur.

## Faz durumu

| Faz | Adı | Kapsam | Durum |
|---|---|---|---|
| **0** | Teknik keşif ve planlama | Repo, mimari, dokümantasyon, DB migration altyapısı, test altyapısı | ✅ Tamamlandı |
| 1 | Core | Player, Auth, Economy, Horse, Stable, Training, Care, Basic Race Engine, Race Result, Progression | 🟡 Domain katmanı tamam, wiring bekliyor |
| 2 | Management | Horse Market, Buy/Sell, Vet, Farrier, Nutrition, Jockey, Staff, Stable capacity, Costs | 🟡 Domain katmanı tamam, wiring bekliyor |
| 3 | Genetics | Pedigree, Mare/Stallion, Genetic traits, Inheritance, Mutation, Foal, Growth, Bloodline | 🟡 Domain katmanı tamam, wiring bekliyor |
| 4 | Farm | Stable upgrade, Paddock, Training track, Vet center, Breeding center, Staff facilities | 🟡 Domain katmanı tamam, wiring bekliyor |
| 5 | Advanced Race Engine | Continuous simulation, Pace, Position, Overtaking, Blocking, Turns, Lane changes, Sprint, Fatigue, Jockey decisions, Photo finish, Replay, Cameras | 🟡 Domain katmanı tamam, wiring bekliyor |
| 6 | Web 3D/Görsel Sunum | Race track, Horse models, Jockey models, Animations, Camera system, UI, VFX, Audio, Crowd, Weather | 🟡 Basit şekillerle iskelet tamam, gerçek 3D asset'ler bekliyor |
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
14. Race Engine                   🟡 FAZ 1 (temel, tamam) → FAZ 5 (gelişmiş, domain katmanı tamam)
15. Race Result                   ⏳ FAZ 1
16. Market                        ⏳ FAZ 2
17. Genetics                      ⏳ FAZ 3
18. Farm                          ⏳ FAZ 4
19. Web UI (Next.js)              ⏳ FAZ 1'den itibaren kademeli (Unity UI yerine)
20. Web 3D/Görsel Sunum (Three.js) 🟡 FAZ 6 (Unity 3D yerine) — iskelet tamam
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

## FAZ 1 tamamlanma durumu (bu oturum)

Bu oturumda **domain katmanı** (framework'ten bağımsız, saf TypeScript —
NestJS/Node bağımlılığı olmayan iş mantığı) tamamlandı ve her biri hem
`tsc` ile (mimari saflık + tip doğruluğu) hem de gerçek girdilerle çalışan
bir doğrulama betiği ile (mantık doğruluğu) test edildi. Ayrıca ileride
`npm install` çalıştığında otomatik koşacak gerçek Vitest test dosyaları
(`apps/api/test/domain/**/*.spec.ts`) yazıldı:

- [x] `domain/economy` — cüzdan işlemleri (borç/alacak/transfer, negatif
      bakiye koruması).
- [x] `domain/horse` — durum değerleri (health/fitness/fatigue/energy/
      morale) ve yaş/gelişim eğrisi.
- [x] `domain/training` — antrenman kazancı, yorgunluk, sakatlık riski
      (docs/ALGORITHMS.md §1), hazır olma kontrolü.
- [x] `domain/care` — tımar/su/temizlik/veteriner/nalbant/dinlendir +
      beslenme (brief §11-12), cooldown kontrolü.
- [x] `domain/race` — temel (segment bazlı) Race Engine: BaseAbility
      (§2), controlled randomness (§3), pace sistemi (§5), overtaking/
      bloklanma (§6), çevre uyumu (§7), mesafe kategorileri (§8);
      determinism ve "genelde güçlü at kazanır ama sürpriz mümkündür"
      testleri geçti.
- [x] `domain/progression` — XP/Level eğrisi ve unlock sistemi (brief §36).
- [x] `domain/player` — yeni oyuncu oluşturma (başlangıç bakiyesi),
      kullanıcı adı/görünen ad doğrulama kuralları, Google/Apple Sign-In
      eşlemesi (`auth-provider.ts` — proje sahibinin kararı).
- [x] `domain/stable` — temel ahır kapasitesi (brief §32), "Ahır Özeti"
      (at sayısı/ortalama kondisyon/sağlık uyarıları, brief §38-39).

**Bilinçli olarak bu oturuma dahil edilmeyenler** (bir sonraki adım):

- NestJS controller/use-case/module wiring'i (`api/`, `application/`
  klasörleri) — bu kod `@nestjs/*` paketlerine bağımlıdır ve bu ortamda
  `npm install` çalışmadığından (bkz. `ARCHITECTURE.md` §9) derleyici ile
  doğrulanamaz; yanlışlıkla doğrulanmamış/hatalı framework kodu teslim
  etmemek için bilerek ertelendi. Domain fonksiyonları hazır olduğundan bu
  adım, gerçek bir Node ortamında (`npm install` sonrası) hızlıca
  tamamlanabilir bir "bağlama" (wiring) işidir.
- ✅ Auth sağlayıcısı kararı netleşti: **Google/Apple Sign-In** (bkz.
  `ARCHITECTURE.md` §10 madde 1). `player_auth_providers` migration'ı
  (`0011`) ve domain fonksiyonları (`domain/player/auth-provider.ts`)
  bu oturumda eklendi. Kalan iş: NestJS `AuthModule`'ün gerçek Google/Apple
  ID token doğrulamasını yapması (infrastructure detayı, `npm install`
  gerektirir).
- `apps/web` ekranlarının gerçek API'ye bağlanması (API henüz çalışır
  durumda değil, yukarıdaki maddeye bağlı).

## FAZ 2 ve FAZ 3 tamamlanma durumu (bu oturum)

FAZ 1'deki aynı yöntemle (framework'ten bağımsız domain katmanı, her biri
`tsc` ile mimari doğrulama + gerçek girdilerle runtime doğrulama + kalıcı
Vitest testleri) FAZ 2 (Yönetim) ve FAZ 3 (Genetik) domain katmanı
tamamlandı — roadmap sırası korunarak (brief §73 "sıra rastgele
değiştirilemez"), FAZ 2 atlanmadan FAZ 3'e geçilmedi:

**FAZ 2 — Yönetim:**

- [x] `domain/market` — At Pazarı: `calculateMarketValue` (docs/
      ALGORITHMS.md §11), ilan oluşturma/satın alma/iptal/süre dolumu,
      wallet üzerinden authoritative para transferi.
- [x] `domain/jockey` — Jokey-at uyumu (§12), jokey yetenek kompozit puanı
      (`RaceEntrantSnapshot.jockeySkillComposite`'i besler), kiralama.
- [x] `domain/staff` — Personel Sistemi (brief §33, jokey hariç): aday
      oluşturma, maaş hesabı, kiralama, sözleşme süresi, rol bazlı bonus
      çarpanı.
- [x] `domain/stable` genişletmesi — Ahır yükseltme maliyeti (brief §32
      "Upgrade örneği" devamı, seviye 4-5 eklendi).
- [x] `database/migrations/0012` — `staff` tablosu + FAZ 1'den kalan bir
      eksiğin giderilmesi: `players.stable_level` (domain/stable zaten bu
      değeri parametre olarak bekliyordu, hiçbir migration eklememişti).

**FAZ 3 — Genetik:**

- [x] `domain/breeding/genetics.ts` — Saf kalıtım matematiği: inheritance
      split, mutasyon, child stat/potential (docs/ALGORITHMS.md §10).
- [x] `domain/breeding/pedigree.ts` — Ortak ata (inbreeding) tespiti,
      ebeveyn yaşı/sağlığı bazlı doğum sağlık riski (docs/GENETICS.md §6),
      tay soy kaydı oluşturma.
- [x] `domain/breeding/breeding.ts` — Üreme uygunluğu kontrolü (yaş/
      cooldown/cinsiyet/durum), damızlık ücreti, tam üreme akışı
      orkestrasyonu (GENETICS.md §1).
- [x] Determinism doğrulandı: aynı seed + aynı ebeveyn çifti → aynı tay
      (1000+ deneme ile mutasyon/potansiyel üst sınırları da ayrıca test
      edildi).

**Bilinçli olarak bu oturuma dahil edilmeyenler:**

- NestJS controller/use-case/module wiring'i (FAZ 1 ile aynı gerekçe —
  `npm install` bu ortamda çalışmıyor, bkz. `ARCHITECTURE.md` §9).
- `calculateJockeySkillComposite`/`calculateStaffBonusMultiplier`'ın
  gerçekten Race Engine'e / Training-Care formüllerine bağlanması — bu,
  zaten test edilmiş FAZ 1 modüllerini riske atmadan ayrı bir wiring
  kararı olarak bırakılmıştır (bkz. ilgili domain README'leri).
- Açık artırma (auction) teklif mekanizması — şema (`listing_type`) hazır,
  teklif verme/kazanma mantığı uygulanmadı.

## FAZ 4 tamamlanma durumu (bu oturum)

Aynı yöntemle (framework'ten bağımsız domain katmanı, `tsc` ile mimari
doğrulama + gerçek girdilerle runtime doğrulama + kalıcı Vitest testleri —
bu oturumda ayrıca 148 testin (129 önceki FAZ + 19 yeni) TAMAMI, `vitest`
paketinin yerini tutan özel bir minimal test çalıştırıcıyla tek tek
gerçekten koşturularak doğrulandı) FAZ 4 (Çiftlik) domain katmanı
tamamlandı — roadmap sırası korunarak (FAZ 1→2→3 tamamlanmadan FAZ 4'e
geçilmedi):

- [x] `domain/farm` (yeni) — brief §32 ÇİFTLİK'in ahır DIŞINDAKİ 7 tesisi:
      Paddock, Antrenman pisti, Veteriner merkezi, Nalbant alanı, Üreme
      merkezi, Depo, Personel binası. İnşa/yükseltme maliyeti
      (`domain/stable`'daki `getNextStableUpgradeCost` ile birebir aynı
      desen), her tesis için TEK bir kontrollü bonus çarpanı/değeri (brief
      §32 "Bonuslar kontrollü olmalıdır"), personel binası için mutlak
      personel kapasitesi (`getMaxStaffCapacity`/`assertCanHireMoreStaff`).
- [x] `database/migrations/0013` — `facilities` tablosu (oyuncu başına
      tesis tipi başına en fazla 1 kayıt, UNIQUE kısıtı).
- [x] Ahır (`domain/stable`) TEKRARLANMADI — brief §32'nin "Stable upgrade"
      maddesi zaten FAZ 2'de tamamlanmıştı, FAZ 4 bunun üzerine sadece EK
      tesisleri ekledi.

**Bilinçli olarak bu oturuma dahil edilmeyenler:**

- Her tesisin `get*Multiplier` fonksiyonunun HANGİ Training/Care/Genetics
  formülüne bağlanacağı — `domain/staff`'taki `calculateStaffBonusMultiplier`
  ile aynı gerekçeyle (zaten test edilmiş modülleri riske atmadan) wiring
  aşamasına bırakıldı (bkz. `domain/farm/README.md` "Kapsam dışı").
- NestJS controller/use-case/module wiring'i (FAZ 1-3 ile aynı gerekçe).

## FAZ 5 tamamlanma durumu (bu oturum)

Aynı yöntemle (framework'ten bağımsız domain katmanı, `tsc` ile mimari
doğrulama + gerçek girdilerle runtime doğrulama + kalıcı Vitest testleri —
bu oturumda 202 testin (148 önceki FAZ + 54 yeni race-domain testi) TAMAMI
gerçekten koşturularak doğrulandı, sıfır regresyon) FAZ 5 (Gelişmiş Yarış
Motoru) domain katmanı tamamlandı — roadmap sırası korunarak (FAZ 1→2→3→4
tamamlanmadan FAZ 5'e geçilmedi):

- [x] `domain/race/race-engine.ts` — `simulateRace` brief §21'e uygun
      3-geçişli segment-içi döngüyle yeniden yazıldı: (A) jokey kararı +
      kulvar değişimi, (B) kulvar doluluğu + geçiş çözümü, (C) nihai
      performans puanı. Tüm 7 önceki FAZ 1 testi değişmeden geçmeye devam
      ediyor (geriye dönük uyumluluk korundu).
- [x] `domain/race/overtaking.ts` (yeni) — gerçek `overtake_probability`
      formülü, kulvar atama/değişimi (brief §21).
- [x] `domain/race/jockey-decisions.ts` (yeni) — brief §60 jokey AI karar
      ağacı, birebir öncelik sırasıyla.
- [x] `domain/race/sprint.ts` (yeni) — final sprint mekaniği.
- [x] `domain/race/fatigue.ts` (yeni) — segment-içi dinamik yorgunluk
      birikimi ve performans cezası (FAZ 1'in statik `preRaceFatigueFactor`
      ünden ayrı, brief §21).
- [x] `domain/race/race-explanation.ts` (yeni) — brief §85 "neden
      kazandım/kaybettim" açıklaması.
- [x] `domain/race/race-interpolation.ts` (yeni) — segment checkpoint'leri
      arası doğrusal interpolasyon; "Continuous simulation" ve Replay/Kamera
      ihtiyaçlarını, deterministik segment modelini bozmadan karşılar.
- [x] Foto-finiş (brief §25) için açık ikincil karşılaştırma (berabere
      kalma durumunda son segment performansı, sonra `horseId`) eklendi —
      determinism garantisi bu uç durumda da korunuyor.
- [x] `database/migrations/0014` — `race_entry_segments.blocked`/
      `jockey_decision` sütunları.
- [x] `docs/RACE_ENGINE.md` §6, §8, §9, §10 güncellendi (uygulandı
      notları); `docs/ALGORITHMS.md` §5-6'ya "Uygulama notu (FAZ 5)"
      eklendi.

**Bilinçli olarak bu oturuma dahil edilmeyenler:**

- NestJS controller/use-case/module wiring'i (`SimulateRaceUseCase`) —
  FAZ 1-4 ile aynı gerekçe.
- Cameras (kamera sistemi) ve 3D/görsel render — brief'te FAZ 5 başlığı
  altında listelense de bunlar `apps/web` + Three.js katmanına aittir;
  FAZ 6 "Web 3D/Görsel Sunum" kapsamına bilinçli olarak ertelendi.
- Replay için YENİ KOD YAZILMADI — mevcut determinism garantisi (§7)
  FAZ 5'in tüm yeni alanlarını (`lane`, `blocked`, `decision`,
  `explanations`) zaten otomatik olarak kapsıyor (bkz.
  `docs/RACE_ENGINE.md` §10 "FAZ 5 notu").

## FAZ 6 tamamlanma durumu (bu oturum)

FAZ 6 (Web 3D/Görsel Sunum), FAZ 1-5'ten temelde farklıdır: gerçek 3D at/
jokey modelleri, animasyonlar, ses ve VFX kod değil sanat/asset dosyasıdır
ve projede hiç yoktur. Proje sahibiyle görüşülüp **"basit şekillerle
iskelet kur"** kapsamı kararlaştırıldı (bkz. `apps/web/src/features/
race-viewer/README.md` "Kapsam kararı"):

- [x] `features/race-viewer/track-path.ts` (yeni) — pist geometrisi (saf
      matematik, "stadyum" şekli: iki düz kenar + iki viraj).
- [x] `features/race-viewer/timeline-playback.ts` (yeni) — `RaceTimeline`
      ara değerleme, canlı sıralama, oynatma saati ilerletme.
- [x] `features/race-viewer/camera-presets.ts` (yeni) — brief FAZ 5
      "Cameras" / `docs/GAME_DESIGN.md` §6'daki 4 kamera modu (Pist,
      Jokey, Son Düzlük, Fotofiniş).
- [x] `features/race-viewer/minimap-projection.ts` (yeni) — mini harita
      izdüşümü.
- [x] `features/race-viewer/RaceHud.tsx`, `RaceScene3D.tsx`,
      `RaceViewer.tsx` (yeni) — HUD, Three.js sahnesi (basit şekiller),
      oynatma orkestratörü; sahne `next/dynamic` + `ssr:false` ile lazy-load
      edilir (`docs/ARCHITECTURE.md` §7).
- [x] `apps/web/src/app/races/demo/page.tsx` (yeni) — Ana Sayfa'dan
      erişilebilir demo yarış ekranı.
- [x] `tools/generate-demo-race-timeline.ts` (yeni) — gerçek FAZ 5 Race
      Engine'ini sabit bir seed ile çalıştırıp demo verisini üretir
      (uydurma veri DEĞİL).
- [x] `apps/web/package.json` — `three`, `@react-three/fiber`,
      `@react-three/drei` bağımlılıkları eklendi (brief'in
      `docs/ARCHITECTURE.md` §5'te zaten öngördüğü teknoloji seçimi).
- [x] `apps/web/tsconfig.logic.json` (yeni) — `apps/api/tsconfig.
      domain.json`'a paralel, framework'ten bağımsız saf mantığın yerel
      `tsc` + gerçek testlerle (38 test) doğrulandığı dar kapsamlı
      tsconfig.

**Bilinçli olarak bu oturuma dahil edilmeyenler:**

- Gerçek 3D at/jokey modelleri, animasyonlar, seyirci (crowd), hava
  efektleri (VFX), ses/müzik — sanat varlığı gerektirir, kapsam dışı
  (bkz. README.md).
- NestJS wiring — `RaceViewer` şu an statik bir demo fixture'ından veri
  okuyor, gerçek `/races/{id}` API'sine bağlı değil (FAZ 1-5'teki tüm
  domain katmanlarıyla aynı, zaten bilinen kapsam dışı karar).
- **Doğrulama kısıtı** (bkz. `docs/ARCHITECTURE.md` §9 ve README.md):
  `three`/`@react-three/fiber`/`@react-three/drei` bu geliştirme
  ortamında kurulamadığından, JSX/Three.js içeren dosyalar (`RaceHud.tsx`,
  `RaceScene3D.tsx`, `RaceViewer.tsx`, demo sayfası) yerel olarak
  derlenip doğrulanamamıştır — gerçek doğrulama GitHub Actions CI'da
  olacaktır. Sadece framework'ten bağımsız 4 dosya (`track-path.ts`,
  `timeline-playback.ts`, `camera-presets.ts`, `minimap-projection.ts`)
  bu oturumda `tsc` + gerçek testlerle tam doğrulandı.

**CI hatası #4 (bu oturum) ve düzeltmesi:** yukarıdaki doğrulama kısıtının
öngördüğü gibi, ilk Faz 6 gönderiminde GitHub Actions CI gerçekten bir hata
buldu: `apps/web/tsconfig.json`, `apps/api` ile paylaşılan
`tsconfig.base.json`'dan sadece `"ES2022"` kütüphanesini miras alıyordu
(backend'de DOM olmamalı) — ama `RaceViewer.tsx` (`requestAnimationFrame`/
`cancelAnimationFrame`) ve `RaceHud.tsx` (`HTMLInputElement.value`) gibi
tarayıcı API'leri kullanan FAZ 6 dosyaları için bu yetersizdi. Düzeltme:
`apps/web/tsconfig.json`'a `"lib": ["ES2022", "DOM", "DOM.Iterable"]`
override'ı eklendi (sadece `apps/web`'i etkiler, `apps/api`/domain
katmanı DOM'suz kalmaya devam eder). Önemli olan: bu HATA, tam olarak
öngörülen ve belgelenen kısıt (bu ortamda JSX/Three.js dosyaları yerel
doğrulanamıyor) yüzünden CI'da ortaya çıktı — kodun geri kalanında
(Three.js/`@react-three/fiber` API kullanımı dahil) başka HİÇBİR hata
bulunmadı, sadece bu tek tsconfig eksikliği.

## Açık kararlar (proje sahibinin onayı bekleniyor)

Bkz. `ARCHITECTURE.md` §10 için tam liste ve gerekçeler. Özet:

1. ✅ ~~Kimlik doğrulama sağlayıcısı~~ — **KARAR VERİLDİ: Google/Apple Sign-In.**
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

## GitHub deposu

✅ Tamamlandı — kod `github.com/arvasiist/atsevdalisi` deposuna proje
sahibi tarafından GitHub Desktop üzerinden push edildi (FAZ 0 sonunda).
Bundan sonraki her teslimat aynı yöntemle (yerel klasördeki dosyaların
güncellenmesi → GitHub Desktop'ta Commit → Push) depoya yansıtılacaktır.
