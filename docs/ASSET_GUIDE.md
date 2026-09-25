# ASSET_GUIDE — At Sevdalısı 3D/Ses Varlık Rehberi

Bu belge, **Master Development Brief**'in ("MASTER DEVELOPMENT BRIEF:
PROFESSIONAL 3D RACE EXPERIENCE + GAME SYSTEMS") istediği profesyonel
görsel/işitsel kaliteye ulaşmak için oyunun ihtiyaç duyduğu HER gerçek
varlığı (3D model, doku, ses dosyası) tek bir yerde listeler. Kaynak
gerçeği (source of truth) kod tarafında
`apps/web/src/features/race-viewer/assets/asset-manifest.ts`'teki
`ASSET_MANIFEST` sabitidir — bu belge onun İNSAN-OKUNABİLİR halidir,
biçim brief §7'nin kendi örneğini takip eder (`HORSE_MODEL_REQUIRED —
Realistic Thoroughbred horse GLB, Gallop animation, Compatible skeleton`).

## Durum (2026-09-25 itibarıyla)

**Aşağıdaki listedeki HİÇBİR varlık şu an repoda YOKTUR.**
`apps/web/public/` klasörü boştur (yalnızca `manifest.json` PWA dosyası
var). Bu BİLİNÇLİ bir kararın sonucudur: proje sahibi, gerçek varlık
kaynağı seçimi (satın alma / lisanslı paket / özel üretim) konusunda
**"şimdilik erteleyelim"** demiştir (bkz.
`docs/IMPLEMENTATION_PLAN_MASTER_BRIEF.md`'nin "Grup 2" bölümü). Bu
yüzden görsel/ses sistemleri (`GltfAssetLoader.tsx`, `audio-manager.ts`
vb.) BİLEREK "dosya yoksa çökmeden ilkel bir fallback'e düş" şeklinde
tasarlanmıştır — asset'ler eklendiğinde KOD DEĞİŞİKLİĞİ GEREKMEZ,
sadece aşağıdaki yollara doğru dosyalar KONULUR.

**Bu belge veya kod, hiçbir sahte/placeholder `.glb`/ses dosyası
İÇERMEZ ve İÇERMEMELİDİR** — brief'in kendi kuralı ("never fabricate
fake GLB files or use unlicensed assets") burada mutlak bir çizgidir.

## Genel kurallar (TÜM varlıklar için)

- **Lisans zorunlu:** her varlığın ticari kullanıma uygun bir lisansı
  (satın alınmış, CC0, veya özel üretim/sözleşmeli) OLMALIDIR. Lisans
  belgesi/faturası `docs/licenses/` altında (bu klasör henüz yok, ilk
  gerçek varlık eklendiğinde AÇILACAK) saklanmalıdır — tam takip süreci
  için bkz. `docs/ASSET_LICENSES.md`.
- **Dosya adı ve yol sabit:** aşağıdaki `expectedPath` değerleri
  `asset-manifest.ts` ile BİREBİR eşleşir. Farklı bir dosya adı
  kullanmak istenirse ÖNCE `asset-manifest.ts` güncellenmelidir.
- **Performans bütçesi:** brief §46'nın mobil/masaüstü kalite
  kademeleri düşünülerek, 3D modeller mobil-dostu poligon sayısında
  (at+jokey birleşik ≤ 15.000 üçgen önerilir) ve dokular sıkıştırılmış
  formatta (KTX2/Basis) olmalıdır — bu rakam bir KOD KISITI DEĞİLDİR,
  bir ÖNERİDİR; gerçek bütçe Faz 6 "Config ayrımı"nda `vfx.config.json`
  benzeri bir dosyaya taşınabilir.
- **Mixamo YASAK ("REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §2, bu
  turda EKLENDİ):** at/jokey animasyon klipleri Mixamo'nun jenerik
  insan/biped rig kütüphanesinden KULLANILAMAZ — brief'in KENDİ kuralı,
  Mixamo'nun at gibi dört ayaklı bir iskelet için üretilmediği VE
  jenerik insansı animasyonların bir jokeyin gerçekçi RACE_POSITION/
  LEAN_FORWARD duruşunu YANSITMADIĞI gerekçesiyle. Animasyonlar ya
  satın alınan modelle birlikte GELMELİ ya da özel olarak (rig'e özgü)
  ÜRETİLMELİDİR.
- **LOD sistemi (brief §15, bu turda EKLENDİ):** her 3D model (at,
  jokey, hipodrom) 4 seviyeli bir Level-of-Detail zincirine sahip
  OLMALIDIR — `LOD0` (tam detay, yakın kamera), `LOD1` (orta mesafe,
  ~%50 poligon), `LOD2` (uzak, ~%20 poligon), `LOD3` (çok uzak/billboard
  eşiği). Bu bir KOD KISITI DEĞİLDİR (henüz `asset-manifest.ts`'te LOD
  seviyeleri için AYRI alan YOK — tek bir `expectedPath` her varlık için
  yeterli, LOD geçişleri Three.js `LOD` nesnesiyle RUNTIME'da ele
  alınacaktır) — bir varlık SEÇİM/ÜRETİM kriteridir: seçilen/üretilen
  model paketi bu 4 seviyeyi (veya Blender'da bunlardan türetilebilecek
  temiz bir topolojiyi) İÇERMELİDİR.
- **Model optimizasyon kontrol listesi (brief §13, bu turda EKLENDİ):**
  bir 3D model `apps/web/public/`e KONULMADAN ÖNCE şu Blender pipeline
  adımlarından (brief §14) geçmiş OLMALIDIR — IMPORT → CLEAN (kullanılmayan
  vertex/malzeme temizliği) → OPTIMIZE (poligon bütçesi kontrolü) →
  MATERIAL CHECK (PBR malzeme doğruluğu) → TEXTURE CHECK (sıkıştırma/
  çözünürlük) → RIG CHECK (iskelet bütünlüğü) → ANIMATION CHECK (klip
  bütünlüğü, aşağıdaki minimum listeler) → LOD (yukarıdaki 4 seviye) →
  SCALE CHECK (gerçek dünya birimleriyle tutarlılık) → ORIGIN/PIVOT
  CHECK (doğru döndürme merkezi) → GLB EXPORT → THREE.JS TEST (gerçek
  tarayıcıda render doğrulaması, bu sandbox'ta YAPILAMAZ — bkz. bu
  belgenin sonundaki "Bir varlık eklendiğinde yapılması gerekenler").
  Bu kontrol listesi `assets/README.md`'de de (KISA biçimde) tekrarlanır.

## Gerekli varlıklar

### HORSE_MODEL_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/horse.glb`
- **Gereksinim:** Gerçekçi safkan (thoroughbred) at modeli.
  `JOCKEY_MODEL_REQUIRED` ile UYUMLU bir iskelete (skeleton) sahip
  olmalı (jokeyin ata binmiş görünmesi için). **Mixamo KULLANILAMAZ**
  (yukarıdaki genel kural). "REALISTIC 3D ASSET & AUDIO PRODUCTION
  BRIEF" §2/§3 (bu turda GENİŞLETİLDİ) — animasyon klipleri:
  - **Minimum (ZORUNLU):** `IDLE`, `WALK`, `TROT`, `CANTER`, `GALLOP`,
    `FAST_GALLOP`, `SPRINT`, `ACCELERATE`, `DECELERATE`, `TURN_LEFT`,
    `TURN_RIGHT`, `STOP`, `FINISH`.
  - **Tercih edilen (varsa DAHA İYİ, ZORUNLU DEĞİL):`START_REACTION`,
    `FATIGUE`, `BREATHING`, `COOLDOWN`, `CELEBRATION`.
  - **Renk varyasyonları (brief §6, GELECEK bir uzantı noktası olarak
    NOT EDİLDİ, bu turda İMPLEMENTE EDİLMEDİ):** `BAY`, `DARK_BAY`,
    `CHESTNUT`, `BLACK`, `GRAY`, `ROAN`, `PALOMINO`. Bu, bir DOKU/
    MALZEME varyant sistemi gerektirir (ör. tek bir base mesh + renk
    başına ayrı bir albedo doku VEYA runtime'da malzeme rengi
    değiştirme) — GERÇEK bir base model OLMADAN bu sistemin kod
    tasarımı SPEKÜLATİF kalır, bu yüzden bilinçli olarak
    ERTELENMİŞTİR; ilk gerçek at modeli seçildiğinde/satın alındığında
    bu varyasyonların o modelin malzeme yapısına (tek doku mu, çoklu
    materyal slotu mu) göre TASARLANMASI gerekir.
- **Fallback (dosya yoksa):** `RaceScene3D.tsx`'teki mevcut kapsül+küre
  `HorseMarker` ilkel şekli.

### JOCKEY_MODEL_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/jockey.glb`
- **Gereksinim:** At modeliyle uyumlu iskelete sahip jokey modeli.
  **Mixamo KULLANILAMAZ** (yukarıdaki genel kural). "REALISTIC 3D ASSET
  & AUDIO PRODUCTION BRIEF" §7 (bu turda GENİŞLETİLDİ) — animasyon
  klipleri: `RACE_POSITION`, `LEAN_FORWARD`, `REINS`, `GALLOP`,
  `SPRINT`, `TURN_LEFT`, `TURN_RIGHT`, `FINISH`, `CELEBRATION`.
- **Fallback:** Şu an ayrı bir jokey görseli yok (Grup 2 kapsamı).

### HIPPODROME_ENVIRONMENT_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/hippodrome-environment.glb`
- **Gereksinim:** "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §8 (bu
  turda GENİŞLETİLDİ) — brief'in tam hipodrom bölüm listesi:
  `MAIN_TRACK`, `GRASS_TRACK`, `DIRT_TRACK`, `GRANDSTAND`, `VIP_AREA`,
  `PADDOCK`, `JUDGE_TOWER`, `PHOTO_FINISH_AREA`, `ANNOUNCER_AREA`,
  `LIGHTING`, `ADVERTISING_BOARDS`, `SERVICE_AREAS`. `START_GATE`
  brief'in listesinde bu sahnenin BİR PARÇASI olarak geçse de, kodda
  KASITLI OLARAK AYRI bir varlık (`START_GATE_MODEL_REQUIRED`, aşağı
  bkz.) olarak tutulur — kendi AÇILMA animasyonu OLDUĞUNDAN ayrı
  yönetilmesi Three.js entegrasyonu için daha PRATİKTİR. `GRANDSTAND`
  bölümü brief §9'un "Binlerce seyirciyi tek tek yüksek polygon model
  olarak KULLANMA" uyarısına tabidir — gerçek kalabalık render'ı
  `CROWD_BILLBOARD_TEXTURE_REQUIRED` (instanced billboard, aşağı bkz.)
  İLE sağlanır, bu modelin KENDİSİ sadece BOŞ tribün YAPISINI içerir.
- **Fallback:** Mevcut instanced pist zemini + `@react-three/drei`
  `Environment preset="sunset"` arka planı.

### START_GATE_MODEL_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/start-gate.glb`
- **Gereksinim:** Yarış başlangıç kapıları (starting gate) modeli,
  açılma animasyonu. "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §10
  (bu turda EKLENDİ) — modelin/animasyonun desteklemesi gereken
  FONKSİYONEL akış: `HORSES ENTER` → `GATE ASSIGNMENT` → `GATES CLOSE`
  → `READY` → `START SIGNAL` (bkz. `START_SIGNAL_SFX_REQUIRED` — kapı
  MEKANİZMASINDAN AYRI bir ses) → `GATES OPEN` (bkz.
  `GATE_OPEN_SFX_REQUIRED`) → `RACE`. Bu akış modelin KAÇ ayrı animasyon
  klibi (ör. `CLOSE`/`OPEN`) İÇERMESİ gerektiğini belirler — minimum
  bir `OPEN` klibi ZORUNLU, `CLOSE`/`READY` (bekleme titremesi vb.)
  TERCİH EDİLİR.
- **Fallback:** Başlangıç çizgisinde görsel bir kapı yok (Grup 2 kapsamı).

### CROWD_BILLBOARD_TEXTURE_REQUIRED

- **Tür:** Doku (`.ktx2`)
- **Yol:** `apps/web/public/textures/crowd-billboard.ktx2`
- **Gereksinim:** Tribün kalabalığı için instanced billboard dokusu
  (sıkıştırılmış KTX2/Basis formatı, mobil kademe uyumlu).
- **Fallback:** Tribünde görsel bir kalabalık yok (Grup 2 kapsamı).

### HOOFBEAT_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/hoofbeat-loop.mp3`
- **Gereksinim:** Nal sesi döngüsü (seamless loop), hıza göre
  pitch/hacim ayarlanabilir olacak şekilde kısa ve temiz.
- **Fallback:** `AudioManager`'ın sessiz no-op modu (ses yok, hata yok).

### CROWD_AMBIENCE_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/crowd-ambience-loop.mp3`
- **Gereksinim:** Sürekli tribün kalabalığı arka plan sesi (loop).
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### RACE_FINISH_FANFARE_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/finish-fanfare.mp3`
- **Gereksinim:** Yarış bitişinde çalınacak kısa fanfar/kazanma sesi.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### RACE_BACKGROUND_MUSIC_REQUIRED

- **Tür:** Müzik (`.mp3`)
- **Yol:** `apps/web/public/audio/race-theme.mp3`
- **Gereksinim:** Yarış öncesi/sırası çalınacak enstrümantal tema müziği.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### COMMENTARY_VOICE_REQUIRED

- **Tür:** Ses (`.mp3`, KLASÖR — tekil dosya değil)
- **Yol:** `apps/web/public/audio/commentary/`
- **Gereksinim:** Brief §31 "Commentary" soyutlaması için önceden
  kaydedilmiş veya TTS ile üretilmiş anlatım klipleri. "REALISTIC 3D
  ASSET & AUDIO PRODUCTION BRIEF" §22 (bu turda EKLENDİ — DAHA ÖNCE
  "tam liste ileride eşleştirilecektir" olarak ERTELENMİŞTİ) TAM klip
  listesini VE dosya adı eşlemesini artık `audio-manager.ts`'teki
  `COMMENTARY_LINE_FILENAMES` sabiti BELİRLER (bkz. o dosyanın
  `CommentaryMoment` tipi/`playCommentaryForMoment` metodu):

  | Moment | Beklenen dosya adı |
  |---|---|
  | `race_start` | `race-start.mp3` |
  | `overtake` | `overtake.mp3` |
  | `leader_change` | `leader-change.mp3` |
  | `final_400` | `final-400.mp3` |
  | `final_200` | `final-200.mp3` |
  | `final_100` | `final-100.mp3` |
  | `sprint` | `sprint.mp3` |
  | `finish` | `finish.mp3` |
  | `winner` | `winner.mp3` |

  Bu dosya adları `COMMENTARY_VOICE_REQUIRED.expectedPath` klasörü
  İÇİNDE aranır (ör. tam yol `apps/web/public/audio/commentary/race-start.mp3`).
  `playCommentaryLine(fileName)` (serbest metin dosya adı) HÂLÂ mevcuttur
  ve geriye dönük UYUMLUDUR — `playCommentaryForMoment(moment)` bunun
  ÜZERİNE inşa edilmiş, TİP-GÜVENLİ bir kısayoldur (çağıran keyfi bir
  string yerine `CommentaryMoment` union'ından seçim yapar, yazım hatası
  DERLEME ZAMANINDA yakalanır).
- **Fallback:** `AudioManager`'ın sessiz no-op modu — anlatım yok, HUD
  metinsel açıklamalarla (`RaceExplanation`, zaten mevcut) yetinir.

Faz 2/4 hata düzeltmesi (bu turda EKLENDİ) — brief §31'in "Architecture"
listesindeki 11 ses kategorisinden `audio-manager.ts`'in daha önce
karşılığı olmayan beşi:

### GATE_OPEN_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/gate-open.mp3`
- **Gereksinim:** Start kapılarının açılma anı sesi, bir seferlik (döngüsüz).
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### HORSE_BREATHING_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/horse-breathing-loop.mp3`
- **Gereksinim:** At nefesi döngüsü (seamless loop), yorgunluğa (fatigue)
  göre hacim ayarlanabilir olacak şekilde kısa ve temiz.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### WIND_AMBIENCE_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/wind-ambience-loop.mp3`
- **Gereksinim:** Sürekli rüzgar arka plan sesi (loop).
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### OVERTAKE_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/overtake.mp3`
- **Gereksinim:** Bir atın diğerini geçtiği anda çalınacak kısa SFX, bir
  seferlik (döngüsüz).
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### WINNER_CELEBRATION_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/winner-celebration.mp3`
- **Gereksinim:** Kazanan kesinleştiğinde çalınacak kutlama sesi —
  `RACE_FINISH_FANFARE_REQUIRED`den KASITLI OLARAK AYRI ("finish" yarış
  çizgisini geçme anı, "winner" kazananın kesinleşme anıdır).
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

"REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §17-20 (bu turda EKLENDİ) —
brief'in istediği DAHA GRANÜLER ses kategorileri: yüzeye göre nal sesi
(§18, `RaceSurface` ZATEN VAR OLAN gerçek bir domain alanı — races.surface),
ayrı at vokalizasyonları (§17), ayrık start sinyali + kademeli kalabalık
durumları (§19/§20).

### START_SIGNAL_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/start-signal.mp3`
- **Gereksinim:** Kapılar açılmadan HEMEN ÖNCE çalınan hazır-ol düdüğü/sinyali,
  `GATE_OPEN_SFX_REQUIRED`den (kapı mekanizması sesi) KASITLI OLARAK AYRI,
  bir seferlik (döngüsüz).
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### STADIUM_AMBIENT_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/stadium-ambient-loop.mp3`
- **Gereksinim:** Genel stadyum atmosferi (loop) — `CROWD_AMBIENCE_SFX_REQUIRED`den
  (kalabalık SESİ) KASITLI OLARAK AYRI: hoparlör hışırtısı/uzak mekanik
  gürültü gibi kalabalıktan BAĞIMSIZ yapısal ortam sesi.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### CROWD_CHEERING_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/crowd-cheering.mp3`
- **Gereksinim:** Kazanan kesinleştiği andaki kalabalık tezahürat patlaması,
  bir seferlik (döngüsüz) — `WINNER_CELEBRATION_SFX_REQUIRED` ile BİRLİKTE çalar.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### CROWD_EXCITED_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/crowd-excited-loop.mp3`
- **Gereksinim:** Final düzlükte `CROWD_AMBIENCE_SFX_REQUIRED`in YERİNİ alan,
  yükselmiş gerilim/heyecan seviyesindeki sürekli kalabalık sesi (loop).
- **Fallback:** `AudioManager`'ın sessiz no-op modu (ambience mevcutsa OLDUĞU
  GİBİ çalmaya devam eder, kesintiye uğramaz).

### HORSE_SNORT_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/horse-snort.mp3`
- **Gereksinim:** At burun/horlama sesi, bir seferlik (döngüsüz) — çağıranın
  (ör. gelecekteki rastgele/anlatımsal tetikleyici) kararıyla çalınır.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### HORSE_NEIGH_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/horse-neigh.mp3`
- **Gereksinim:** At kişneme sesi, bir seferlik (döngüsüz) — çağıranın
  kararıyla çalınır.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### HORSE_MOVEMENT_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/horse-movement.mp3`
- **Gereksinim:** At vücudu/koşum takımı genel hareket sesi, bir seferlik
  (döngüsüz) — çağıranın kararıyla çalınır.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### HOOF_GRASS_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/hoof-grass-loop.mp3`
- **Gereksinim:** Çim (grass) pist yüzeyine özel nal sesi döngüsü —
  `RaceSurface` `"grass"` iken `HOOFBEAT_SFX_REQUIRED` YERİNE kullanılır.
- **Fallback:** `AudioManager`'ın sessiz no-op modu; asset yoksa jenerik
  `HOOFBEAT_SFX_REQUIRED`e DÜŞÜLMEZ (o da eksik olabilir) — sessiz kalır.

### HOOF_DIRT_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/hoof-dirt-loop.mp3`
- **Gereksinim:** Toprak (dirt) pist yüzeyine özel nal sesi döngüsü —
  `RaceSurface` `"dirt"` iken kullanılır.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

### HOOF_SYNTHETIC_SFX_REQUIRED

- **Tür:** Ses efekti (`.mp3`)
- **Yol:** `apps/web/public/audio/hoof-synthetic-loop.mp3`
- **Gereksinim:** Sentetik pist yüzeyine özel nal sesi döngüsü —
  `RaceSurface` `"synthetic"` iken kullanılır.
- **Fallback:** `AudioManager`'ın sessiz no-op modu.

## Bir varlık eklendiğinde yapılması gerekenler

1. Dosyayı yukarıdaki TAM yola koy (`apps/web/public/...`).
2. `asset-manifest.ts`'te İLGİLİ SATIRA DOKUNMA — yol zaten doğru
   tanımlı, kod OTOMATİK olarak yeni dosyayı bulacaktır (`GltfAssetLoader`
   3D modeller için, `AudioManager` sesler için).
3. Lisans belgesini `docs/licenses/<asset-id>.md` (veya fatura/sözleşme
   dosyası) olarak sakla.
4. Tarayıcıda manuel QA yap — bu sandbox WebGL/ses render edemez, gerçek
   görsel doğrulama HER ZAMAN proje sahibinin gözüyle yapılmalıdır (bkz.
   `apps/web/src/features/race-viewer/README.md`'nin doğrulama kısıtı
   bölümü).
