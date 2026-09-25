# /assets — Ham Kaynak Materyal Çalışma Alanı

"REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §25'in istediği klasör
yapısı. **Bu klasör `apps/web/public/`ten TAMAMEN FARKLI bir amaca
hizmet eder:**

- **`apps/web/public/`** — NİHAİ, optimize edilmiş, OYUNUN GERÇEK ZAMANLI
  OLARAK yüklediği dosyalar (`.glb`, `.ktx2`, `.mp3`). `asset-manifest.ts`'teki
  `expectedPath` alanları BUNLARA işaret eder. Bu klasördeki her dosya
  KÜÇÜK, SIKIŞTIRILMIŞ ve production-ready OLMALIDIR.
- **`/assets` (bu klasör)** — HAM, işlenmemiş kaynak materyal: satın
  alınan/indirilen orijinal `.blend`/`.fbx`/`.wav`/yüksek-çözünürlüklü
  doku dosyaları, Blender pipeline'ının (brief §14: IMPORT→CLEAN→
  OPTIMIZE→MATERIAL CHECK→TEXTURE CHECK→RIG CHECK→ANIMATION CHECK→
  LOD→SCALE CHECK→ORIGIN/PIVOT CHECK→GLB EXPORT→THREE.JS TEST) HENÜZ
  UYGULANMADIĞI ARA halleri. Bu dosyalar genellikle BÜYÜK binary'lerdir
  (yüzlerce MB'a kadar) ve **git'e KOMMIT EDİLMEZLER** (bkz. kök
  `.gitignore`'daki `assets/**/*` kuralı — sadece bu README ve
  `.gitkeep` placeholder'ları İZLENİR).

## Klasör yapısı (brief §25)

```
assets/
  horses/         — satın alınan/üretilen ham at modelleri (.blend/.fbx)
  jockeys/        — ham jokey modelleri
  stadium/        — hipodrom/tribün/start kapısı/paddock ham modelleri
  crowd/          — kalabalık billboard/doku ham materyali
  audio/
    horse/        — at nefesi/burun/kişneme/hareket ham kayıtları
    hoof/         — nal sesi ham kayıtları (yüzeye göre alt-klasörlenebilir)
    crowd/        — kalabalık ambiyans/tezahürat ham kayıtları
    environment/  — rüzgar/stadyum ortam ham kayıtları
    race/         — start sinyali/kapı/geçiş/bitiş/kazanma ham kayıtları
    commentary/   — spiker anlatım ham kayıtları (kaydedilmiş veya TTS çıktısı)
  vfx/             — parçacık/toz efekti referans/kaynak materyali
```

## Bir ham varlık işlendiğinde yapılması gerekenler

1. Ham dosyayı İLGİLİ alt-klasöre koy (ör. `assets/horses/thoroughbred-v1.blend`).
2. Blender pipeline'ını (brief §14) UYGULA — CLEAN/OPTIMIZE/MATERIAL
   CHECK/TEXTURE CHECK/RIG CHECK/ANIMATION CHECK/LOD/SCALE CHECK/
   ORIGIN-PIVOT CHECK.
3. NİHAİ `.glb`/`.ktx2`/`.mp3` dosyasını `apps/web/public/`teki, `asset-manifest.ts`'in
   `expectedPath` alanında belirtilen TAM yola EXPORT et.
4. Lisans belgesini `docs/ASSET_LICENSES.md`'ye ve `docs/licenses/<asset-id>.md`'ye
   kaydet.
5. `docs/ASSET_MANIFEST.md`'deki ilgili satırın `Durum` sütununu güncelle.
6. `asset-manifest.ts`'e DOKUNMA — yol zaten doğru tanımlı (bkz.
   `docs/ASSET_GUIDE.md`'nin "Bir varlık eklendiğinde yapılması
   gerekenler" bölümü).

Bu klasördeki HİÇBİR dosya şu an İÇİN GERÇEKTEN VAR DEĞİLDİR (sadece
iskelet `.gitkeep` placeholder'ları) — brief'in "sahte/placeholder asset
İCAT ETME" kuralı burada da GEÇERLİDİR.
