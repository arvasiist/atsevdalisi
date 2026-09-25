# features/race-viewer

FAZ 6 (Görsel Sunum) — brief §22-25, §59-60'ın 3D sunum kısmı,
`docs/GAME_DESIGN.md` §6 (Yarış ekranı). Bu modül, FAZ 5'te tamamlanan
Race Engine'in (`apps/api/src/domain/race`) ürettiği `RaceTimeline`'ı
Three.js ile oynatan **izole** bir katmandır — `docs/RACE_ENGINE.md` §1
ilkesi gereği hiçbir simülasyon mantığı içermez, sadece zaten hesaplanmış
sonucu render eder.

## Kapsam kararı (bu oturum, proje sahibinin onayıyla)

Faz 6, önceki fazlardan (1-5) temelde farklıdır: gerçek 3D at/jokey
modelleri, animasyonlar, ses ve görsel efektler **kod değil, sanat/asset
dosyalarıdır** ve projede hiç yoktur. Proje sahibiyle görüşülüp şu kapsam
kararlaştırıldı: **"basit şekillerle iskelet kur"** — gerçek modeller
yerine basit geometrik şekillerle (kapsül gövde + küre "jokey" başı)
çalışan, kamera sistemi ve FAZ 5 sonucunu birebir takip eden bir Three.js
sahnesi + temel UI.

### Bu oturumda tamamlananlar

- **Pist geometrisi** (`track-path.ts`) — saf matematik, bir "stadyum"
  (iki düz kenar + iki yarım daire viraj) şekli ve mesafe→(x,z,heading)
  dönüşümü.
- **Oynatma mantığı** (`timeline-playback.ts`) — `RaceTimeline` segment
  kontrol noktaları arasında lineer ara değerleme (`apps/api/src/domain/
  race/race-interpolation.ts`'in KASITLI bir kopyası — `apps/web`,
  `apps/api/src/domain/*`'a bağımlı OLAMAZ, aynı gerekçe
  `packages/shared-types/src/race.ts`'teki `RaceJockeyDecision` tekrarı
  için de geçerlidir), canlı sıralama, oynatma saati ilerletme.
- **Kamera sistemi** (`camera-presets.ts`) — brief FAZ 5 "Cameras" /
  `docs/GAME_DESIGN.md` §6'daki 4 kamera modu: Pist Kamerası, Jokey
  Kamerası, Son Düzlük Kamerası, Fotofiniş. Saf fonksiyonlar; gerçek
  kamera hareketini `RaceScene3D.tsx`'teki `CameraRig` uygular.
  Fotofiniş ve son düzlük kameraları burada YER TUTUCUDUR: gerçek pist
  boyutları/perspektif ayarları, gerçek 3D pist modeli eklendiğinde
  ince ayar gerektirebilir.
- **Mini harita izdüşümü** (`minimap-projection.ts`) — pist koordinatlarını
  SVG mini haritasının 0-100 yüzde uzayına ölçekler.
- **HUD** (`RaceHud.tsx`) — sıralama paneli, mini harita, kamera seçim
  butonları, oynat/duraklat + hız (1×/2×/4×) + saat çubuğu. Three.js
  içermez (düz React/CSS).
- **3D sahne** (`RaceScene3D.tsx`) — Three.js/`@react-three/fiber` Canvas:
  basit şekillerle at/jokey temsili, döşeme (tile) tabanlı pist yüzeyi,
  temel aydınlatma, `CameraRig` ile yumuşak kamera geçişleri.
- **Orkestratör** (`RaceViewer.tsx`) — oynatma saatini `requestAnimationFrame`
  ile ilerletir, sahneyi `next/dynamic` + `ssr:false` ile lazy-load eder
  (`docs/ARCHITECTURE.md` §7 "Three.js sahnesi sadece yarış ekranına
  girildiğinde yüklenir").
- **Demo verisi** (`fixtures/demo-race-timeline.json`) — gerçek Race
  Engine'in (`tools/generate-demo-race-timeline.ts` ile) 5 at, sabit seed
  kullanılarak ürettiği GERÇEK bir `RaceTimeline` — uydurma/elle yazılmış
  veri DEĞİLDİR.
- **Demo sayfa** (`apps/web/src/app/races/demo/page.tsx`) — Ana Sayfa'daki
  "Web 3D Sunum" satırından erişilebilir.

### FAZ 4 (kalite kademeleri) — ilk dilim (bu turda EKLENDİ)

Master Plan §46 "3D PERFORMANCE": "Mobile: Low/Medium/High. Desktop:
Medium/High/Ultra." Bu dilim, `quality-tier.ts`'in saf sınıflandırma/
ayar mantığını (`classifyQualityTier`/`getQualityTierRenderSettings`,
`apps/web/tsconfig.logic.json`'a dahil, bu sandbox'ta GERÇEKTEN `tsc`+
`tsx` ile doğrulandı) ve `RaceScene3D.tsx`'teki (`detectQualityTier`)
tarayıcıya-özgü algılamayı ekledi — Faz 1'de sabit kodlanmış Environment/
Bloom/SSAO/2048px gölgeler artık cihaza göre kademelenir: 'low' hepsini
kapatır, 'medium' yalnızca Environment+gölgeleri açar, 'high' Bloom'u da
ekler, 'ultra' (yüksek çekirdekli masaüstü — bu değişiklikten ÖNCEKİ
sabit davranışla BİREBİR aynı) hepsini açar. `RaceScene3DProps`'a
opsiyonel `qualityTierOverride` eklendi (varsayılan: otomatik algılama).

**Bu dilimde YAPILMAYAN** (§46'nın geri kalanı, bilinçli olarak):
LOD ve texture compression (gerçek 3D model/doku YOK — Faz 3'ün asset
kararını bekliyor), animation pooling (henüz bir animasyon sistemi YOK),
gerçek 4/8/12/16 at FPS benchmark'ı (bu sandbox'ta gerçek tarayıcı/GPU
YOK, ölçülemez — manuel QA proje sahibine bırakıldı), crowd/VFX (asset
gerektirir, aşağıdaki "Kapsam dışı" listesiyle AYNI gerekçe). Detaylı
gerekçe için bkz. `quality-tier.ts` dosya başı doc yorumu.

## Kapsam dışı (bilinçli olarak bırakılan)

- **Gerçek 3D at/jokey modelleri** (GLTF/GLB dosyaları) ve **gerçek
  animasyonlar** (koşu, dörtnala kalkış, viraj alma vb.) — bunlar sanat
  varlığı gerektirir; `HorseMarker` bileşeni ileride bu modelleri
  yükleyecek şekilde (aynı `x`/`z`/`headingRadians` arayüzüyle)
  değiştirilebilir, HUD/oynatma mantığı etkilenmez.
- **Seyirci (crowd)**, **hava efektleri (VFX — yağmur, toz vb.)**, **ses/
  müzik** — brief FAZ 6 listesinde var ama görsel/işitsel varlık
  gerektirdiği için bu oturumun kapsamı dışındadır.
- **Gerçek pist boyutları** (`Track.lengthMeters`, `trackWidthMeters`)
  sahneye tam ölçekli yansıtılmadı — sabit bir varsayılan tur uzunluğu
  (`DEFAULT_LAP_LENGTH_METERS`) kullanıldı (bkz. `track-path.ts` başlık
  yorumu).
- **NestJS wiring** — `RaceViewer`'ın gerçek `/races/{id}` API'sinden veri
  alması (şu an statik fixture) — FAZ 1-5 domain katmanlarının hiçbirinin
  NestJS'e bağlanmamış olmasıyla aynı, zaten bilinen kapsam dışı karar.

### Master Development Brief §20 "RACE HUD" — telemetri zenginleştirme (bu turda EKLENDİ)

Race Engine zaten `stamina`/`fatigue`/`tacticalState`'i her segment için
hesaplıyordu (`RaceSegmentSnapshot`, `timeline-playback.ts`'in
`InterpolatedHorseState`'i bunları ZATEN ara değerliyordu) ama HİÇBİR
tüketicisi yoktu (`InterpolatedHorseState`'in kendi eski doc yorumu:
"bugün hiçbir tüketicisi yok"). `LiveLeaderboardEntry`'ye bu üç alan
(opsiyonel — segmenti olmayan bir at için `undefined` kalır, UYDURULMAZ)
eklendi, `RaceHud.tsx`'in `LeaderboardPanel`'i her at satırının altına
ince bir "Kon" (kondisyon/stamina) ve "Yor" (yorgunluk/fatigue) çubuğu +
taktik stilinin Türkçe kısa etiketini (Öncü/Takipçi/Orta/Bitirici) ekledi.
Yeni veri ÜRETİLMEDİ, YALNIZCA zaten var olan motor çıktısı HUD'a
taşındı — brief'in "PACE" alanına sayısal bir karşılık motorda yok
(taktik stil kategorisi en yakın karşılık, uydurma bir "pace score"
İCAT EDİLMEDİ). `timeline-playback.spec.ts`'e yeni test case'leri
eklendi, gerçek `tsc --noEmit` + `tsx` ile doğrulandı.

### Master Development Brief §17 "Camera Director" (bu turda EKLENDİ)

`camera-director.ts` (yeni, saf fonksiyon dosyası) yarış durumunu
(`leaderPositionMeters`, `raceDistanceMeters`, `anyHorseBlocked`,
`isFinished`) ayrık bir `RaceCameraEvent`'e (`start | final_stretch |
overtake | finish | normal`) sınıflandırır, ardından bunu MEVCUT 4
kamera moduna (`camera-presets.ts`'teki `CameraMode`) eşler. Öncelik
sırası: `finish` > `start` > `final_stretch` > `overtake` > `normal`.
Eşikler ZAMAN bazlı değil MESAFE bazlıdır (brief'in "start fazının ilk
birkaç saniyesi" gibi zaman tanımları, değişken hız/gecikme altında
tutarsız olurdu) — `START_PHASE_METERS = 50`, `FINAL_STRETCH_REMAINING_METERS
= 400`. `anyHorseBlocked`, `timeline-playback.ts`'e eklenen yeni
`isAnyHorseBlockedAtTime()` yardımcı fonksiyonuyla, motorun zaten
ürettiği `RaceSegmentSnapshot.blocked` bayrağından (uydurulmadan) okunur.

Brief'in istediği ek kamera tipleri (`START_CAMERA`, `GROUP_CAMERA`,
drone/helicopter açıları vb.) BİLİNÇLİ OLARAK ertelendi — bunlar YENİ
kamera pozisyonu matematiği (`camera-presets.ts`'e yeni `CameraMode`
değerleri) gerektirir ve gerçek 3D varlıklar (Grup 2, kullanıcının
"şimdilik erteleyelim" kararı) geldiğinde birlikte tasarlanması daha
tutarlı olur; bu turda sadece MEVCUT 4 modun ne zaman otomatik
seçileceği otomatikleştirildi.

`RaceViewer.tsx` ve `LiveRaceViewer.tsx`'e wiring: `manualCameraOverrideRef`
(kullanıcı HUD'dan manuel kamera seçtiğinde `true` olur) + `lastAutoCameraEventRef`
(son sınıflandırılmış event) — event DEĞİŞTİĞİNDE override otomatik
sıfırlanır ve yönetmen tekrar devreye girer; event değişmediği sürece
kullanıcının manuel seçimi korunur. `LiveRaceViewer.tsx`'te `isFinished`
zaman bazlı DEĞİL, `finishedEntrants !== null` ile belirlenir (o
bileşende `durationMs` gerçek bir yarış süresi değil, JSX'te
`currentTimeMs`'e eşitlenen önceden var olan bir tuhaflıktır — bu turda
DOKUNULMADI, sadece not edildi).

`camera-director.ts`, `tsconfig.logic.json`'a eklendi; gerçek `tsc
--noEmit` (0 hata) ve `tsx` ile çalıştırılan 11 test case'i (bkz.
`camera-director.spec.ts`) PASS. `RaceViewer.tsx`/`LiveRaceViewer.tsx`
değişiklikleri `ts.transpileModule` ile söz dizimi kontrolünden geçti
(0 diagnostic) — gerçek tip kontrolü, bu dosyaların JSX kısıtı gereği,
push sonrası CI'da olur.

### Master Development Brief §23 "Photo Finish" sunumu (bu turda EKLENDİ)

`photo-finish.ts` (yeni, saf fonksiyon dosyası) ZATEN VAR OLAN
`RaceFinishEntry`/`RaceFinishedEntrant` verisinden (`finishPosition`,
`finishTimeMs`/`finalTimeMs`, `performanceScore`) iki şey üretir:

1. **Sonuç kartı** (`buildPhotoFinishRows`) — kazanana göre milisaniye
   farkı (`gapToWinnerMs`) hesaplanmış, sıralı bir satır listesi.
   `RaceHud.tsx`'in yeni `FinishResultOverlay` bileşeni bunu HUD'un
   üzerine ortalanmış bir kart olarak render eder (`finishResult` prop'u
   dolu VE boş olmayan bir dizi olduğunda).
2. **"Foto finiş" rozeti** (`isCloseFinish`) — 1. ile 2. arasındaki fark
   `CLOSE_FINISH_THRESHOLD_MS` (150ms, brief sayı vermediği için burada
   seçilen makul bir eşik — Faz 6 "Config ayrımı" dilimine taşınacak)
   altındaysa kart üzerinde ekstra bir vurgu gösterilir.

**Ağır çekim (slow-motion):** `getFinishSlowMotionFactor()`, yarışın son
`FINISH_SLOWMO_WINDOW_MS` (3 saniye) içinde oynatma hızını kademeli
olarak `FINISH_SLOWMO_MIN_FACTOR`'a (0.25×) kadar düşüren bir ÇARPAN
döner. `RaceViewer.tsx`'in `requestAnimationFrame` döngüsünde kullanıcının
seçtiği `speedMultiplier` ile ÇARPILIR — yeni bir animasyon/asset/kamera
GEREKMEZ, sadece ZATEN VAR OLAN interpolasyonlu oynatma (`advancePlaybackTimeMs`)
bitiş çizgisine yaklaşırken doğal olarak YAVAŞLAR. Bu, YALNIZCA
`RaceViewer.tsx`'e (replay/pratik yarış) wiring edildi — `LiveRaceViewer.tsx`
sunucunun ZATEN gerçek zamanda gönderdiği telemetriyi oynattığından
(dosya başı doc yorumu madde 1) geriye dönük bir "yavaşlatma" orada
ANLAMSIZDIR; `LiveRaceViewer.tsx` yalnızca sonuç KARTINI alır (`race.
finished` olayından gelen `finishedEntrants`, `finalTimeMs`/
`finishPosition` `null` olanlar DNF güvenliği için filtrelenir).

`photo-finish.ts`, `tsconfig.logic.json`'a eklendi; gerçek `tsc --noEmit`
(0 hata) ve `tsx` ile çalıştırılan 14 test case'i (bkz.
`photo-finish.spec.ts`) PASS. `RaceHud.tsx`/`RaceViewer.tsx`/
`LiveRaceViewer.tsx` değişiklikleri `ts.transpileModule` ile söz dizimi
kontrolünden geçti (0 diagnostic); mevcut `RaceHud.spec.tsx` (gerçek
`@testing-library/react`/jsdom testi) yeni `finishResult` prop'unu
KULLANMADIĞI için etkilenmedi (opsiyonel prop, varsayılan `undefined`).

### Master Development Brief §7/§51 "Asset Interface + Manifest" (bu turda EKLENDİ)

`assets/asset-manifest.ts` (yeni, saf veri modülü) brief'in beklediği
HER 3D model/doku/ses dosyasını (`ASSET_MANIFEST`) TEK bir yerde
tanımlar — hiçbiri şu an repoda YOK (`apps/web/public/` boş), bu BİLİNÇLİ
bir durum (kullanıcının "şimdilik erteleyelim" kararı, bkz. `docs/
IMPLEMENTATION_PLAN_MASTER_BRIEF.md`). İnsan-okunabilir karşılığı
`docs/ASSET_GUIDE.md` — brief §7'nin örnek formatını (`HORSE_MODEL_
REQUIRED — ...`) takip eder.

`assets/GltfAssetLoader.tsx` (yeni, React/Three.js bileşeni) drei'nin
`useGLTF`'ini bir `Suspense` + class-based `GltfErrorBoundary` (React'ta
hata sınırları SADECE class component'lerle yazılabilir) içine alır —
dosya `public/` altında YOKSA veya bozuksa SESSİZCE `fallback`'e düşer,
sahne ÇÖKMEZ. Bu turda `public/` altına HİÇBİR gerçek `.glb` KONULMADI
(brief'in "sahte asset uydurma" kuralı) — bu yüzden yalnızca "dosya yok
→ fallback" dalı dolaylı olarak doğrulanabildi, "gerçek dosya başarıyla
yüklenir" dalı asset'ler eklendiğinde manuel QA gerektirir.

`asset-manifest.ts`, `tsconfig.logic.json`'a eklendi; gerçek `tsc
--noEmit` (0 hata) ve `tsx` ile çalıştırılan 9 test case'i (bkz.
`asset-manifest.spec.ts`) PASS. `GltfAssetLoader.tsx`, `RaceScene3D.tsx`/
`live-race-socket.ts` ile AYNI kısıta tabidir (`three`/`@react-three/drei`/
`three-stdlib` bu sandbox'ta kurulu değil) — `ts.transpileModule` ile
sözdizimi kontrolünden geçti (0 diagnostic), gerçek tip kontrolü CI'dadır.

## ÖNEMLİ — bu oturumdaki doğrulama kısıtı

`docs/ARCHITECTURE.md` §9'da belgelenen kısıt burada da geçerlidir: bu
geliştirme ortamının npm registry erişimi kısıtlıdır, bu yüzden `three`,
`@react-three/fiber`, `@react-three/drei` paketleri BU ortamda
kurulamamış ve `RaceScene3D.tsx`/`RaceViewer.tsx`/`RaceHud.tsx`/demo
sayfası YEREL OLARAK derlenip doğrulanamamıştır (JSX içeren hiçbir dosya
bu ortamda `tsc` ile kontrol edilemez, çünkü `@types/react` de kurulu
değildir — bu, `apps/web`'in FAZ 0'dan beri var olan bir kısıtıdır, sadece
Faz 6'ya özgü değildir).

**Yerel olarak `tsc` + gerçek testlerle tam doğrulanan** dosyalar (bkz.
`apps/web/tsconfig.logic.json` ve `apps/web/test/features/race-viewer/`):
`track-path.ts`, `timeline-playback.ts`, `camera-presets.ts`,
`minimap-projection.ts` — bunlar framework'ten bağımsız saf TypeScript'tir.

**GitHub Actions CI'da doğrulanacak** (gerçek `npm install` + `npm run
typecheck`/`build`, tam registry erişimiyle): `RaceScene3D.tsx`,
`RaceViewer.tsx`, `RaceHud.tsx`, `apps/web/src/app/races/demo/page.tsx`.
Yapısal olarak doğru yazılmıştır (gerçek Three.js/`@react-three/fiber`
API'lerine göre); daha önceki fazlarda (`fix(build)`, `fix(ci)` commit'leri)
olduğu gibi, CI ilk çalıştırmada bir hata bulursa bir sonraki oturumda
hızlıca düzeltilecektir.
