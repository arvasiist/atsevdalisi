# IMPLEMENTATION_PLAN_MASTER_BRIEF.md — Master Development Brief Uygulama Planı

`docs/AUDIT_REPORT.md`'nin (bu turda üretilen gap-analizi) doğal
devamı — brief'in kendi §52 protokolüne göre AUDIT'ten SONRA, kod
yazmadan ÖNCE üretilen İKİNCİ teslim.

## Neden iki gruba ayrıldı

Audit'in RISKS #1 bulgusu netti: brief'in Phase 1'inden (Horse Model)
başlayarak hemen hemen tüm görsel/ses fazları GERÇEK, lisanslı 3D
model ve ses dosyası gerektiriyor — bunları ne satın alabilirim
(finansal işlem yasağı) ne de sahte/lisanssız bir şekilde üretebilirim
(brief §7'nin kendi yasağı). Bu yüzden brief'in "adım adım yapalım"
talimatını, asset kararını BEKLEMEDEN ilerleyebileceğim her şeyi
ŞİMDİ yaparak, gerçek darboğazı NET bir soru olarak proje sahibine
sunarak karşılıyorum.

## GRUP 1 — Şimdi başlanabilir (asset gerektirmez)

Aşağıdaki dilimler, Race Engine'e DOKUNMADAN, yeni asset gerektirmeden,
mevcut mimariye (`RaceScene3D.tsx`/`RaceHud.tsx`/`camera-presets.ts`/
WebSocket telemetrisi) eklenebilir. Her biri kendi başına test edilip
CI'da doğrulanabilecek kadar küçük:

1. **Telemetri zenginleştirme** — `RaceSegmentSnapshot`/
   `RaceTelemetryPayload`'a opsiyonel `paceScore`/`staminaRemaining`/
   `fatigueLevel` alanları (motor zaten hesaplıyor, `race-engine.ts`'in
   segment çıktısından okunacak) + `RaceHud`'a per-horse bu değerleri
   gösteren bir panel.
2. **Camera Director** — yeni saf fonksiyon `selectCameraForRaceEvent
   (event, currentMode) → CameraMode`, race event tipine (start/
   overtake/final_200/finish) göre otomatik `cameraMode` state'i
   günceller; kullanıcı manuel override edebilir (otomatik mod bir
   sonraki event'te devam eder).
3. **Photo Finish sunumu** — finish anında mevcut `finalResult`
   verisiyle (zaten var) slow-motion efekti (`speedMultiplier` geçici
   düşürme) + üstte "1. Horse A — 1:58.42" formatlı sonuç kartı.
4. **Asset Interface + Manifest + `ASSET_GUIDE.md`** — `apps/web/src/
   features/race-viewer/assets/` altında `AssetManifest` tipi + `GLB
   Loader` sarmalayıcısı (drei'nin `useGLTF`'i üzerine, dosya yoksa
   fallback placeholder'a düşen) + gerekli her model için ne
   beklendiğini açıklayan `ASSET_GUIDE.md` (brief §7'nin örnek formatı
   ile: "HORSE_MODEL_REQUIRED — Realistic Thoroughbred horse GLB,
   Gallop animation, Compatible skeleton").
5. **Audio/VFX Manager iskeleti** — event-driven (`RACE_START`,
   `OVERTAKE`, `FINAL_200`, `FINISH` vb.) hook arayüzü + toz efekti
   için three.js'in kendi ilkel `Points`/instanced parçacık sistemi
   (doku gerektirmez) + ses için "dosya yoksa sessiz no-op" davranışı
   — mimari brief'e uygun, sahte dosya yok.
6. **Pedigree görselleştirme** — mevcut breeding/genetics domain
   verisiyle ağaç şeklinde bir UI paneli (Ahır/at detay ekranına).
7. **Config ayrımı** — `camera.config.json`/`vfx.config.json`/
   `audio.config.json` (mevcut `race.config.json` deseniyle).

Bunların HİÇBİRİ Race Engine'e dokunmaz, HİÇBİRİ gerçek görsel/ses
asset gerektirmez, HER biri bağımsız commit+push+CI ile doğrulanabilir
— yani tam olarak bu oturumun bugüne kadarki çalışma desenine (küçük
dilim → commit → push → CI doğrula) uyuyor.

## GRUP 2 — Proje sahibinin kararını bekleyen (asset-bağımlı)

8. Gerçek Horse/Jockey GLB modelleri + animasyon state machine
9. Hipodrom çevresi (tribün/seyirci/paddock/ahır/aydınlatma kuleleri)
10. Crowd sistemi
11. Gerçek ses dosyaları
12. Winner Ceremony/Shareable Result (Grup 2'nin görsel çıktısına bağlı)

Bu grup için proje sahibinden TEK bir karar gerekiyor: **3D/ses
asset'leri nereden geliyor?** Seçenekler (kendim karar veremem, çünkü
hem finansal işlem yasağı hem brief'in kendi "sahte/lisanssız asset
yok" kuralı devrede):

- (a) Proje sahibi bir asset mağazasından (Sketchfab, Unity Asset
  Store, TurboSquid, Mixamo vb.) uygun lisanslı bir at+jokey+hipodrom
  paketi SATIN ALIR, dosyaları bana/`public/assets/`'e sağlar — ben
  entegre ederim.
- (b) Proje sahibi ücretsiz/CC0 bir kaynaktan (varsa) uygun modelleri
  bulup sağlar.
- (c) Bu Master Brief'in görsel/ses hedefleri şimdilik ERTELENİR,
  Grup 1'in kod-only iyileştirmeleriyle yetinilir (mevcut "iskelet"
  kalitesinde ama daha zengin telemetri/kamera/photo-finish ile).
- (d) Başka bir tedarik yolu proje sahibi tarafından önerilir.

## Sıra

Grup 1'in 7 maddesini, önceki oturumlardaki AYNI disiplinle (küçük
dilim → yerel doğrulama → commit → bundle+`.bat` → proje sahibinin
push'u → `git fetch`+built-in tarayıcı ile bağımsız CI doğrulaması)
tek tek uygulayacağım — proje sahibinin onayıyla şimdi başlıyorum.
Grup 2, yukarıdaki asset-kaynağı sorusuna proje sahibinin cevabını
bekliyor.
