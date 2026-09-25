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
  gerçek varlık eklendiğinde AÇILACAK) saklanmalıdır.
- **Dosya adı ve yol sabit:** aşağıdaki `expectedPath` değerleri
  `asset-manifest.ts` ile BİREBİR eşleşir. Farklı bir dosya adı
  kullanmak istenirse ÖNCE `asset-manifest.ts` güncellenmelidir.
- **Performans bütçesi:** brief §46'nın mobil/masaüstü kalite
  kademeleri düşünülerek, 3D modeller mobil-dostu poligon sayısında
  (at+jokey birleşik ≤ 15.000 üçgen önerilir) ve dokular sıkıştırılmış
  formatta (KTX2/Basis) olmalıdır — bu rakam bir KOD KISITI DEĞİLDİR,
  bir ÖNERİDİR; gerçek bütçe Faz 6 "Config ayrımı"nda `vfx.config.json`
  benzeri bir dosyaya taşınabilir.

## Gerekli varlıklar

### HORSE_MODEL_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/horse.glb`
- **Gereksinim:** Gerçekçi safkan (thoroughbred) at modeli. Gallop,
  Trot, Idle animasyon klipleri İÇERMELİDİR. `JOCKEY_MODEL_REQUIRED`
  ile UYUMLU bir iskelete (skeleton) sahip olmalı (jokeyin ata binmiş
  görünmesi için).
- **Fallback (dosya yoksa):** `RaceScene3D.tsx`'teki mevcut kapsül+küre
  `HorseMarker` ilkel şekli.

### JOCKEY_MODEL_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/jockey.glb`
- **Gereksinim:** At modeliyle uyumlu iskelete sahip jokey modeli,
  oturma ve kamçı sallama animasyon klipleri.
- **Fallback:** Şu an ayrı bir jokey görseli yok (Grup 2 kapsamı).

### HIPPODROME_ENVIRONMENT_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/hippodrome-environment.glb`
- **Gereksinim:** Tribün, pist çevresi, paddock alanı içeren hipodrom
  sahne modeli.
- **Fallback:** Mevcut instanced pist zemini + `@react-three/drei`
  `Environment preset="sunset"` arka planı.

### START_GATE_MODEL_REQUIRED

- **Tür:** 3D model (`.glb`)
- **Yol:** `apps/web/public/models/start-gate.glb`
- **Gereksinim:** Yarış başlangıç kapıları (starting gate) modeli,
  açılma animasyonu.
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
  kaydedilmiş veya TTS ile üretilmiş anlatım klipleri (ör. "ve start
  veriliyor", "kafa kafaya bir bitiş!", "kazanan X!"). Birden çok klip
  beklenir, tam liste ileride `audio-manager.ts`'in event tipleriyle
  eşleştirilecektir.
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
