# Görsel Gerçekçilik Denetimi — Faz A (10.10.2026)

Kaynak: "AT SEVDALISI — Master Visual Realism & Game Quality Implementation
Brief". Bu belge brief'in Faz A çıktısıdır: mevcut durum, ölçümler, önem
sırasına göre sorunlar, eksik varlıklar ve uygulama planı. Sonraki fazlar
sonuçlarını §7'ye ekler.

> Not: brief'te anılan "gerçekçi hipodrom referans görseli" bu çalışmaya
> ulaşmadı. Hedef, brief'in yazılı tarifinden çıkarıldı.

## 1. Yöntem ve ölçüm sınırları

- Uygulama yerelde geliştirme modunda (`next dev` + `nest start`) koşturuldu;
  Playwright + Chromium, **yazılımsal GPU (SwiftShader)**.
- **Kare hızı (FPS) bu ortamda anlamlı değildir**: SwiftShader GPU'yu CPU'da
  taklit eder, sayılar gerçek cihazdan kat kat düşüktür. Yalnızca öncesi/
  sonrası karşılaştırma için kaydedildi; "oyun X FPS'te koşar" iddiası
  YAPILMAZ.
- Donanımdan bağımsız ölçüm: sayfaya enjekte edilen bir kanca WebGL
  `drawElements/drawArrays(+Instanced)` çağrılarını sayar → **kare başına
  çizim çağrısı** ve **kare başına üçgen** (gölge ve ek geçişler dahil).
  Betik: oturum karalama alanında `visual-capture.mjs` (depoya girmez).
- Kalite tercihi ölçümde sabit **"Orta"** (otomatik düşürme ölçümü bozmasın).
- Ekran boyutları: masaüstü 1440×900, mobil 390×844 (dokunmatik).

## 2. Mevcut mimari (özet)

| Katman | Durum |
|---|---|
| Yığın | Next 16 + React 19, R3F 9.8.1, drei 10.7.9, three 0.169, postprocessing 3.1.3 |
| Sahneler | Ana sayfa vitrini (`features/home-scene`, YALNIZCA misafir görür — oyuncu `/stable`a yönlenir, CLAUDE.md (68b)); ahır (`StableScene3D`); yarış (`RaceScene3D` ← `RaceViewer` / `LiveRaceViewer` / `InteractiveRaceViewer`) |
| Ortak çevre | `HippodromeSurroundings` (çim, pist, korkuluk, tribün + kalabalık, kuleler, ağaçlar, şehir silueti) |
| At + jokey | `HorseAvatar3D`: GLB varsa bağlar (`model-fit`, klip rolleri), yoksa prosedürel `HorseModel` |
| Varlık hattı | `asset-manifest.ts` (beklenen yol + lisans alanı), HEAD yoklaması, `GltfAssetLoader`, `PlaceholderBadge` |
| Işık | drei `Sky` (shader) + `Lightformer` ortamı; HDRI dosyası varsa o |
| Kalite | `useQualityTier` (Otomatik/Düşük/Orta/Yüksek/Ultra) + `SceneQualityMonitor` |
| Veri | At paneli `GET /horses?ownerId=` (sunucu); sahne sonuç BELİRLEMEZ, motor sunucuda |

## 3. Başlangıç ölçümleri (öncesi)

| Sayfa | Çizim çağrısı/kare | Üçgen/kare | SwiftShader FPS* |
|---|---|---|---|
| Ana sayfa (misafir) masaüstü | 153 | 1.311.386 | 0.6 |
| Ana sayfa (misafir) mobil | 149 | 1.311.341 | 1.2 |
| Ahır masaüstü | 508 | 91.732 | 1.5 |
| Ahır mobil | 462 | 91.025 | 3.7 |
| Yarış (demo) masaüstü | 358 | 690.145 | 0.8 |
| Yarış (demo) mobil | 302 | 633.736 | 1.7 |

\* Yalnızca karşılaştırma içindir (bkz. §1).

Konsol (her sayfada): eksik her varlık için `404 Failed to load resource`
(HEAD yoklaması). Yarış mobilde: **`Maximum update depth exceeded`** (aşağıda P0-3).

## 4. Sorunlar — önem sırasıyla

### P0 — oyuncunun ilk gördüğünü bozan / hata

1. **Gerçek 3D varlık yok.** Beklenen ama bulunmayan dosyalar (manifest):
   `models/horse.glb`, `models/jockey.glb`, `models/hippodrome-environment.glb`,
   `models/stable-environment.glb`, `models/start-gate.glb`,
   `hdri/golden-hour.hdr`. Bütün sahneler prosedürel geometridir. Bu
   ortamın ağ politikası varlık kaynaklarını (Poly Haven, ambientCG,
   Sketchfab, Quaternius) **engelliyor** — lisanslı dosya buradan
   indirilemedi. Ayrıntı ve aday kaynaklar §6.
2. **Duyuru şeridi sahneleri ekranın altına itiyor.** Her canlı duyuru tam
   genişlikte bir kart (`maxLive: 5`); 5 duyuruda ~360 px. Ana sayfa,
   ahır ve yarış ekranında 3D sahne katın altında kalıyor.
3. **Yavaş cihazda React "Maximum update depth exceeded".** Kamera
   yönetmeni efekti (`RaceViewer`/`LiveRaceViewer`) her HUD güncellemesinde
   mod DEĞİŞMESE de `setCameraMode` çağırıyor; kare süresi uzun olunca
   her işleme pasif bir güncelleme düşüyor ve React 50 ardışıkta uyarır.
   Gerçek iş: her HUD adımında boşa ikinci bir render.
4. **Mobil yarış ekranında arayüz sahneyi örtüyor** (kamera sekmeleri,
   kalite, ses, hipodrom seçici ve sıralama paneli 390 px genişlikte
   sahnenin çoğunu kapatıyor).
5. **Misafir ana sayfasında at yok.** Vitrin kameraları ("At", "Yakın
   Çekim", "Jokey") ata göre konumlanıyor ama misafirin atı olmadığı için
   boş pisti gösteriyor. Ana sayfayı yalnızca misafir gördüğünden (oyuncu
   ahıra yönlenir) ilk izlenim atsız bir hipodrom.

### P1 — gerçekçilik ve kullanılabilirlik

6. **At modeli kaba.** Kapsül gövde + silindir bacak; bacaklar diz/bilek
   bükmeden tek parça sallanıyor; eyer, üzengi, dizgin, yular yok; jokey
   ilkel şekillerden. Ahırda yakın kamerada at "kütük" gibi görünüyor.
7. **Zemin ve pist dokusuz.** Çim tek renk düzlem, kum pist yalnızca köşe
   rengi titreşimi; çim biçme şeritleri, pist izleri, kenar geçişi yok →
   "düz renk" görüntü. Gökyüzü fazla beyaz/soluk.
8. **Yarış "Pist Kamerası" ışık direğinin arkasında kalabiliyor** (kadrajın
   önünde kalın gri sütun).
9. **Ahır kamerası dar ekranda ata çok yakın** (sabit 42° görüş açısı;
   telefonda yatay kapsam daralıyor, at ekrana sığmıyor).
10. **PLACEHOLDER rozeti oyuncuya teknik dosya yolları gösteriyor** ve
    mobilde Bakım/Ekipman düğmelerinin altına giriyor.
11. **Konsol gürültüsü**: eksik varlık başına 404 (HEAD yoklaması).
12. **Ana sayfa kare başına 1,3 milyon üçgen** (yarışın ~2 katı): kalabalık
    + gölge haritası + temas gölgesinin (ContactShadows) her karede sahneyi
    yeniden çizmesi. Ahırda 508 çizim çağrısı (çok sayıda küçük parça).

### P2 — brief ile sahibinin önceki kararları

13. Brief "ana sayfada at bilgi paneli + YARIŞA KATIL/AHIR" tarif ediyor;
    08.10.2026'da sahibinin kararıyla oyuncunun ana sayfası **ahırdır**
    (CLAUDE.md (68b)). Panel ve düğmeler `HomeHero`da duruyor ama yalnızca
    misafir görüyor (misafirde at yok). Karar değiştirilmedi; §5'te soru.
14. Brief menüde ayrı "Bakım" istiyor; 08.10.2026'da bakım ve ekipman
    ahırın içine alındı (CLAUDE.md (63)). Korunuyor.
15. Brief'in "Ahır görünümü" kamerası: iç sahadaki ahır sahibinin kararıyla
    kaldırıldı (ahır ayrı mekân). Vitrinde bu çekim yok; ahır `/stable`ta.

## 5. Uygulama planı (küçük, doğrulanabilir dilimler)

Hiçbiri sunucu, API, veritabanı, motor ya da para yoluna dokunmaz. Dosya
uydurulmaz: dokular kodda (`<canvas>`) üretilir, prosedürel görüntü
PLACEHOLDER olarak işaretli kalır.

- **B1 — hata + düzen (en yüksek etki, düşük risk):** kamera yönetmeni
  yalnızca mod DEĞİŞİNCE güncellesin (P0-3); duyuru şeridi tek satır +
  "N duyuru daha" ile açılır (P0-2); rozet üretimde yolsuz kısa metin,
  geliştirmede yol listesi + konsol bilgisi (P1-10); varlık varlığı tek
  JSON uçtan (`/asset-availability`) — 404 gürültüsü biter (P1-11).
- **B2 — zemin/pist/gökyüzü:** prosedürel çim dokusu (biçme şeritleri +
  gürültü), kum pist dokusu (tırmık izleri, kenar koyulaşması), iç/dış
  pist kenarında çim-kum geçişi, gökyüzü ton ayarı (P1-7).
- **B3 — performans:** temas gölgesi statik sahnede tek sefer/düşük sıklık,
  ahır parçalarını birleştirme (P1-12).
- **C1 — at:** eklemli bacaklar (omuz/diz/bilek, dörtnal döngüsünde gerçek
  fazlar), daha doğru gövde/boyun/baş silueti, eyer + üzengi + dizgin;
  jokeyde eğik "dörtnal" oturuşu (P1-6). Misafir vitrinine sabit bir
  gösterim atı (veri iddiası YOK — panel yine "AT SEVDALISI" der) (P0-5).
- **D1 — kamera/arayüz:** yarış pist kamerasının direk çakışması (P1-8),
  ahır kamerası dar ekranda `fitFovToAspect` (P1-9), mobil yarış HUD'unun
  katlanabilir sıralama paneli (P0-4).
- **E — ölçüm + öncesi/sonrası:** aynı betikle aynı koşullarda yeniden
  ölçüm, ekran görüntüleri, bu belgeye §7.

**Sahibine soru:** oyuncunun ana sayfası ahır mı kalsın, yoksa brief'teki
gibi hipodrom vitrini + at paneli mi olsun? (Bugünkü karar: ahır.)

## 6. Dış varlık ihtiyacı (bu ortamdan alınamadı)

| Varlık | Beklenen yol | Aday kaynak (lisans) | Not |
|---|---|---|---|
| Gökyüzü HDRI | `hdri/golden-hour.hdr` | Poly Haven HDRI (CC0) | 1k–2k yeterli |
| Çim / pist dokuları | `textures/grass-pbr.ktx2`, `textures/track-dirt-pbr.ktx2` | Poly Haven / ambientCG (CC0) | prosedürel doku bunların yerini TUTMAZ, geçicidir |
| Gerçekçi at (iskeletli, dörtnal klibi) | `models/horse.glb` | CC0 gerçekçi + iskeletli at bulunamadı; Quaternius (CC0) STİLİZE; gerçekçi olanlar ücretli (TurboSquid/CGTrader) ya da Sketchfab CC-BY (atıf şart, indirme hesap ister) | **Sahibinin kararı** — CLAUDE.md'deki açık soru |
| Jokey (ata oturan iskelet) | `models/jockey.glb` | aynı | Mixamo YASAK (CLAUDE.md kural 8) |
| Hipodrom çevresi / ahır / start kapısı | `models/*.glb` | ücretli ya da sipariş | |

Ağ izni: ortamın ağ ayarında bu alan adları izinli listeye eklenirse
(Poly Haven: `polyhaven.com`, `dl.polyhaven.org`, `api.polyhaven.com`;
ambientCG: `ambientcg.com`) CC0 dosyaları indirip bağlayabilirim; manifest'te
bugün lisans alanı YOK — ilk gerçek varlıkla birlikte `license` + kaynak
alanı eklenmeli (lisans kaydı olmadan dosya bağlanmaz). Gerçekçi at/jokey için
lisans seçimi sahibindedir.

## 7. Faz sonuçları

(Fazlar ilerledikçe doldurulur: değişen dosyalar, testler, ölçüm, kalanlar.)
