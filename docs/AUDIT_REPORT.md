# AUDIT_REPORT.md — Master Development Brief (Profesyonel 3D Yarış Deneyimi) Kapsamlı Denetim

Bu doküman, proje sahibinin ilettiği **"AT SEVDALISI — MASTER DEVELOPMENT
BRIEF: PROFESSIONAL 3D RACE EXPERIENCE + GAME SYSTEMS"** notunun kendi
§52 "Claude Code Çalışma Protokolü"nün gereği olarak, kod yazmaya
başlamadan ÖNCE üretilen **Phase 0 — Full Project Audit** raporudur.
Kök dizindeki `AUDIT_REPORT.md` (güvenlik/kalite denetimi, S1-S4/E1-E3/
R1-R4/F1-F2/T1-T3 vb.) ile KARIŞTIRILMAMALI — bu doküman özellikle bu
yeni brief'in 52 bölümüne karşı bir GAP ANALİZİ'dir, ayrı bir amaca
hizmet eder.

Brief'in kendisi projeye `claude/master-development-brief-3d.md` olarak
kaydedildi (proje sahibinin claude.ai Project'inde), gelecekteki
oturumların referans alması için.

**Metodoloji:** Bu rapor, kodun GERÇEKTEN okunmasıyla üretildi — repo
yapısı (`apps/web/src/features/race-viewer/**`, `apps/api/src/domain/**`,
`apps/web/public/`, `apps/web/package.json`, mevcut `docs/GAME_DESIGN.md`)
doğrudan incelendi. Hiçbir madde varsayımla İŞARETLENMEDİ — "MISSING"
denen her şey gerçekten grep/find ile arandı ve bulunamadı.

---

## CURRENT ARCHITECTURE

Proje bir monorepo (`apps/api` NestJS backend, `apps/web` Next.js
frontend, `packages/shared-types`, `packages/game-config`). Brief'in
§1'deki EN ÖNEMLİ mimari kararı — **Race Engine ≠ 3D Engine, sonuç
her zaman server'da belirlenir** — zaten projenin KENDİ kuruluş
ilkesidir (`docs/RACE_ENGINE.md` §1: "hiçbir simülasyon mantığı
render katmanında YOKTUR"). Yani brief'in en kritik mimari talebi
ZATEN karşılanmış durumda; bu konuda YENİDEN YAZMAYA gerek yok.

Akış zaten brief'in istediği şekilde çalışıyor:

```
RACE ENGINE (apps/api/src/domain/race/race-engine.ts, deterministik)
  ↓
RaceTimeline (segment bazlı authoritative state, DB'ye yazılır)
  ↓
WebSocket (race.gateway.ts, /races namespace, race.roster/race.telemetry/
  race.finished/lobby.update)
  ↓
VISUAL RACE STATE (timeline-playback.ts, saf enterpolasyon)
  ↓
3D HORSE (RaceScene3D.tsx — şu an PRIMITIVE şekiller, aşağıya bkz.)
  ↓
CAMERA (camera-presets.ts — 4 mod var, event-driven OTOMATİK seçim YOK)
  ↓
HUD (RaceHud.tsx)
  ↓
AUDIO — YOK
  ↓
VFX — YOK
```

Authentication, Horse System, Jockey System (istatistik/uyum hesabı —
görsel/atama akışı DEĞİL), Economy, Breeding, Genetics (domain
hesaplamaları), PvP (Elo + eşleşme), WebSocket, Replay (temel — canlı
yayın + hız kontrollü oynatma; ayrı bir "geçmiş yarışları ara/izle"
kütüphanesi YOK), Testler (CI'da ~150 yeşil run geçmişi), GitHub
Actions (`ci.yml`: Lint→Typecheck→migrations→Test→Build) — hepsi
GERÇEK, ÇALIŞAN ve KORUNACAK durumda (brief §0'ın "mevcut çalışan"
listesiyle birebir örtüşüyor).

## CURRENT RACE ENGINE

`apps/api/src/domain/race/race-engine.ts` + `base-ability.ts` +
`environment.ts` + `jockey-decisions.ts`: deterministik, seed'e bağlı,
segment bazlı simülasyon. R3 davranış hattının DÖRT alanı (Current
Form, Draw/post-position, Track Fit, Carried Weight) gerçek veriye
bağlı; Temperament + gerçek Jockey skill nötr placeholder (bilinen,
dokümante edilmiş bir sonraki adım — brief §23-24'ün "Horse Behavior/
Personality" talebiyle DOĞRUDAN örtüşüyor, aşağıya bkz.). Motor
brief'in istediği `speed/acceleration/stamina/fatigue/position/lane/
heading/pace/overtaking/blocking/sprint/finish` kavramlarının ÇOĞUNU
zaten üretiyor (segment telemetrisinde) — brief §8/§9'un "görsel
sisteme bağla" talebi bu yüzden YENİ veri ÜRETMEYİ değil, ZATEN VAR
OLAN veriyi 3D katmana TAŞIMAYI gerektiriyor.

**Sonuç: KEEP, dokunma.** Brief §1'in "Kesinlikle 3D sistem uğruna
Race Engine mantığını değiştirme" talimatı zaten mevcut mimarinin
doğal sonucu.

## CURRENT 3D SYSTEM

`apps/web/src/features/race-viewer/` (FAZ 6 "Görsel Sunum" — bkz.
dosyanın kendi README.md'si, "basit şekillerle iskelet kur" BİLİNÇLİ
kapsam kararı):

- `RaceScene3D.tsx` (352 satır): `@react-three/fiber` Canvas, pist
  YÜZEYİ tek bir `THREE.InstancedMesh` (tek draw call — brief §31'in
  Instancing talebi BURADA zaten karşılanmış), `<Environment
  preset="sunset">` IBL + yönlü ışık, `@react-three/postprocessing`
  ile Bloom+SSAO, `quality-tier.ts` ile 4 kademeli (low/medium/high/
  ultra) otomatik kalite ayarı (brief §32'nin Graphics Quality
  talebiyle ÖRTÜŞÜYOR).
- `HorseMarker` fonksiyonu: at/jokey `<mesh>` PRIMITIVE (kapsül gövde +
  küre "jokey" başı) — brief §5'in yasakladığı TAM OLARAK bu
  ("SphereGeometry/CapsuleGeometry... production sisteminden çıkar").
  Animasyon YOK (yalnızca `Math.sin` ile hafif bir "bob" sallanması),
  skeleton/rig YOK, ayrı bir Jockey mesh'i YOK.
- `camera-presets.ts`: 4 kamera modu (Pist/Jokey/Son Düzlük/Fotofiniş)
  saf fonksiyonlarla tanımlı — ama seçim MANUEL (kullanıcı HUD'dan
  buton ile seçiyor), brief §17'nin istediği OTOMATİK "Camera
  Director" (race event'e göre otomatik geçiş) YOK.
- `quality-tier.ts`, `track-path.ts`, `timeline-playback.ts`,
  `minimap-projection.ts`, `segment-merge.ts`: saf mantık, iyi test
  edilmiş, KEEP.

**Sonuç: IMPROVE (temel), REPLACE (görsel varlıklar).** Sahne
mimarisi (Canvas/Instancing/Environment/quality-tier/kamera matematiği)
SAĞLAM ve KORUNMALI; yalnızca `HorseMarker`'ın içeriği (primitive
şekiller) gerçek modellerle DEĞİŞTİRİLMELİ — brief §37'nin dosya
mimarisi önerisiyle (HorseEntity/JockeyEntity ayrımı) uyumlu bir
refactor gerekiyor.

## CURRENT ASSETS

`apps/web/public/` dizini **TAMAMEN BOŞ** — hiçbir alt klasör yok
(`find apps/web/public -maxdepth 4 -type d` sıfır sonuç döndürdü).
Hiçbir `.glb`/`.gltf`/`.png`/ses dosyası repo'da YOK. `package.json`'da
GLTF/animasyon/ses kütüphanesi YOK (`useGLTF` hiç import edilmiyor,
`howler`/`tone`/`gsap` gibi paketler kurulu DEĞİL — yalnızca `three`/
`@react-three/fiber`/`@react-three/drei`/`@react-three/postprocessing`
var, ki bunlar zaten GLTF YÜKLEMEYİ DESTEKLER, sadece kullanılmıyor).
Asset manifest sistemi, `ASSET_GUIDE.md`, Asset Interface/Fallback
Placeholder deseni (brief §7) hiçbiri YOK.

**Sonuç: MISSING — TAMAMEN.** Bu, brief'in neredeyse TÜM Phase 1-9'unu
(gerçek at/jokey modelleri, hipodrom çevresi, tribün/seyirci, ses)
BLOKE eden tek gerçek darboğaz (aşağıdaki RISKS bölümüne bkz.).

## CURRENT TESTS

Güçlü ve GERÇEK: domain katmanında olasılıksal alan-denge testleri
(`race-engine-field-balance.spec.ts`, 250+ deneme/senaryo), e2e testler
gerçek NestJS+PostgreSQL'e karşı CI'da çalışıyor, WebSocket e2e testleri
(`realtime.e2e-spec.ts`) gerçek socket.io sunucusuna karşı, frontend
`vitest`+`@testing-library/react` component testleri, saf mantık
dosyaları (`timeline-playback.ts`, `quality-tier.ts`, `track-fit.ts` vb.)
için hem `tsc --noEmit` hem gerçek çalıştırma testleri. CI (`ci.yml`)
Lint→Typecheck→migration→Test→Build sırasıyla ~150 run'lık istikrarlı
bir yeşil geçmişe sahip (bkz. kök `AUDIT_REPORT.md`/`claude/hizli-
bitirme-plani.md` — her push bağımsız olarak built-in tarayıcıyla
doğrulanmış).

**Sonuç: KEEP, brief §40'ın istediği pipeline zaten ÇALIŞIYOR.** Yeni
3D/görsel özellikler eklenince brief §41'in "Visual/Logic Consistency
Test" talebi (Race Engine pozisyonu = Görsel pozisyon vb.) YENİ test
kategorisi olarak eklenmeli — ama altyapı (CI, test runner'lar) hazır.

## MISSING FEATURES (brief bölüm numarasıyla)

- **§5-7 Horse Model / Asset Kuralı:** Gerçek GLB at modeli, PBR
  materyal, renk varyasyonları (Bay/Dark Bay/Chestnut/Black/Gray/
  Roan/Palomino), asset manifest — TAMAMEN YOK.
- **§8-10 Horse Animation:** Animation State Machine (IDLE/WALK/TROT/
  GALLOP/SPRINT/TURN/FATIGUE/FINISH vb.), speed/stamina/fatigue'in
  görsel sisteme bağlanması, secondary animation (yele/kuyruk) —
  TAMAMEN YOK (şu an yalnızca sabit bir sinüs "bob" efekti var).
- **§11 Jockey:** Ayrı jokey modeli/animasyonu (RACE_POSITION/
  LEAN_FORWARD/WHIP/CELEBRATION vb.) — YOK, jokey şu an atın üstünde
  sabit bir küre.
- **§12-13 Hipodrome Environment / Start Gate:** Tribün, seyirci,
  aydınlatma kuleleri, paddock, ahır alanı, start gate açılış
  sekansı — TAMAMEN YOK (şu an yalnızca pist yüzeyi + gökyüzü var).
- **§14 Crowd:** Seyirci sistemi (near-3D/low-poly/billboard katmanlı
  performans stratejisi) — TAMAMEN YOK.
- **§15 VFX:** Toz/parçacık efektleri (start/hızlanma/viraj/sprint/
  finish anlarında) — TAMAMEN YOK.
- **§16 Lighting presets:** Day/Sunset/Cloudy/Night — şu an yalnızca
  sabit `"sunset"` preset'i var, geçiş sistemi YOK.
- **§17 Broadcast Camera Director:** 4 kamera MEVCUT ama event-driven
  otomatik seçim (`START→START_CAMERA`, `OVERTAKE→GROUP_CAMERA` vb.)
  YOK — şu an kullanıcı manuel seçiyor.
- **§18-19 Audio / Commentary:** Audio Manager, at/jokey/çevre/tribün/
  yarış sesleri, spiker abstraction katmanı — TAMAMEN YOK (repo'da
  hiçbir ses dosyası veya ses kütüphanesi yok).
- **§20 HUD zenginleştirme:** `RaceHudProps` şu an yalnızca
  leaderboard/miniMap/zaman/kamera/hız içeriyor — pace/stamina/
  fatigue/mesafe gibi per-horse canlı değerler HUD'a YANSIMIYOR
  (race engine bu veriyi ÜRETİYOR ama WebSocket telemetrisi/HUD bunu
  TAŞIMIYOR).
- **§21 Photo Finish sunumu:** ✅ DÜZELTİLDİ (Grup 1, "Config ayrımı"
  öncesi dilim) — slow-motion + görsel "photo finish" kartı/sonuç sunumu
  artık VAR (bkz. `race-viewer/README.md` "Photo Finish" bölümü).
- **§22 Replay (bağımsız gözatma):** ✅ DÜZELTİLDİ ("Devam et" turu,
  beşinci öz-denetim dilimi) — `apps/web/src/app/replays/page.tsx`
  (kütüphane listesi, `GET /players/:id/recent-races?limit=20`) ve
  `apps/web/src/app/replays/[raceId]/page.tsx` (tekrar/detay ekranı,
  `GET /races/:id/timeline`) artık VAR. Backend uçları zaten HAZIRDI
  (bu bulgunun kendisinin işaret ettiği gibi) — eksik olan yalnızca
  frontend wiring'iydi: `RaceTimelineView` (per-entrant, `entryId`
  anahtarlı) ile `RaceViewer`'ın beklediği `RaceTimeline` (düz
  `segments`/`finalResult`, opak anahtarlı) arasındaki şekil
  uyuşmazlığını çözen saf bir dönüştürücü (`race-viewer/replay-adapter.ts`,
  10/10 gerçek test) eklendi; `RaceViewer`/`RaceHud`'un KENDİSİ
  DEĞİŞTİRİLMEDİ. Kamera açısı seçenekleri (TV/HORSE/JOCKEY/FINISH/
  PHOTO FINISH) canlı izleyiciyle AYNI `RaceHud`'u paylaştığı için ek
  bir taşıma işi OLMADAN otomatik olarak replay'de de çalışır. Brief'in
  açıkça istediği `0.5X` oynatma hızı da bu turda `RaceHud.tsx`
  `SPEED_OPTIONS`'a eklendi (önceden yalnızca `[1, 2, 4]` vardı).
  Dashboard'un "Son Yarış Sonuçları" paneli artık her satırı
  `/replays/[raceId]`'e bağlıyor ve "Tüm yarış geçmişini gör →" linki
  içeriyor; ana navigasyon kartlarına da "Yarış Tekrarları" girişi
  eklendi.
- **§23-24 Behavior/Personality:** R3'ün Temperament alanı hâlâ nötr
  placeholder (zaten bilinen bir sonraki adım); brief'in istediği
  "personality" (CALM/AGGRESSIVE/NERVOUS/vb.) kategorik katmanı YOK.
- **§25 Stable görsel yönetim ekranı:** Ahır VERİSİ (condition/
  training/feed/equipment/health) domain'de VAR (`horse_stats`/
  `horse_health` vb.). KISMEN DÜZELTİLDİ ("Devam et" turu) — `/care`
  ekranı artık VAR: bakım (tımar/su/temizlik/veteriner/nalbant/dinlendir)
  ve besleme (standart/enerji/protein/iyileşme/performans) eylemlerini
  zaten tam çalışır durumdaki `POST /horses/:id/care` ve `/feed`
  uçlarına bağlıyor (bkz. `apps/web/src/app/care/page.tsx` dosya başı
  doc yorumu) — **commit `f3b9850`, CI #154, 2m 44s, TAM YEŞİL
  doğrulandı** (`git fetch` + built-in tarayıcı ile bağımsız
  doğrulama). Hâlâ eksik: antrenman geçmişi görünümü
  (`TrainingSessionRepository`'de sadece `save()` var, okuma metodu
  YOK — ayrı dilim), piyasa değeri tahmini (`calculateMarketValue()`
  domain'de VAR ama hiçbir yerden ÇAĞRILMIYOR — ayrı dilim), Equipment
  (domain kavramı olarak hiç YOK — yeni bir alt sistem gerektirir).
- **§26 Pedigree görselleştirme:** ✅ DÜZELTİLDİ (Grup 1) — Genetics/
  breeding domain hesaplamaları VAR ve ÇALIŞIYOR; ağaç şeklinde
  pedigree UI paneli artık da VAR.
- **§27 Career progression:** NOVICE→CHAMPIONSHIP seviyeleri,
  achievement sistemi — YOK.
- **§35-36 Winner Ceremony / Shareable Result:** Kazanma sonrası
  sunum akışı, paylaşılabilir sonuç görseli — YOK.
- **§45 Asset raporlama sistemi:** Her aşamada AVAILABLE/MISSING/
  REQUIRED/PLACEHOLDER/LICENSE STATUS raporlama süreci — YOK (bu
  raporun kendisi bu sürecin ilk örneği).

## TECHNICAL DEBT

- HUD/telemetri katmanı şu an yalnızca pozisyon+zaman taşıyor; pace/
  stamina/fatigue gibi zaten hesaplanan alanları da taşımak için
  `RaceTelemetryPayload`/`RaceSegmentSnapshot` şemasının genişletilmesi
  gerekecek (kırıcı olmayan, opsiyonel alan eklemesi — düşük risk).
  Bu tam olarak "teknik borç" değil, "henüz taşınmamış veri" — çünkü
  motor zaten üretiyor.
- `camera-presets.ts`'in kendi doc yorumu Fotofiniş/Son Düzlük
  kameralarını "gerçek pist boyutları/perspektif ayarları geldiğinde
  ince ayar gerektirebilir" diye zaten İŞARETLEMİŞ — gerçek 3D pist
  geometrisi (brief §12) eklenince bu kameraların yeniden kalibre
  edilmesi gerekecek.
- Config ayrımı (brief §38) zaten byük ölçüde uygulanıyor
  (`race.config.json`, `quality-tier.ts`'in kendi sabitleri) — yeni
  ANIMATION_CONFIG/CAMERA_CONFIG/AUDIO_CONFIG/VFX_CONFIG dosyaları
  AYNI desenle (magic number yok, JSON+tip) eklenmeli.
- Gerçek borç YOK denecek kadar az — proje FAZ 6'da BİLİNÇLİ olarak
  "iskelet" bırakılmış, gizli bir hata/kısayol değil.

## RISKS

1. **KRİTİK — Asset tedariği (brief §7'nin kendi yasağıyla
   ÇAKIŞIYOR):** Brief §7 açıkça "sahte GLB dosyası oluşturma,
   internetten lisanssız asset alma" diyor. Gerçek, lisanslı at/jokey/
   stadyum/tribün 3D modelleri VE ses dosyaları edinmek ya bir SATIN
   ALMA kararı (Claude'un finansal işlem yapma yasağı nedeniyle
   YAPAMAYACAĞI bir işlem — proje sahibinin kendisinin karar verip
   ödemesi gerekir) ya da proje sahibinin kendi/lisanslı bir kaynaktan
   asset SAĞLAMASI anlamına geliyor. Bu, brief'in Phase 1'den (Horse
   Model) başlayarak NEREDEYSE TÜM görsel/ses fazlarını BLOKE eden tek
   gerçek darboğaz — kod yazarak ÇÖZÜLEMEZ. Bu konu daha önce
   `claude/3d-asset-arastirmasi-at-jokey.md` dokümanında araştırılmıştı
   (proje sahibi ile bu konu zaten bir kez gündeme gelmişti, "Görsel
   Kalite Faz 3" olarak bilinen ERTELENMİŞ madde).
2. **Kapsam büyüklüğü:** Brief 52 bölüm, 4 STAGE (A-D) tanımlıyor —
   kendi ifadesiyle bile "aylar süren" bir kapsam. Tek bir dilimde
   TAMAMLANAMAZ; brief'in KENDİ protokolü (§52) de zaten "yalnızca
   Phase 1 üzerinde çalış" diyor.
3. **Sandbox sınırı (bilinen, tekrarlayan):** Bu geliştirme ortamı
   gerçek bir tarayıcı/GPU çalıştıramıyor — brief §31'in istediği
   gerçek FPS ölçümü, ses dosyası doğrulaması, görsel QA (§50'nin
   "ilk defa gören oyuncu" testi) burada YAPILAMAZ; push+CI+proje
   sahibinin manuel QA'sı gerekiyor (projenin zaten bilinen kısıtı).
4. **Yeni bağımlılıklar:** GLTF animasyon karıştırma
   (`AnimationMixer`/`useAnimations`), ses (`howler` veya native Web
   Audio), parçacık sistemi (`three`'nin kendi `Points`/`InstancedMesh`
   tabanlı VFX'i tercih edilebilir, üçüncü parti paket şart değil) —
   bunlar `apps/web`'in `node_modules`'ını bu sandbox'ta hiç
   KURAMADIĞIMIZ (npm registry erişimi yok) bilinen kısıtla birleşince,
   yeni paket eklenen HER dosya yalnızca `ts.transpileModule` ile
   sözdizimi kontrolünden geçirilebilecek — gerçek doğrulama yine
   push+CI'da olacak (projenin zaten yerleşik metodolojisi).

## IMPLEMENTATION ORDER (önerilen)

Brief'in kendi STAGE A/B/C/D sıralamasını, asset-bağımlılığına göre
İKİYE ayırarak öneriyorum — böylece asset kararı beklenirken kod-only
iş DURMAZ:

**Grup 1 — Asset gerektirmeyen, hemen başlanabilir (kod + config):**
1. Asset Interface + GLB Loader + Asset Manifest + `ASSET_GUIDE.md`
   iskeleti (brief §7) — gerçek dosya OLMADAN da yazılabilir, ileride
   asset gelince "tak-çıkar" olacak şekilde.
2. Telemetri şemasının genişletilmesi (pace/stamina/fatigue/mesafe
   HUD'a taşınması) — motor zaten üretiyor, yalnızca taşıma.
3. Camera Director (event-driven otomatik kamera seçimi) — mevcut 4
   modun ÜZERİNE, race event'lerine (start/overtake/final_200/finish)
   göre otomatik geçiş mantığı, saf fonksiyon olarak.
4. Photo Finish sunumu (slow-motion + sonuç kartı) — mevcut veriyle
   (finish times zaten var), yeni asset gerekmez.
5. Audio Manager + VFX Manager İSKELETİ — state-driven event hook'ları
   (`RACE_START`, `OVERTAKE`, `FINAL_200` vb.) ile, ama gerçek ses/
   parçacık dosyası gelene kadar "no-op" veya three.js'in kendi
   ilkel parçacık sistemiyle (toz için gerçek doku gerektirmeyen basit
   `Points`) çalışacak şekilde — böylece mimari brief'e UYGUN olur,
   sahte dosya İCAT EDİLMEZ.
6. Pedigree görselleştirme (ağaç UI) — mevcut genetics domain verisiyle,
   3D asset gerekmez.
7. Config ayrımı: `ANIMATION_CONFIG`/`CAMERA_CONFIG`/`AUDIO_CONFIG`/
   `VFX_CONFIG` dosyaları.

**Grup 2 — Gerçek 3D/ses asset kararı BEKLEYEN (proje sahibinin
girdisi ŞART):**
8. Gerçek Horse/Jockey GLB modelleri + animasyon state machine +
   secondary animation.
9. Hipodrom çevresi (tribün/seyirci/aydınlatma kuleleri/paddock/ahır).
10. Crowd sistemi (gerçek doku/model gerektirir).
11. Gerçek ses dosyaları (at/jokey/çevre/tribün/spiker).
12. Winner Ceremony/Shareable Result görselleri (gerçek at/jokey
    render'ına bağlı olduğundan Grup 2'nin sonucu).

Career/Stable/Economy derinliği (brief §25-28) ayrıca Master Plan
Phase B-F kapsamıyla ÖRTÜŞÜYOR — zaten bilinen, ayrı ve büyük bir
kapsam, bu implementasyon sırasının dışında tutuldu.
