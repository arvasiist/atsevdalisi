# ROADMAP.md — Yol Haritası

> Kaynak: `docs/PROJECT_BRIEF.md` §5 (Fazlar), §73 (İlk geliştirilecek
> modüller), §74 (İlk prototip hedefi). Sıra **rastgele değiştirilemez**
> (brief §73 başlığı). Web stack terimleriyle güncellenmiştir; mantık ve
> sıra birebir korunmuştur.

## Faz durumu

| Faz | Adı | Kapsam | Durum |
|---|---|---|---|
| **0** | Teknik keşif ve planlama | Repo, mimari, dokümantasyon, DB migration altyapısı, test altyapısı | ✅ Tamamlandı |
| 1 | Core | Player, Auth, Economy, Horse, Stable, Training, Care, Basic Race Engine, Race Result, Progression | 🟡 Domain katmanı tamam; **Player alt-modülü gerçek veritabanına bağlandı ve CI'da uçtan uca DOĞRULANDI** (bkz. "FAZ 1 wiring" bölümü — GitHub Actions run 34721911139, tam yeşil), geri kalanı wiring bekliyor |
| 2 | Management | Horse Market, Buy/Sell, Vet, Farrier, Nutrition, Jockey, Staff, Stable capacity, Costs | 🟡 Domain katmanı tamam, wiring bekliyor |
| 3 | Genetics | Pedigree, Mare/Stallion, Genetic traits, Inheritance, Mutation, Foal, Growth, Bloodline | 🟡 Domain katmanı tamam, wiring bekliyor |
| 4 | Farm | Stable upgrade, Paddock, Training track, Vet center, Breeding center, Staff facilities | 🟡 Domain katmanı tamam, wiring bekliyor |
| 5 | Advanced Race Engine | Continuous simulation, Pace, Position, Overtaking, Blocking, Turns, Lane changes, Sprint, Fatigue, Jockey decisions, Photo finish, Replay, Cameras | 🟡 Domain katmanı tamam, wiring bekliyor |
| 6 | Web 3D/Görsel Sunum | Race track, Horse models, Jockey models, Animations, Camera system, UI, VFX, Audio, Crowd, Weather | 🟡 Basit şekillerle iskelet tamam, gerçek 3D asset'ler bekliyor |
| 7 | Online | Matchmaking, PvP, Race rooms, Leaderboards, Clubs, Tournaments, Seasons, Anti-cheat, Server-authoritative simulation | 🟡 Domain katmanı tamam, wiring bekliyor |

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
21. Online                        🟡 FAZ 7 — domain katmanı (matchmaking, Elo, anti-cheat, race room) tamam
22. Leaderboard                   🟡 FAZ 7 — domain katmanı (RankingScore, sıralama) tamam
23. Club                          🟡 FAZ 7 — domain katmanı (üyelik, seviye/puan) tamam
24. Tournament                    🟡 FAZ 7 — domain katmanı (uygunluk, kura, ödül dağıtımı) tamam
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

**Doğrulama (bu oturum):** düzeltme gönderildikten sonra GitHub Actions CI
run'ı (commit `c47e85c`, "fix(build): apps/web tsconfig.json'a DOM lib
eklendi") çalışma detay sayfasından **Success** olarak doğrulandı (1m 47s,
tek uyarılar bilinen/engelleyici olmayan "no magic number" lint notları ve
Node 20→24 deprecation notu). Böylece FAZ 6'nın basit-şekillerle iskelet
kapsamı (pist/kamera/oynatma mantığı + Three.js sahne + demo ekranı) uçtan
uca yeşil olarak doğrulanmıştır; kalan kapsam dışı kalemler (gerçek 3D
asset'ler, NestJS wiring) yukarıda listelenmiştir.

## FAZ 7 tamamlanma durumu (bu oturum)

FAZ 7 (Online), önceki tüm fazlarla (1-5) AYNI desende ele alınmıştır: brief
§41-44 ve §68-69'daki kuralların TAMAMI, framework'ten bağımsız saf
TypeScript domain fonksiyonları olarak yazılmış ve yerel `tsc` + gerçek
testlerle doğrulanmıştır (bkz. FAZ 6'nın aksine — bu fazda üçüncü parti bir
kütüphane/framework bağımlılığı YOKTUR, bu yüzden FAZ 6'daki "sadece CI'da
doğrulanabilir" kısıtı bu fazda GEÇERLİ DEĞİLDİR; tüm kod bu oturumda tam
olarak doğrulanmıştır).

**Eklenen sistemler:**

- **Matchmaking & PvP** (`domain/online/{elo,matchmaking}.ts`) — brief §43
  "Elo benzeri sistem", bekleme süresine göre genişleyen reyting aralığı ile
  adil eşleştirme.
- **Anti-cheat & Race Room** (`domain/online/{anti-cheat,race-room}.ts`) —
  brief §42 "backend kendi DB değerini kullanmalıdır" ilkesi (allowlist +
  gözlemlenebilir ihlal sinyali), brief §41 "participant validation" ve
  "seed" üretimi. **Yeni bir simülasyon motoru YAZILMADI** — FAZ 5'in
  `simulateRace`'i aynen bir "oda" bağlamında kullanılır.
- **Sıralama** (`domain/ranking/{ranking-score,leaderboard}.ts`) — brief
  §43 RankingScore formülü, 7 sıralama türü (global/ülke/arkadaş/kulüp/
  sezon/haftalık/aylık) için tek bir genel sıralama/rank atama motoru.
- **Kulüp** (`domain/club/club.ts`) — brief §44: üyelik (katılma/ayrılma/
  atma), rol hiyerarşisi (leader/officer/member), puan → seviye eşik
  tablosu (`domain/stable`'daki kapasite eşik deseniyle aynı).
- **Turnuva** (`domain/tournament/tournament.ts`) — brief §35/§68:
  uygunluk kontrolü (seviye/giriş ücreti), reytinge göre deterministik kura
  (`domain/online/matchmaking.ts`'teki reytingi yeniden kullanır), ödül
  havuzu dağıtımı.
- **Sezon** (`domain/season/season.ts`) — brief §69: sezon durumu
  (upcoming/active/ended), "sadece sezon skorları resetlenir" kuralının
  `PlayerSeasonState`'in `Player`den TAMAMEN ayrı bir tip olmasıyla TİP
  SEVİYESİNDE garanti edilmesi.

**Yeni config:** `config/online.config.json` (`OnlineConfig` — `elo`,
`matchmaking`, `ranking`, `club`, `tournament`, `season` bölümleri).

**Yeni shared-types:** `packages/shared-types/src/online.ts` (`Club`,
`ClubMembership`, `LeaderboardEntry`/`RankedLeaderboardEntry`, `Season`,
`PlayerSeasonState`, `Tournament`, `TournamentParticipant`,
`MatchmakingTicket`, `PlayerRating`, `PvpMatch`).

**Doğrulama (bu oturum):** `apps/api/tsconfig.domain.json` ile TÜM domain
katmanı (FAZ 1-7 dahil) `tsc --noEmit` temiz derlendi;
`packages/shared-types` ve `packages/game-config` paketleri kendi
`tsconfig.json`'larıyla ayrıca temiz derlendi (yeni `online.ts`/
`OnlineConfig` dahil). Geçici bir `vitest` shim'i + test runner ile (bkz.
docs/ARCHITECTURE.md §9, bu araçlar commit edilmez) TÜM proje test seti
(FAZ 1-7, 294 test) çalıştırıldı — **294/294 geçti**, hiçbir regresyon
yok. Bu, FAZ 6'dan farklı olarak GitHub CI'ı beklemeye gerek kalmadan tam
bir yerel doğrulama sinyalidir; CI yine de nihai/bağımsız doğrulama
kaynağı olarak kalır.

**Kapsam dışı (bilinçli):** gerçek WebSocket/oda yönetimi altyapısı,
NestJS controller/route wiring'i (brief §41-44 ile tutarlı uç nokta
taslakları `docs/API.md` §9'a eklenmiştir), kulüp sohbeti/yarışları/
görevleri (içerik sistemi), gerçek zamanlı eşleştirme kuyruğu yönetimi
(DB/Redis) — bunların TÜMÜ, FAZ 1-6'daki "domain hazır, wiring bekliyor"
deseniyle birebir tutarlıdır.

**Doğrulama (bu oturum, CI):** GitHub Actions CI run'ı (commit `f7c3846`,
"FAZ 7: Online (eşleştirme, sıralama, kulüp, turnuva, sezon)") çalışma
detay sayfasından **Success** olarak doğrulandı (1m 27s, tek uyarılar
bilinen/engelleyici olmayan "no magic number" lint notları ve Node 20→24
deprecation notu — İLK denemede, hiçbir düzeltme gerekmeden). Bu, yukarıdaki
yerel 294/294 test sonucunu bağımsız olarak teyit eder ve yol haritasındaki
8 fazın (Faz 0-7) TÜM domain/oyun kuralı katmanının tamamlandığını
doğrular.

## FAZ 1 wiring — İlk uçtan uca dilim (bu oturum)

Faz 0-7'nin tümü "domain katmanı tamam, wiring bekliyor" seviyesine
ulaştıktan sonra proje sahibine ("Sen ne önerirsin?") sorulmuş ve şu yol
onaylanmıştır: canlıya alma (hosting hesapları, bkz. `ARCHITECTURE.md`
§8) işini ERTELEYİP, önce en küçük "uçtan uca dilim"i — Player kaydı +
Ana Sayfa'daki bir demo widget'ı — GERÇEK bir PostgreSQL'e bağlayıp bunu
GitHub CI üzerinde bağımsız olarak doğrulamak. Bu bölüm o dilimi
belgeler.

**Neden Player ve neden bu kadar küçük:** Player, tüm diğer modüllerin
(Economy, Horse, Race, ...) sahiplik ilişkisi kurduğu kök varlıktır; en
az bağımlılığa sahip olduğu için "wiring deseni"nin (Controller →
Use-Case → Repository → Postgres, artı domain hata → HTTP eşlemesi) ilk
kez KANITLANMASI için en düşük riskli modüldür. Kapsam kasıtlı olarak
dar tutulmuştur: gerçek Google/Apple OAuth (brief §7) DEĞİL, geçici bir
doğrudan kayıt uç noktası (yalnızca kullanıcı adı + görünen ad);
`RegisterPlayerUseCase`'in kendisi OAuth eklendiğinde DEĞİŞMEYECEK,
yalnızca onu çağıran controller/DTO değişecektir (bkz. o dosyanın
doc-comment'i). Redis de bilinçli olarak bağlanmadı — bu ilk dilimde
cache/idempotency gerekmiyor.

**Eklenen backend parçaları:**
- `apps/api/src/application/ports/player.repository.ts` — `PlayerRepository`
  arayüzü + `PLAYER_REPOSITORY` DI token'ı (port/adapter deseni).
- `apps/api/src/application/use-cases/{register-player,get-player}.use-case.ts`
  — application katmanı, domain'i (`createNewPlayer`,
  `assertUsernameAvailable`) ve repository portunu birleştirir.
- `apps/api/src/domain/player/player.ts` — yeni `assertUsernameAvailable`
  saf fonksiyonu (FAZ 7'deki `joinClub`'ın `playerHasAnyClubMembership`
  deseniyle birebir tutarlı: DB sorgusunu KENDİSİ yapmaz, çağıranın
  önceden getirdiği bir boolean'ı değerlendirir).
- `apps/api/src/domain/player/errors.ts` — `UsernameAlreadyTakenError`,
  `PlayerNotFoundError`.
- `apps/api/src/infrastructure/player/postgres-player.repository.ts` —
  `PlayerRepository`'nin gerçek `pg` implementasyonu (`players` tablosu).
  BIGINT (`xp`/`money`/`gems`) sütunları `pg`'den string olarak gelir;
  satır eşleyicisi bunları bilinçli olarak `Number(...)`'a çevirir.
- `apps/api/src/api/player/{player.controller.ts,player.module.ts,dto/register-player.dto.ts}`
  — `POST /players`, `GET /players/:id`.
- `apps/api/src/api/middleware/http-exception.filter.ts` — genişletilen
  `DOMAIN_ERROR_MAP`: domain hata sınıfı → (HTTP durumu, hata kodu).
  Yeni bir modül bağlandıkça buraya bir satır eklenir; domain katmanı
  HTTP'yi hiçbir zaman bilmez (`ARCHITECTURE.md` §4).
- `apps/api/src/app.module.ts` — `DatabaseModule` + `PlayerModule` bağlandı.
- `packages/shared-types/src/error-codes.ts` — `USERNAME_ALREADY_TAKEN`,
  `PLAYER_NOT_FOUND`.

**Eklenen web parçası:** `apps/web/src/features/player-demo/PlayerDemoWidget.tsx`
— Ana Sayfa'nın (`apps/web/src/app/page.tsx`) sonuna eklenen, bilinçli
olarak İSTEMCİ (`'use client'`) bir widget. "Demo oyuncu oluştur"
düğmesi tarayıcıdan gerçek `POST /players` isteği atar ve dönen
seviye/XP/para/gem değerlerini gösterir. Gerçek Ana Sayfa TASARIMI
(`GAME_DESIGN.md` §4) DEĞİLDİR — yalnızca zincirin uçtan uca çalıştığını
kanıtlamak içindir. İstemci bileşeni seçilmesinin nedeni: bir sunucu
bileşeni build/prerender sırasında veri çekmeye çalışsaydı, CI'daki
`next build` adımı canlı bir API olmadığı için başarısız olurdu.

**Yeni CI yeteneği:** `.github/workflows/ci.yml`'e bir `postgres:16-alpine`
"service container" eklendi (job süresince ayakta durur, iş bitince
otomatik silinir) ve "Typecheck" ile "Test" arasına `npm run migrate`
adımı eklendi. Bu, projede İLK KEZ gerçek bir veritabanına karşı
uçtan uca (e2e) test çalıştırma imkanı sağlar.

**Yeni e2e test:** `apps/api/test/api/player.e2e-spec.ts` — gerçek
PostgreSQL gerektirir, bu yüzden bu geliştirme ortamında ÇALIŞTIRILAMAZ
(`ARCHITECTURE.md` §9); yalnızca CI'da doğrulanır.

**Bu oturumda bulunan ve düzeltilen gerçek bir kusur:** Kök
`vitest.config.ts`'in `include` deseni yalnızca `*.spec.ts` ile
eşleşiyordu — `*.e2e-spec.ts` İLE DEĞİL (dosya adının "spec.ts"den hemen
önceki karakteri bir nokta değil, tire). Bu, projenin FAZ 0'dan beri var
olan tek e2e testinin (`health.e2e-spec.ts`) hiçbir CI çalıştırmasında
GERÇEKTEN hiç koşmadığı anlamına geliyordu — sessiz, fark edilmemiş bir
test-altyapısı boşluğu. `apps/*/test/**/*.e2e-spec.ts` deseni eklenerek
düzeltildi; ayrıca `apps/api` kendi cwd-yerel `vitest.config.ts`'ine
kavuşturuldu (npm workspace script'leri her paketi kendi dizininde
çalıştırdığı için kök config otomatik bulunmuyordu).

**Doğrulama (bu oturum, yerel):** `apps/api/tsconfig.domain.json` ile
domain katmanı (yeni `assertUsernameAvailable`/`UsernameAlreadyTakenError`/
`PlayerNotFoundError` dahil) `tsc --noEmit --ignoreDeprecations 6.0` ile
temiz derlendi. Geçici bir `vitest` shim'i + test runner ile (bu araçlar
commit edilmedi) framework'ten bağımsız TÜM test seti (296 test: önceki
294 + yeni `assertUsernameAvailable` için 2 test) çalıştırıldı —
**296/296 geçti**. NestJS/pg gerektiren dosyalar (controller, repository,
`player.e2e-spec.ts`) bu ortamda kurulu olmayan paketleri import ettiği
için yerel olarak doğrulanamaz (`ARCHITECTURE.md` §9, FAZ 6'daki
Three.js/React dosyalarıyla AYNI kabul edilmiş risk deseni) — bunlar
GitHub CI'ın yeni Postgres servisiyle doğrulanacaktır.

**Kapsam dışı (bilinçli, sonraki adımlar):** gerçek Google/Apple OAuth,
Redis wiring, Economy/Horse/Stable/Training/Care/Race Engine modüllerinin
bağlanması (brief §73 sırasıyla devam edecek), canlı barındırma/deploy
(Vercel/Railway/Supabase — proje sahibinin dış hesap açması gereken bir
adım, ayrı ve daha sonraki bir onayla başlatılacaktır).

**CI hatası bulundu ve düzeltildi (bu oturum):** İlk gönderilen sürüm
(commit `d90e1ef`) GitHub CI'ın "Lint" adımında başarısız oldu — proje
tahminimin aksine bu, gerçek veritabanı/Postgres tarafıyla İLGİLİ
DEĞİLDİ (o adımlara hiç ulaşılmadı, Lint adımı zaten en baştan durdu).
Kök neden: `apps/api/src/api/player/dto/register-player.dto.ts`, class-
validator'ın `@Length(3, 20)` / `@Length(2, 30)` decorator'larında sabit
sayıları DOĞRUDAN yazıyordu — bu, projenin `apps/api/src` genelinde bir
decorator çağrısı içinde sabit sayı kullanılan TEK yeriydi (yeni bir kod
şekli). ESLint'in `no-magic-numbers` kuralı bunları uyarı (warning)
olarak zaten doğru raporluyordu, ancak bu özel gönderimde `Lint` adımı
yine de sıfırdan farklı bir çıkış koduyla (1) durdu; ham log dosyası bu
ortamdan (kimlik doğrulama gerektirdiği için) okunamadığı için tam kesin
neden GÖRÜLEMEDİ, ama en makul ve zaten kod kalitesi açısından da doğru
olan düzeltme uygulandı: bu dört sınır değeri (`3`, `20`, `2`, `30`)
`domain/player/validation.ts`'te zaten var olan
`USERNAME_MIN_LENGTH`/`USERNAME_MAX_LENGTH`/`DISPLAY_NAME_MIN_LENGTH`/
`DISPLAY_NAME_MAX_LENGTH` sabitlerinden dışa aktarılıp DTO'da tekrar
sabit sayı yazmak yerine oradan içe aktarıldı (tek doğruluk kaynağı,
docs/CODING_CONVENTIONS.md #6/7 ile de tutarlı). Düzeltme sonrası yerel
`tsc` (`apps/api/tsconfig.domain.json`) temiz derlendi ve framework'ten
bağımsız tüm test seti yine **296/296** geçti.

**Gerçek kök neden bulundu (ikinci CI hatası, bu oturum):** yukarıdaki
düzeltme GitHub'a gönderildikten sonra CI **AYNI şekilde** "Lint"
adımında başarısız oldu — bu sefer raporlanan uyarılar `market.ts`/
`age-curve.ts`/`care.ts`/`breeding.ts` idi, yani FAZ 7'nin BAŞARILI
çalışmasındakiyle BİREBİR AYNI uyarı kümesi; `register-player.dto.ts`'in
artık hiçbir sabit sayı içermediği doğrudan pushlanan dosya içeriğinden
teyit edildi. Bu, sorunun kod İÇERİĞİYLE alakasız olduğunu kanıtladı.
Gerçek kök neden: bu depo hiçbir zaman bir `package-lock.json` dosyası
üretmedi (bkz. §9 — npm registry kısıtı yüzünden bu ortamda `npm
install` hiç çalıştırılamadı); `package.json`'daki
`@typescript-eslint/eslint-plugin`/`parser` `^7.0.0` ile belirtilmişti,
yani her CI çalıştırmasında `npm install` npm registry'den O ANDA
mevcut olan EN YENİ uyumlu 7.x.x sürümünü çekiyordu. npm registry'de
bu paketin en güncel sürümünün artık **8.70.0** olduğu (7.x hattının
tamamen geride kaldığı) doğrulandı — 7.x hattı için farklı zamanlarda
farklı yama sürümleri çekilmiş olması, aynı kodun bazen geçip bazen
(uyarı içeriği aynı kalsa bile) `exit code 1` ile başarısız olmasını
açıklıyor. **Düzeltme:** `package.json`'da
`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` ve
`eslint` artık `^` olmadan, TAM sürüm numarasıyla sabitlendi
(`7.18.0`, `7.18.0`, `8.57.0` — 7.x hattının bilinen son, kararlı
sürümleri, npm registry'den peer-dependency uyumluluğu doğrulanarak
seçildi). Bu, projenin kendi ARCHITECTURE.md §9 notunda zaten öngörülen
"bir kez lock dosyası üretilip commit edilirse `npm ci`'ya geçilebilir"
adımının küçük bir ön-versiyonu: tam sürüm sabitleme, lock dosyası kadar
güçlü olmasa da, CI'ın HER seferinde AYNI paket sürümleriyle
çalışmasını garanti eder.

**GERÇEK kök neden nihayet bulundu (üçüncü CI hatası, bu oturum):**
Yukarıdaki sürüm sabitlemesi de CI'ı düzeltmedi — üçüncü deneme AYNI
şekilde başarısız oldu. Bu, hem "magic number" hem "sürüm sabitleme"
teorilerinin YANLIŞ olduğunu kanıtladı. Ham CI günlüğü bu ortamdan
(kimlik doğrulama gerektirdiği için) okunamadığından, `.github/workflows/
ci.yml`'e GEÇİCİ bir teşhis adımı eklendi (eslint çıktısının her satırını
ayrı bir `::error::` iş akışı komutu olarak yazdırıp GitHub'ın annotation
panelinde görünür kılan bir adım — bu panel bu oturumdan güvenilir
şekilde okunabiliyordu, ham günlüğün aksine). Bu, gizli hatayı nihayet
ortaya çıkardı: **`apps/api/src/api/middleware/http-exception.filter.ts`**
içinde `DOMAIN_ERROR_MAP`'in tipi `Map<Function, {...}>` olarak
yazılmıştı. ESLint'in `plugin:@typescript-eslint/recommended` seti,
`Function` tipinin (herhangi bir çağrılabilir değeri kabul ettiği,
`new` ile çağrılmadan çalışma zamanında hata fırlatabilecek sınıf
bildirimlerini bile kabul ettiği ve hiçbir tip güvenliği sağlamadığı
için) **HATA (error, uyarı değil)** olarak yasakladığı bir kuralı
içeriyor — bu, projenin diğer tüm "no magic number" UYARILARINDAN
tamamen farklı bir kural ve ciddiyet seviyesindeydi, bu yüzden
annotation panelinde bir "Show more" katlanmış grubunun ARKASINA
gizlenmişti ve önceki taramalarda hep kaçırıldı. Düzeltme: `Function`
yerine dar, doğru bir tip — `type ErrorClassConstructor = new
(...args: never[]) => Error` — tanımlanıp `DOMAIN_ERROR_MAP`'in tipi
buna çevrildi (zaten dosyada `instanceof` kontrolü için kullanılan
cast'le AYNI tip — artık ayrı bir cast'e de gerek kalmadı). Bu
değişiklik izole bir `tsc --strict` kontrolüyle (aynı desen, gerçek
hata sınıflarıyla) doğrulandı, domain katmanı `tsc`'si temiz kaldı ve
framework'ten bağımsız test seti yine **296/296** geçti. Geçici teşhis
adımı kaldırılıp `Lint` adımı normal `npm run lint` çağrısına
döndürüldü. Sürüm sabitleme gerçek nedeni ÇÖZMEDİ ama zararsız, iyi bir
hijyen adımı olduğu için korundu.

**İkinci gizli hata (dördüncü CI hatası, bu oturum):** `Function` tipi
düzeltmesi "Lint" adımını nihayet geçirdi — ama bu kez CI, "Test"
adımında yeni bir hatayla durdu: `ReferenceError: describe is not
defined`, hem `health.e2e-spec.ts`'te hem yeni `player.e2e-spec.ts`'te.
Kök neden: bu iki dosya `describe`/`it`/`expect`/`beforeAll`/`afterAll`
GLOBAL fonksiyonlarına güveniyordu, ama proje kök `vitest.config.ts`'i
`globals: false` kullanıyor (projedeki TÜM diğer spec dosyaları bunları
`vitest`'ten AÇIKÇA içe aktarıyor). `health.e2e-spec.ts` bu hatayı
FAZ 0'dan beri taşıyordu ama bu oturumdaki glob-eşleşme düzeltmesinden
ÖNCE hiç çalıştırılmadığı için fark edilmemişti — bu, aynı kök nedenin
(hiç koşmamış bir dosya) ortaya çıkardığı İKİNCİ gizli hata. Düzeltme:
her iki dosyaya da `import { afterAll, beforeAll, describe, expect, it }
from 'vitest';` eklendi.

**Üçüncü gizli hata (beşinci CI hatası, bu oturum) — nihai kök neden:**
`vitest` içe aktarma düzeltmesiyle CI ilk kez "Lint" → "Typecheck" →
"Run database migrations" adımlarının HEPSİNİ geçti (bu projede bir ilk:
gerçek bir PostgreSQL migration'ı CI'da başarıyla çalıştı) — ama "Test"
adımında `player.e2e-spec.ts`'in TÜM istekleri beklenen 201/404/400/409
yerine **HTTP 500** döndü. `HttpExceptionFilter`'ın son catch-all dalı,
gerçek hatayı bilinçli olarak istemciye SIZDIRMIYOR (bkz.
`docs/SECURITY.md`) — doğru davranış, ama bu yüzden test asserisyonları
gerçek nedeni göstermedi. "Lint" teşhisinde işe yarayan AYNI teknik
(`::error::` ile satır satır yeniden yazdırma, bu kez `TESTDEBUG:`
öneki ve çıktıyı `error|exception|beklenmedik|at /home/runner|fail`
ile filtreleyen bir `grep` ile — 296+ geçen test satırıyla paneli
doldurmamak için) "Test" adımına uygulandı. Bu, gerçek hatayı ortaya
çıkardı: **`TypeError: Cannot read properties of undefined (reading
'execute')`**.

Kök neden araştırması `apps/api/tsconfig.json`'da
`experimentalDecorators`/`emitDecoratorMetadata`'ın İKİSİNİN de doğru
şekilde `true` olduğunu doğruladı — bu, NestJS'in tip tabanlı (örtük)
bağımlılık enjeksiyonunun `undefined` dönmesinin EN YAYGIN nedenini
ekarte etti. Gerçek neden daha inceydi: bu ayarlar `npm run build`'in
kullandığı GERÇEK `tsc` derleyicisi için doğrudur, ama `apps/api/test/
api/player.e2e-spec.ts` `vitest` altında çalışır ve **Vitest,
dosyaları TypeScript derleyicisi yerine `esbuild` ile dönüştürür**.
`esbuild` hızlı, tip bilgisinden bağımsız (type-unaware) bir
dönüştürücüdür — dekoratörleri (`experimentalDecorators`) destekler,
ama `emitDecoratorMetadata`'nın gerektirdiği `design:paramtypes`
üst verisini ASLA yaymaz, çünkü bu üst veri parametre TİPLERİNİN tam
tip çözümlemesini (type-checking) gerektirir ve `esbuild` bunu bilinçli
olarak yapmaz (performans için). Sonuç: `PlayerController`'ın
kurucusundaki `RegisterPlayerUseCase`/`GetPlayerUseCase` parametreleri
(ve `RegisterPlayerUseCase`'in kendi kurucusundaki `AppConfigService`
parametresi) yalnızca TypeScript tipine göre — açık bir `@Inject()`
token'ı OLMADAN — enjekte ediliyordu; bu ikisi gerçek `tsc` derlemesiyle
çalışırken `vitest`/`esbuild` altında `undefined` kalıyor, `.execute(...)`
çağrısı da bu yüzden patlıyordu.

Düzeltme: projede zaten `PLAYER_REPOSITORY`/`PG_POOL` için yapıldığı gibi,
her iki yerde de açık `@Inject()` token'ı eklendi
(`@Inject(RegisterPlayerUseCase)`, `@Inject(GetPlayerUseCase)`,
`@Inject(AppConfigService)`) — bu, hem `tsc` hem `esbuild` altında AYNI
şekilde çalışır çünkü artık çalışma zamanı tipine değil, açıkça
belirtilen token'a bağlıdır. Kod tabanının geri kalanı tarandı
(`constructor(` içeren tüm dosyalar) — bu ikisi DIŞINDA hiçbir NestJS
sağlayıcısı örtük tip tabanlı enjeksiyona güvenmiyordu, yani bu düzeltme
kapsamlıydı. Geçici `TESTDEBUG:` teşhis adımı kaldırılıp "Test" adımı
normal `npm run test` çağrısına döndürüldü. Yerel doğrulama: framework'ten
bağımsız test seti (artık 334 test — bu oturumda başka domain testleri de
eklenmiş) yine tam geçti; `@nestjs/*` paketleri bu ortamda kurulu
olmadığından (`docs/ARCHITECTURE.md` §9) bu DI düzeltmesinin kendisi
yalnızca CI'da (gerçek Postgres + gerçek `vitest`/`esbuild` ile) uçtan uca
doğrulanabilir — proje için kabul edilen risktir.

**✅ DOĞRULANDI — CI baştan sona yeşil (GitHub Actions run
[34721911139](https://github.com/arvasiist/atsevdalisi/actions/runs/34721911139),
"Faz 1 wiring: gerçek kök neden düzeltildi" commit'i, 1dk 57sn):** Bu,
projenin Player-wiring dilimi için SEKİZİNCİ CI denemesiydi ve İLK kez
`build-and-test` işinin TAMAMI (Checkout → Install → Lint → Typecheck →
Run database migrations → Test → Build) tek bir kesinti olmadan geçti.
Annotation panelinde yalnızca daha önceden bilinen/zararsız uyarılar var
(Node.js 20 kullanım dışı bırakma uyarısı, birkaç dosyada mevcut "no
magic number" uyarıları) — hiçbir `::error::` yok. Bu, `player.e2e-spec.ts`'in
GERÇEK bir PostgreSQL'e karşı (kayıt, aynı kullanıcı adıyla ikinci kayıt
denemesi, geçersiz format, id ile getirme, olmayan id, geçersiz UUID —
6 senaryo) başarıyla çalıştığını ve tüm katmanların (API → Application →
Domain, Infrastructure → Domain) doğru bağlandığını kanıtlar. FAZ 1
wiring'in "ilk uçtan uca dilim" hedefi tamamlanmıştır.

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
