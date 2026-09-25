# ASSET_LICENSES — At Sevdalısı Lisans Takip Belgesi

"REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §23'ün istediği lisans
takip belgesi. **Bu belge şu an TAMAMEN BOŞTUR** çünkü repoda HENÜZ
GERÇEK hiçbir 3D model/doku/ses dosyası YOKTUR (bkz.
`docs/ASSET_GUIDE.md`'nin "Durum" bölümü, `docs/ASSET_MANIFEST.md`'nin
tamamı `Beklemede` durumundadır) — bu BİLİNÇLİ bir tutarlılıktır, boş
tablo İCAT edilmiş sahte lisans kaydından çok daha DOĞRUDUR.

## Mutlak kural

**Lisansı belirsiz, doğrulanamayan veya ticari kullanıma İZİN VERMEYEN
hiçbir varlık bu projede KULLANILMAYACAKTIR.** Bu, brief'in KENDİ kuralı
("never fabricate fake GLB files or use unlicensed assets") kadar
kesindir — bir varlık satın alınsa/indirilse BİLE, bu tabloya bir satır
eklenip lisans belgesi doğrulanmadan `apps/web/public/` altına
KONULMAMALIDIR.

## Bir varlık eklendiğinde doldurulması gereken alanlar

Her satır şu bilgileri İÇERMELİDİR (brief §23):

- **Asset ID:** `asset-manifest.ts`'teki `AssetRequirement.id` (ör.
  `HORSE_MODEL_REQUIRED`) — `docs/ASSET_MANIFEST.md`'deki satırla
  BİREBİR eşleşmelidir.
- **Kaynak (marketplace/sağlayıcı):** ör. CGTrader, TurboSquid, Fab,
  Unity Asset Store, veya özel üretim/sözleşmeli sanatçı adı (bkz.
  brief §31 önerilen platform listesi).
- **Lisans türü:** ör. "Royalty-Free Ticari Lisans", "CC0", "Özel
  Sözleşme (Work-for-Hire)" — TAM lisans metninin ADI, "ücretsiz"
  gibi belirsiz bir ifade DEĞİL.
- **Satın alma/edinim tarihi.**
- **Fatura/lisans belgesi konumu:** `docs/licenses/<asset-id>.md` (veya
  gerçek fatura/sözleşme dosyasının GÜVENLİ bir şekilde saklandığı yer
  — bu klasör HENÜZ YOK, İLK gerçek varlık eklendiğinde AÇILACAK).
- **Ticari kullanım onayı:** lisansın açıkça "ticari oyun projesinde
  kullanılabilir" dediğinin TEYİDİ (bir ekran görüntüsü/alıntı yeterli
  DEĞİLDİR — tam lisans metni okunmalı).
- **Değişiklik/türetme hakkı:** lisans, varlığın Blender'da
  optimize edilmesine/LOD'lanmasına/renk varyasyonu ÜRETİLMESİNE
  (brief §6 "BAY/DARK_BAY/CHESTNUT/..." renk varyantları) İZİN VERİYOR
  MU? Bazı royalty-free lisanslar türetilmiş çalışmayı KISITLAR — bu
  SATIN ALMADAN ÖNCE kontrol edilmelidir.

## Tablo (henüz boş — ilk gerçek varlık eklendiğinde satır eklenecek)

| Asset ID | Kaynak | Lisans Türü | Edinim Tarihi | Belge Konumu | Ticari Kullanım | Türetme Hakkı |
|---|---|---|---|---|---|---|
| _(henüz yok)_ | | | | | | |

## Bir varlık eklendiğinde yapılması gerekenler

1. Yukarıdaki tabloya YENİ bir satır ekle, TÜM sütunları GERÇEK
   bilgiyle doldur (`—` veya boş bırakma — bir alan bilinmiyor İSE
   varlık HENÜZ eklenmeye HAZIR DEĞİLDİR).
2. Lisans belgesini/faturasını `docs/licenses/<asset-id>.md` altına
   (klasör yoksa AÇ) kaydet.
3. `docs/ASSET_MANIFEST.md`'deki ilgili satırın `Durum` sütununu
   `Entegre Edildi` yap, `Kaynak`/`Lisans` sütunlarını doldur.
4. `docs/ASSET_GUIDE.md`'nin "Bir varlık eklendiğinde yapılması
   gerekenler" adımlarını (dosyayı doğru yola koy, kod değişikliği
   GEREKMEZ) uygula.
