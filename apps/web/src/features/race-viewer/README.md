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

### Kapsam dışı (bilinçli olarak bırakılan)

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
