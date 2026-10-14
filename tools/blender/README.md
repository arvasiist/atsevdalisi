# Blender varlık hattı

14.10.2026 — sahibinin kararı: oyunun 3D varlıkları **Blender'da, bu klasördeki
betiklerle** üretilir. Her betik bir varlığı sıfırdan kurar; dışarıdan model ya
da doku indirilmez (özgün içerik, lisans sorunu yok). Lisanslı satın alınan
modeller (at, jokey, insan) ayrı bir yoldan gelir; bkz. `docs/ASSET_GUIDE.md`.

| Betik | Çıktı (oyunun yüklediği) | Kaynak (.blend) |
|---|---|---|
| `build_hdri.py` | `apps/web/public/hdri/golden-hour.hdr` | `sources/golden-hour-sky.blend` |

## Çalıştırma

Blender **4.5 LTS** ile (kendi bilgisayarında):

```bash
blender -b -P tools/blender/build_hdri.py
```

Ya da Blender'ın Python modülüyle (Python 3.11):

```bash
python -m venv .venv-blender && .venv-blender/bin/pip install "bpy==4.5.*"
.venv-blender/bin/python tools/blender/build_hdri.py
```

İkisi aynı sonucu verir. `.blend` kaynaklarını Blender'da açıp düzenleyebilirsin;
ama oyundaki dosya **betikten** üretilir — kalıcı bir değişikliği betiğe yaz.

## Kurallar

- **Tek doğruluk kaynağı oyunun ayarlarıdır.** Betikler `config/*.config.json`
  okur (`lib/at_common.py` → `load_config`). Örnek: gökyüzündeki güneş
  `lighting.config.json` → `sun.position`tan gelir; oyunun gölge ışığı da
  oradan. Biri değişirse HDRI yeniden üretilir; `hdri-sun.spec.ts` uyumsuzluğu
  yakalar.
- **HDR dosyasını Blender'a kaydettirme.** `image.save()` HDR'de değerleri
  dönüştürüp kırpıyor (100 → 7.1; 14.10.2026'da ölçüldü). `build_hdri.py`
  Radiance RGBE'yi kendisi yazar.
- **Eksen:** Blender Z yukarı, oyun (glTF/three.js) Y yukarı. `three_to_blender`
  dönüşümünü kullan; glTF dışa aktarımı tersini kendisi yapar.
- **Boyut bütçesi** `asset-inspect.ts` → `MOBILE_BUDGET_BYTES` (model 5 MB,
  ortam haritası 8 MB). `npm run assets:check` hepsini denetler.
