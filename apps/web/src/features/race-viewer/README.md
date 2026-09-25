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

### Master Development Brief §31 "Audio/VFX Manager iskeleti" (bu turda EKLENDİ)

`audio-vfx/audio-manager.ts` (yeni, saf mantık) — brief'in event-driven
(`race_start`/`final_stretch`/`finish`) ses yöneticisi isteği. HANGİ
sesin NE ZAMAN çalınacağına karar veren mantık, GERÇEK ses çalma işini
`AudioBackend` arayüzüne DEVREDER (dependency injection — test'lerde
"kaydedici" bir backend kullanılır, bu bir davranış MOCK'LAMASI DEĞİLDİR,
sadece hangi metodun hangi argümanla çağrıldığını KAYDEDER). Backend
verilmezse `SILENT_AUDIO_BACKEND` kullanılır — brief'in "dosya yoksa
sessiz no-op" kuralının doğrudan kod karşılığı, ÜRETİMDE de asset'ler
eklenene kadar TAM OLARAK bu davranış geçerli olacaktır.

`audio-vfx/html-audio-backend.ts` (yeni, tarayıcı implementasyonu) —
`AudioBackend`'in GERÇEK `HTMLAudioElement` üzerinden çalışan hali.
`dom` lib'e bağımlı olduğundan `tsconfig.logic.json`'a EKLENMEDİ
(`RaceScene3D.tsx` ile AYNI kısıt kategorisi) — `ts.transpileModule` ile
sözdizimi kontrolünden geçti, gerçek doğrulama CI'dadır.

`audio-vfx/dust-particle-sim.ts` (yeni, saf simülasyon matematiği) —
brief'in "three.js'in kendi ilkel Points sistemi, DOKU GEREKTİRMEZ" VFX
önerisi. Race Engine'in KENDİ determinizm kuralına uyarak (`docs/
RACE_ENGINE.md` §7) `Math.random()` YERİNE `@at-sevdalisi/shared-types`'ın
ZATEN VAR OLAN `createSeededRandom`'ı kullanılır — bu, saf görsel bir
efekt için ZORUNLU değildir ama (a) bu sandbox'ta GERÇEKTEN test
edilebilir kılar, (b) projenin TEK bir rastgelelik kaynağını KULLANIR.

`audio-vfx/DustParticles.tsx` (yeni, render katmanı) — `dust-particle-sim.ts`'in
saf fonksiyonlarını `<points>`'e bağlar. `PointsMaterial`'ın vertex-başına
opaklığı DESTEKLEMEMESİ nedeniyle (SADECE tek bir global `opacity` kabul
eder) özel bir `<shaderMaterial>` kullanıldı — three.js'in resmi
`webgl_custom_attributes_points` örneğiyle AYNI standart teknik, her
parçacığın kendi yaşına göre solması (`getDustParticleOpacity`) GERÇEKTEN
uygulanır (uydurma bir kısayol DEĞİL).

`audio-manager.ts`/`dust-particle-sim.ts`, `tsconfig.logic.json`'a
eklendi; gerçek `tsc --noEmit` (0 hata) ve `tsx` ile çalıştırılan 26 test
case'i (11 `audio-manager.spec.ts` + 15 `dust-particle-sim.spec.ts`)
PASS. `html-audio-backend.ts`/`DustParticles.tsx`, `RaceScene3D.tsx` ile
AYNI kısıta tabi — `ts.transpileModule` ile sözdizimi kontrolünden geçti
(0 diagnostic), gerçek tip kontrolü CI'dadır. Bu turda `RaceScene3D.tsx`'e
`DustParticles`/`AudioManager` WIRING EDİLMEDİ (kapsam: sadece iskelet
sunan bağımsız modüller) — entegrasyon, gerçek asset'ler eklendiğinde (Grup 2)
görsel/işitsel sonucun ANLAMLI olacağı bir sonraki adımdır.

### Faz 6 "Config ayrımı" (bu turda EKLENDİ)

Camera Director/Photo Finish/VFX/Audio modüllerinin bu tura kadar dosya
içine gömülü olan sabitleri (`START_PHASE_METERS`, `CLOSE_FINISH_
THRESHOLD_MS`, `RISE_SPEED_MPS`, `HOOFBEAT_BASE_VOLUME` vb.) artık
`@at-sevdalisi/game-config` paketinin (`packages/game-config`) tip
güvenli yükleyicileri üzerinden okunuyor — bu, `apps/api`'nin domain
fonksiyonlarının (`pedigree.ts`'in `checkInbreeding(..., config:
GeneticsConfig)` deseni) ZATEN uyguladığı "config parametre olarak
geçirilir, hiçbir fonksiyon kendi config'ini KENDİSİ yüklemez, varsayılan
DEĞER yoktur" disipliniyle AYNI — `apps/web`'in `@at-sevdalisi/
game-config`'i tüketen İLK kod yolu budur.

Üç yeni config dosyası (`config/camera.config.json`, `config/vfx.config.json`,
`config/audio.config.json`) ve karşılık gelen `CameraConfig`/`VfxConfig`/
`AudioConfig` arayüzleri (`packages/game-config/src/types.ts`) eklendi.
`CameraConfig`, Camera Director eşiklerini VE Photo Finish'in ağır çekim
parametrelerini (`photoFinish` alt-nesnesi) TEK dosyada tutar — brief'in
kendi §17/§23 komşu numaralandırması ikisini "yarış anlatımı/kamera"
kararı olarak birlikte ele alır, bu yüzden planın vaat ettiği "3 config
dosyası" (camera/vfx/audio) sayısı KORUNUR.

Değişen imzalar: `classifyRaceCameraEvent`/`selectAutomaticCameraMode`
(`camera-director.ts`), `isCloseFinish`/`getFinishSlowMotionFactor`
(`photo-finish.ts`), `spawnDustParticle`/`advanceDustParticle`
(`dust-particle-sim.ts`) artık son parametre olarak İLGİLİ config
nesnesini ZORUNLU kılar; `RaceAudioManager`'ın kurucusu artık İLK
parametre olarak `AudioConfig` alır (`backend` ikinci, opsiyonel
parametre olarak KALDI — `AudioBackend`'in aksine config için "yok"
anlamlı bir varsayılan DEĞİLDİR, GERÇEK oyun dengesi verisidir).

Tüketen bileşenler (`RaceViewer.tsx`, `LiveRaceViewer.tsx`, `RaceHud.tsx`'in
`FinishResultOverlay`'i, `DustParticles.tsx`) ilgili `loadXConfig()`'i
MODÜL KAPSAMINDA bir kez çağırır (`apps/api`'nin `ConfigService`'inin
`readonly race = loadRaceConfig()` deseniyle AYNI fikir — config,
derleme zamanında bundle'a gömülü statik bir JSON olduğundan tekrar
tekrar yüklemenin bir MALİYETİ yoktur, ama her render'da YENİDEN
ÇAĞIRMAK yerine render döngüsünün DIŞINDA tek bir modül sabiti tutulur).
`DustParticles.tsx`'in kendi `SPAWN_RATE_PER_SECOND`/`MAX_ACTIVE_
PARTICLES`/`PARTICLE_COLOR`/shader `uniforms` varsayılanları da AYNI
şekilde `vfxConfig.dustParticles.*`'tan okunacak şekilde güncellendi.

`packages/game-config/src/index.ts`'e `loadCameraConfig()`/
`loadVfxConfig()`/`loadAudioConfig()` eklendi (`apps/web`'in tükettiği
İLK config'ler — bu yüzden `apps/web/package.json`'a `@at-sevdalisi/
game-config` bağımlılığı VE `next.config.mjs`'in `transpilePackages`'ına
paket adı EKLENDİ, `@at-sevdalisi/shared-types` ile AYNI monorepo paket
paylaşım deseni). `apps/web/tsconfig.logic.json`'a `@at-sevdalisi/
game-config` için bir `paths` girişi eklendi.

Doğrulama: `packages/game-config/test/config.spec.ts`'e yeni config'ler
için 10 test case'i eklendi (versiyon/eşik/aralık/renk-formatı/hacim
toplamı sağlamaları) — mevcut 14 ile birlikte TOPLAM 24 test, gerçek
`tsx` çalıştırmasıyla PASS (bu paketin kendi `tsconfig.json`'ı
`moduleResolution: "Node10"` kullandığından bu sandbox'taki TS 6.0.3
`tsc`'si ile DOĞRUDAN kontrol edilemiyor — bu, bu turda İNTRODUCE
EDİLMEYEN, `apps/api` CommonJS uyumluluğu için ÖNCEDEN var olan bir
kısıt, bkz. paketin kendi `tsconfig.json`'ı). `camera-director.ts`/
`photo-finish.ts`/`dust-particle-sim.ts`/`audio-manager.ts`'in kendi
`.spec.ts` dosyaları, `apps/api`'nin `genetics.spec.ts`/`pedigree.spec.ts`
testlerinin AYNI deseniyle güncellendi: artık kendi uydurma test
sabitlerini DEĞİL, GERÇEK `config/*.config.json` dosyasını doğrudan
içeri aktarıp onun alanlarını referans alıyorlar (config değerleri
değişirse testler otomatik GEÇERLİ kalır) — 41 test case'i (11+15+15
mevcut + yeniden yazılan, tam liste: 7 `camera-director` + 4
`selectAutomaticCameraMode` + 4+3+2+5 `photo-finish` + 4+5+2+4
`dust-particle-sim` + 2+2+1+2+2+2+1 `audio-manager`), gerçek `tsx`
çalıştırmasıyla PASS. `RaceViewer.tsx`/`LiveRaceViewer.tsx`/`RaceHud.tsx`/
`DustParticles.tsx` — bu dosyaların JSX içermesi nedeniyle bu ortamda
`tsc` ile TAM doğrulanamaz (bkz. aşağıdaki bölüm) — `ts.transpileModule`
ile sözdizimi kontrolünden geçti (0 diagnostic), gerçek tip kontrolü
CI'dadır. `npx tsc -p tsconfig.logic.json --noEmit` (tüm saf mantık
dosyaları + `@at-sevdalisi/game-config` path alias'ı BİRLİKTE) 0 hata
ile geçti.

### Faz 2 "HUD render mimarisi" düzeltmesi (bu turda EKLENDİ)

Yeni 18 fazlık brief'in yeniden denetimi (proje sahibinin isteğiyle,
"Burayı tekrar kontrol et") daha önce "Grup 1'de tamamlandı" denen İKİ
kalemin ("§20 telemetri zenginleştirme" ve "§31 Audio Manager iskeleti")
brief'in KENDİ katı kriterlerini TAM karşılamadığını ortaya çıkardı.
Proje sahibi önce bunların düzeltilmesini seçti ("Önce mevcut hataları
düzelt (Faz 2 + 4)"). Bu bölüm Faz 2'yi belgeler.

**Bulunan gerçek ihlal:** brief'in KENDİ uyarısı — "HUD performansını
bozacak şekilde React state'i her frame güncelleme. Render loop / uygun
reactive architecture kullan." `RaceViewer.tsx` VE `LiveRaceViewer.tsx`
TEK bir `currentTimeMs` state'ini HER rAF karesinde (60Hz) güncelliyordu
ve bu TEK state HEM 3D sahneyi HEM DOM tabanlı `RaceHud`'u besliyordu.
3D sahne tarafı ZARARSIZDIR (`RaceScene3D`, React-Three-Fiber'ın KENDİ
reconciler'ı üzerinden akar, gerçek tarayıcı DOM'una DOKUNMAZ) ama
`RaceHud` DÜZ DOM/CSS'tir — onu 60Hz'de yeniden render etmek GERÇEK bir
DOM diff'i tetikler, brief'in tam olarak işaret ettiği ihlal budur.

**Çözüm (bilinçli olarak DÜŞÜK riskli, `RaceScene3D.tsx`'e VEYA
`HorseVisual` arayüzüne DOKUNMAYAN bir React performans deseni — tam bir
Three.js/`useFrame`/ref tabanlı yeniden yazım DEĞERLENDİRİLDİ ve bu
ortamın gerçek tarayıcı/WebGL çalıştıramaması nedeniyle BİLİNÇLİ olarak
REDDEDİLDİ):**

1. Tek `currentTimeMs` state'i İKİYE ayrıldı: `currentTimeMs` (HER
   karede güncellenir, YALNIZCA 3D sahneyi — `horseVisuals`/`cameraPose`
   — besler) ve yeni `hudTimeMs` (100ms/10Hz'de bir güncellenir,
   `RaceHud`'un tükettiği TÜM türetilmiş veriyi — `leaderboard`,
   `hudHorseVisuals` → `miniMapMarkers`, kamera yönetmeni girdisi —
   besler). 100ms brief §2'nin "gerçek zamanlı" isteğini karşılarken DOM
   güncelleme sıklığını 60Hz'e göre 6 kat azaltır. Seek anında (kullanıcı
   sürükleme çubuğunu bıraktığında) VE yarış bitişinde throttle
   penceresi BEKLENMEDEN her iki state ANINDA senkronize edilir — HUD
   asla bayat bir seek-öncesi konum veya gecikmeli bir foto finiş
   göstermez.
2. `RaceHud.tsx` `memo()` ile sarıldı (`RaceHudComponent` iç isim,
   `export const RaceHud = memo(RaceHudComponent)` dışa açılan isim —
   TÜM çağrı yerleri `import { RaceHud } from './RaceHud'` birebir AYNI
   kaldığından SIFIR çağrı-yeri değişikliği). `hudTimeMs`'ten türeyen
   prop'lar DEĞİŞMEDİĞİ sürece `RaceHud`'un fonksiyon gövdesi artık HİÇ
   ÇALIŞMAZ — ebeveyn 60Hz'de render olsa bile.
3. `RaceHud`'a geçirilen TÜM event-handler prop'ları (`onTogglePlay`,
   `onChangeCameraMode`, `onSeek`; `LiveRaceViewer.tsx`'te ayrıca ANLAMSIZ
   olan `onChangeSpeedMultiplier` — bkz. o dosyanın "Seek/hız/duraklat
   ANLAMSIZ" doc yorumu) `useCallback` (`RaceViewer.tsx`) veya modül
   seviyesinde SABİT no-op sabitleri (`LiveRaceViewer.tsx`) ile SABİT
   kimlikte tutulur — aksi halde her render'da YENİ bir fonksiyon
   referansı `memo()`'nun sığ prop karşılaştırmasını KIRARDI.
4. Kod tekrarı YAN ÜRÜN olarak temizlendi: `RaceViewer.tsx`'in at-görseli
   hesaplama mantığı (renk seçimi × ara değerlenmiş konum × lider tespiti)
   ile `LiveRaceViewer.tsx`'in NEREDEYSE BİREBİR AYNI kopyası artık TEK
   bir paylaşılan `computeHorseVisualsAt()` (+ `pickHorseColor()`)
   fonksiyonunda birleşti (`RaceViewer.tsx`'ten `export` edilir,
   `LiveRaceViewer.tsx` import eder). Bu arada `RaceViewer.tsx`'in eski
   `HORSE_COLORS[index % HORSE_COLORS.length]!` (`!` tip zorlaması —
   projenin "kodda `!` yok" kuralına aykırı, daha önce fark edilmemiş bir
   kalıntı) `LiveRaceViewer.tsx`'in ZATEN sahip olduğu gerçek çalışma
   zamanı guard'ıyla DEĞİŞTİRİLDİ.

`HorseVisual` arayüzü (x/z/headingRadians/color/isLeader) VE
`RaceScene3DProps` (`horses`/`cameraPose`/`trackGeometry`) bu düzeltme
boyunca TAMAMEN DEĞİŞMEDİ — belgelenmiş genişletme noktası (gerçek
at/jokey modelleri geldiğinde) korunuyor.

**Doğrulama:** `RaceViewer.tsx`/`LiveRaceViewer.tsx`/`RaceHud.tsx`
üçü de `ts.transpileModule` ile sözdizimi kontrolünden geçti (0
diagnostic — bkz. aşağıdaki "doğrulama kısıtı" bölümü, bu üçü zaten JSX
içerdiğinden bu ortamda gerçek `tsc`/tip kontrolü YAPILAMAZ). Ayrıca
`grep` ile her iki dosyada da kaldırılan sembollerin (`HORSE_COLORS`,
yerel `pickHorseColor`, `interpolateHorseStateAtTime` doğrudan çağrısı)
KALINTI bırakmadığı ve `RaceHud`'un iki çağrı yerinde de import
imzasının DEĞİŞMEDİĞİ doğrulandı. Gerçek derleme/tip kontrolü, her
zamanki gibi, push sonrası CI'dadır.

### Faz 4 "Audio Manager" düzeltmesi (bu turda EKLENDİ)

Aynı yeniden denetimin ikinci bulgusu: `audio-manager.ts` brief §31'in
KENDİ "Architecture" listesindeki 11 ses kategorisinden (RaceStart/
GateOpen/Hoof/HorseBreathing/Crowd/Wind/Overtake/FinalStretch/Finish/
Commentary/Winner) yalnızca ÜÇÜNÜ (`race_start`/`final_stretch`/`finish`)
uyguluyordu VE brief'in istediği "Ses seviyeleri ayrı kontrol edilebilir
olmalı: Master/Music/SFX/Crowd/Commentary/Horse" kanal sistemi HİÇ
YOKTU. Bu bölüm o eksikliği kapatır.

**Eklenen olay tipleri:** brief'in KENDİ örnek eşleştirmesi ("RACE_START
→ RaceStart", "GATES_OPEN → GateOpen", "OVERTAKE → Overtake", "FINAL_200
→ FinalStretch", "FINISH → Finish", "WINNER → Winner") altı AYRIK
(bir seferlik/durum-değiştiren) olayı TEK bir Race Engine sinyaline
bağlar — `RaceAudioEventType` artık bu altısını (`race_start`/`gate_open`/
`overtake`/`final_stretch`/`finish`/`winner`) kapsıyor. Kalan beş
kategori (Hoof/HorseBreathing/Crowd/Wind/Commentary) doğası gereği
SÜREKLİ (loop/ambient) veya ÇOK SAYIDA olası klipten biri (Commentary)
olduğundan brief'in ÖRNEK listesinde TEK bir olaya bağlanmamıştır — bu
yüzden AYRI metotlarla modellendi:

- `HorseBreathing`: `startHoofbeats`/`stopHoofbeats`/`updateHoofbeatIntensity`
  ile BİREBİR AYNI desende `startHorseBreathing`/`stopHorseBreathing`/
  `updateHorseBreathingIntensity` — ama girdi hıza DEĞİL, yorgunluğa
  (fatigue, ZATEN VAR OLAN telemetriden, `[0,100]`) dayanır. `race_start`
  ile birlikte başlar, `finish`te durur (hoofbeat ile AYNI yaşam döngüsü
  — koşan at durunca hem nal sesi hem nefesi kesilir).
- `Crowd`/`Wind`: `startCrowdAmbience`/`stopCrowdAmbience` ve
  `startWindAmbience`/`stopWindAmbience` — sabit hacimli, sürekli ortam
  sesleri, `race_start`ta başlar, `stopAll()`ta durur (yarış bitince de
  DEVAM ederler — tribün/rüzgar sesi çizgiyi geçme anında KESİLMEZ,
  bu GERÇEKÇİ değildi).
- `GateOpen`/`Overtake`/`Winner`: bir seferlik (döngüsüz) SFX'ler,
  yalnızca YENİ asset gereksinimleri (aşağıya bkz.) eklenerek `handleEvent`e
  dahil edildi. `Winner`, `Finish`ten KASITLI OLARAK AYRI tutuldu ("finish"
  çizgiyi geçme anı, "winner" kazananın kesinleşme anı — ileride AYRI bir
  Winner Ceremony sunumunun başlangıcı olacaktır).
- `Commentary`: `COMMENTARY_VOICE_REQUIRED` TEK bir dosya DEĞİL bir
  KLASÖR olduğundan (ZATEN böyle belgelenmişti) TEK bir "olay" olarak
  modellenemez — yeni `playCommentaryLine(fileName)` metodu klasör
  yolunu ÇAĞIRANIN belirlediği dosya adıyla birleştirip çalar.

**Eklenen ses kanalları:** `AudioConfig.volumeChannels` (`master`/
`music`/`sfx`/`crowd`/`commentary`/`horse`, `@at-sevdalisi/game-config`)
+ `RaceAudioManager.setChannelVolume()`/`getChannelVolume()`. Her çalınan
sesin NİHAİ hacmi `resolveVolume(channel, taban) = taban × kanal ×
master` olarak hesaplanır (`resolveVolume` private metodu) — TÜM
varsayılan kanal değerleri `1` olduğundan bu değişiklik ÖNCEKİ
davranışla (hiçbir kanal kısılmamışken TÜM sesler kendi taban hacminde
çalar) BİREBİR AYNI sonucu üretir, geriye dönük UYUMLUDUR (bkz. aşağıdaki
doğrulama). `setChannelVolume` çağrıldığında O AN çalan döngülü sesler
(nal/nefes/kalabalık/rüzgar/müzik) `reapplyActiveLoopVolumes()` ile
ANINDA yeniden hacimlendirilir — aksi halde bir ses ayarları
kaydırıcısını yarış SIRASINDA hareket ettirmenin GÖZLENEBİLİR hiçbir
etkisi olmazdı.

**Yeni asset gereksinimleri** (`asset-manifest.ts` + `docs/ASSET_GUIDE.md`,
İKİSİ DE elle senkron güncellendi, hiçbiri gerçek bir dosya İCAT ETMEZ):
`GATE_OPEN_SFX_REQUIRED`, `HORSE_BREATHING_SFX_REQUIRED`,
`WIND_AMBIENCE_SFX_REQUIRED`, `OVERTAKE_SFX_REQUIRED`,
`WINNER_CELEBRATION_SFX_REQUIRED`.

**Bilinçli olarak kapsam DIŞINDA bırakılan:** `RaceAudioManager`'ın
`RaceViewer.tsx`/`LiveRaceViewer.tsx`'e WIRING edilmesi. Bu sınıf DAHA
ÖNCE de hiçbir yerden instantiate edilmiyordu (framework-agnostik,
bağımsız bir modül olarak tasarlanmıştı) — brief'in KENDİSİ bu fazda
"gerçek ses assetlerini ÜRETME, sadece profesyonel altyapıyı hazırla"
der, ayrıca `gate_open`/`overtake`/`winner` gibi ayrık sinyaller Race
Engine tarafından ŞU AN yayınlanmıyor (Camera Director'ın kendi olay
sınıflandırması BİLE pozisyon eşiklerinden TÜRETİLİR, gerçek bir pub/sub
event sistemi DEĞİLDİR) — bu yüzden gerçek entegrasyon AYRI ve daha
büyük bir kapsam olarak bırakıldı.

**Doğrulama:** `audio-manager.ts`/`asset-manifest.ts`, `tsconfig.logic.json`
kapsamında olduğundan bu değişiklik GERÇEK `tsc --noEmit` (0 hata) ile
doğrulandı (`RaceScene3D.tsx`/`RaceViewer.tsx`'in aksine bu dosyalar
framework'ten bağımsızdır). Bu sandbox'ta npm registry erişimi
`vitest`'i KURAMADIĞINDAN (403 — bkz. genel doğrulama kısıtı), gerçek
`audio-manager.spec.ts`/`config.spec.ts` dosyaları `tsx` ile ÇALIŞTIRILAN
minimal bir `describe`/`it`/`expect` shim'i ÜZERİNDEN (gerçek vitest
matcher semantiğini birebir taklit eden, davranışı DEĞİL sadece test
KOŞUCUSUNU ikame eden bir araç) gerçekten YÜRÜTÜLEREK doğrulandı: 24/24
(`audio-manager.spec.ts`, 9 yeni test EKLENDİ) ve 27/27 (`config.spec.ts`,
5 yeni test EKLENDİ) geçti — eski senaryolar (race_start/final_stretch
duck/finish/updateHoofbeatIntensity/stopAll) DEĞİŞMEDEN BİREBİR AYNI
sonuçları üretmeye devam ediyor. Gerçek `npm test`/`vitest` çalıştırması,
her zamanki gibi, push sonrası CI'dadır.

### "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §17-21 denetimi (bu turda EKLENDİ)

Proje sahibi 32 bölümlük yeni bir "REALISTIC 3D ASSET & AUDIO PRODUCTION
BRIEF" paylaştı ve "incele, eksiklikleri tamamlayalım" dedi. Denetimde şu
üç kademe ortaya çıktı — bu bölüm SADECE gerçekten tamamlanan Tier 1
(kod/doküman) kısmını belgeler, Tier 2/3 için proje sahibine verilen
rapora bkz. (bu README'nin kapsamı DIŞINDA, konuşma geçmişinde).

**Tamamlanan (Tier 1 — asset/para/Blender/gerçek tarayıcı GEREKTİRMEYEN
kod+doküman işi):**

- **§18 "yüzeye göre nal sesi":** `RaceSurface` (`@at-sevdalisi/shared-types`
  — `'grass' | 'dirt' | 'synthetic'`) ZATEN VAR OLAN, gerçek bir domain
  alanı (`Race.surface`, races tablosunda GERÇEKTEN kullanılıyor) olduğundan
  bu SPEKÜLATİF bir özellik DEĞİLDİR. `RaceAudioEvent.surface?: RaceSurface`
  eklendi, `startHoofbeats(surface)` artık `resolveHoofbeatAssetId(surface)`
  ile `HOOF_GRASS_SFX_REQUIRED`/`HOOF_DIRT_SFX_REQUIRED`/
  `HOOF_SYNTHETIC_SFX_REQUIRED`/`HOOFBEAT_SFX_REQUIRED` (surface
  verilmezse jenerik) arasında seçim yapar — `stopHoofbeats`/
  `updateHoofbeatIntensity`/`reapplyActiveLoopVolumes` yeni
  `activeHoofbeatAssetId` alanı üzerinden HANGİ asset'in o an çaldığını
  takip eder. Yüzeye özel asset YOKSA jenerik asset'e DÜŞÜLMEZ (asset-manifest.ts'in
  KENDİ belgelediği kural) — sessiz kalır, bu bir hata DEĞİLDİR.
- **§19 "START SIGNAL":** `GATE_OPEN_SFX_REQUIRED`den (kapı MEKANİZMASI
  sesi) KASITLI OLARAK AYRI yeni `'start_signal'` olay tipi + `START_SIGNAL_SFX_REQUIRED`.
- **§20 "kademeli kalabalık":** `final_stretch`te `CROWD_AMBIENCE_SFX_REQUIRED`
  loop'u `CROWD_EXCITED_SFX_REQUIRED`e ÇAPRAZLANIR (`switchToExcitedCrowd`
  — yenisini başlat, eskisini durdur, `activeCrowdAssetId` ile takip),
  `winner`de AYRICA `CROWD_CHEERING_SFX_REQUIRED` bir seferlik çalınır.
  Ayrıca `STADIUM_AMBIENT_SFX_REQUIRED` (crowd'dan BAĞIMSIZ, yapısal
  stadyum ortam sesi) `race_start`ta başlar, `stopAll`da durur.
- **§21 "7 kanallı ses seviyeleri" (Master/Music/SFX/Horse/Crowd/
  Environment/Commentary):** `AudioChannel`/`AudioConfig.volumeChannels`e
  7. kanal olarak `environment` eklendi — `Wind` (daha önce YANLIŞLIKLA
  `sfx` altındaydı) VE yeni `StadiumAmbient` bu kanala taşındı/bağlandı.
- **§17 "Horse Snort/Neigh/Movement":** Race Engine bu vokalizasyonların
  TETİKLENME ANINI HENÜZ yaymadığından (rastgele/anlatımsal bir
  tetikleyici AYRI bir kapsam) bunlar `RaceAudioEventType`e EKLENMEDİ —
  bunun yerine çağıranın doğrudan çağırabileceği bağımsız bir seferlik
  `playHorseSnort()`/`playHorseNeigh()`/`playHorseMovement()` metotları
  (horse kanalı) eklendi.
- **Yeni config alanları** (`AudioConfig`, `config/audio.config.json`
  `1.1.0` → `1.2.0`): `volumeChannels.environment`, `startSignalVolume`,
  `stadiumAmbientVolume`, `crowdCheeringVolume`, `crowdExcitedVolume`,
  `horseSnortVolume`, `horseNeighVolume`, `horseMovementVolume`. Yüzeye
  göre nal sesi İÇİN AYRI config alanları EKLENMEDİ — ZATEN VAR OLAN
  `hoofbeat: {baseVolume, maxExtraVolume}` şekli ÜÇ yüzey asset'i için de
  KULLANILIYOR (hangi asset'in çaldığı bir SEÇİM meselesi, hacim FORMÜLÜ
  DEĞİL) — config'i 3 katına çıkarmak gereksiz tekrar OLURDU.
- **Yeni asset gereksinimleri** (`asset-manifest.ts` + `docs/ASSET_GUIDE.md`,
  İKİSİ DE elle senkron güncellendi): `START_SIGNAL_SFX_REQUIRED`,
  `STADIUM_AMBIENT_SFX_REQUIRED`, `CROWD_CHEERING_SFX_REQUIRED`,
  `CROWD_EXCITED_SFX_REQUIRED`, `HORSE_SNORT_SFX_REQUIRED`,
  `HORSE_NEIGH_SFX_REQUIRED`, `HORSE_MOVEMENT_SFX_REQUIRED`,
  `HOOF_GRASS_SFX_REQUIRED`, `HOOF_DIRT_SFX_REQUIRED`,
  `HOOF_SYNTHETIC_SFX_REQUIRED`.
- **`docs/ASSET_GUIDE.md`**, brief §24/§25'in istediği ayrı bir
  `docs/ASSET_MANIFEST.md` tablosu ve `docs/ASSET_LICENSES.md` şablonu
  İLE `/assets` kaynak-materyal klasör iskeleti de bu turda eklendi
  (bkz. bu dosyaların kendi doküman başlıkları) — brief §25'in tam
  klasör yapısını YANSITIR, ama HİÇBİR gerçek 3D model/ses dosyası
  İÇERMEZ (brief'in KENDİ kuralı).

**Bilinçli olarak kapsam DIŞINDA bırakılan (Tier 2):** brief §30'un
"HorseConfig/JockeyConfig/TrackConfig" asset-SEÇİM config katmanı —
şu an her asset türünün TEK bir varyantı tanımlı olduğundan (ör. tek bir
`HORSE_MODEL_REQUIRED`) bir SEÇİM sistemi PREMATÜR olurdu; ayrıca
`packages/game-config/src/types.ts`'te ZATEN VAR OLAN `JockeyConfig`
(race-balance config, `skillCompositeWeights` vb.) İLE İSİM ÇAKIŞMASI
olduğu NOT edildi — ileride yapılırsa FARKLI isimler (ör.
`JockeyAssetConfig`) GEREKECEKTİR.

**Doğrulama:** `RaceSurface` importu DAHİL, GERÇEK `tsc --noEmit` (0 hata,
hem `apps/web/tsconfig.logic.json` hem `packages/game-config/tsconfig.json`)
+ gerçek `tsx` ile ÇALIŞTIRILAN spec dosyaları: 44/44
(`audio-manager.spec.ts`, 20 yeni test EKLENDİ) ve 29/29 (`config.spec.ts`,
2 yeni test EKLENDİ) geçti. Bu doğrulama SIRASINDA yazılan bir testin
YANLIŞ varsayımı (`environment` kanalı değiştiğinde `crowd`'a HİÇ
`setVolume` çağrısı GİTMEZ sanılmıştı) gerçek çalıştırma İLE yakalandı —
`reapplyActiveLoopVolumes` HER kanal değişikliğinde TÜM aktif loop'ları
yeniden hesaplar (ÖNCEDEN de böyleydi, `master` testi zaten bunu
doğruluyordu), bu yüzden test `crowd`'ın DEĞERİNİN değişmediğini
doğrulayacak şekilde DÜZELTİLDİ — implementasyon DEĞİL, testin kendisi
hatalıydı.

**Ek düzeltme (aynı gün, proje sahibinin "notu komple inceledin mi?"
sorusu ÜZERİNE):** İlk geçiş SADECE ses granülaritesini (§17-21) ve
takip belgelerini (§23-25) kapsıyordu — brief'in DAHA ÖNCEKİ
bölümlerindeki (§2/§3/§6/§7/§8/§10/§13/§15/§22) DAHA DETAYLI 3D
model/animasyon/ortam SPESİFİKASYONLARI, gerçek asset/para/Blender
GEREKTİRMEDİĞİ HALDE, mevcut `ASSET_GUIDE.md` girdilerine YANSITILMAMIŞTI
— dürüstçe kabul edilip AYNI TURDA kapatıldı:

- `HORSE_MODEL_REQUIRED`/`JOCKEY_MODEL_REQUIRED` artık brief'in TAM
  animasyon klip listelerini (minimum + tercih edilen) İÇERİYOR, Mixamo
  YASAĞI (§2) genel kurallara EKLENDİ, at renk varyasyonları (§6) GELECEK
  bir uzantı noktası olarak (gerçek bir base model gerektirdiğinden
  BİLİNÇLİ OLARAK ertelenmiş) BELGELENDİ.
- `HIPPODROME_ENVIRONMENT_REQUIRED` artık brief'in TAM bölüm listesini
  (MAIN_TRACK/GRANDSTAND/VIP_AREA/PADDOCK/JUDGE_TOWER/vb., §8) İÇERİYOR.
- `START_GATE_MODEL_REQUIRED` artık brief'in fonksiyonel akışını
  (HORSES ENTER→...→RACE, §10) BELGELİYOR.
- Genel kurallara LOD0-LOD3 sistemi (§15) ve Blender optimizasyon
  kontrol listesi (§13) EKLENDİ.
- §22 "Commentary event listesi" — DAHA ÖNCE "tam liste ileride
  eşleştirilecektir" olarak ERTELENMİŞTİ, bu artık GERÇEK kod
  karşılığına kavuştu: yeni `CommentaryMoment` tipi + `COMMENTARY_LINE_FILENAMES`
  sabiti (brief'in 9 moment'ini — `race_start`/`overtake`/`leader_change`/
  `final_400`/`final_200`/`final_100`/`sprint`/`finish`/`winner` —
  dosya adlarına eşler) + `playCommentaryForMoment(moment)` (mevcut
  `playCommentaryLine(fileName)` ÜZERİNE inşa edilmiş, TİP-GÜVENLİ bir
  kısayol, GERİYE DÖNÜK UYUMLU). `leader_change`/`final_400`/`final_100`
  Race Engine'in ŞU AN yaymadığı DAHA GRANÜLER telemetri anları
  OLDUĞUNDAN `handleEvent`e BAĞLANMADI — `playHorseSnort` vb. ile AYNI
  "bağımsız, çağıranın kararıyla çalışan metot" deseni.

**Doğrulama (ek geçiş):** gerçek `tsc --noEmit` (0 hata) + gerçek `tsx`
ile çalıştırılan `audio-manager.spec.ts`: 48/48 (4 yeni
`playCommentaryForMoment` testi EKLENDİ, TÜMÜ geçti).

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
