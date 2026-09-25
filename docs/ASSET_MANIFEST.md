# ASSET_MANIFEST — At Sevdalısı Varlık Takip Tablosu

"REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §24'ün istediği takip
formatı (ID/Name/Type/Source/License/Format/Polycount/TextureSize/
Rigged/Animated/LOD/Status). Kaynak gerçeği (source of truth) KOD
tarafında `apps/web/src/features/race-viewer/assets/asset-manifest.ts`'teki
`ASSET_MANIFEST` sabitidir — bu tablo onun proje-yönetimi/tedarik
GÖRÜNÜMÜDÜR (`docs/ASSET_GUIDE.md`'nin İNSAN-OKUNABİLİR açıklamalarıyla
KARIŞTIRILMAMALI: `ASSET_GUIDE.md` "her varlık NE İÇİN gerekli, NASIL
kullanılacak" sorusunu cevaplar; bu tablo "her varlık HANGİ TEDARİK
AŞAMASINDA" sorusunu cevaplar).

**`Status` sütunu için olası değerler:** `Beklemede` (henüz tedarik
edilmedi/repoda yok — bu belgenin yazıldığı tarih itibarıyla LİSTEDEKİ
HER SATIR bu durumdadır), `Değerlendiriliyor` (bir marketplace adayı
bulundu, lisans/kalite kontrolü sürüyor), `Satın Alındı` (ödeme yapıldı,
Blender işleme pipeline'ında), `Blender İşleniyor` (§14 IMPORT→...→GLB
EXPORT akışında), `Entegre Edildi` (repoda, `expectedPath`teki dosya
GERÇEKTEN mevcut, `getMissingAssets()` bu id'yi artık DÖNDÜRMÜYOR).

**Bu tablo TAMAMEN elle güncellenir** — `ASSET_GUIDE.md` ile AYNI
disiplin: `asset-manifest.ts`'e yeni bir `AssetRequirement` eklendiğinde
buraya da satır EKLENMELİDİR, aksi halde iki belge birbirinden SAPAR.

| ID | İsim | Tür | Kaynak | Lisans | Format | Poligon | Doku Boyutu | Rigli | Animasyonlu | LOD | Durum |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `HORSE_MODEL_REQUIRED` | Gerçekçi safkan at | 3D model | — | — | glb | — | — | Evet | Evet (Gallop/Trot/Idle min.) | — | Beklemede |
| `JOCKEY_MODEL_REQUIRED` | Jokey modeli | 3D model | — | — | glb | — | — | Evet (at ile uyumlu) | Evet (oturma/kamçı) | — | Beklemede |
| `HIPPODROME_ENVIRONMENT_REQUIRED` | Hipodrom sahnesi (tribün/pist çevresi/paddock) | 3D model | — | — | glb | — | — | Hayır | Hayır | — | Beklemede |
| `START_GATE_MODEL_REQUIRED` | Start kapıları | 3D model | — | — | glb | — | — | Hayır | Evet (açılma) | — | Beklemede |
| `CROWD_BILLBOARD_TEXTURE_REQUIRED` | Tribün kalabalığı billboard dokusu | Doku | — | — | ktx2 | — | — | — | — | — | Beklemede |
| `HOOFBEAT_SFX_REQUIRED` | Jenerik nal sesi (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `CROWD_AMBIENCE_SFX_REQUIRED` | Tribün kalabalığı ambiyansı (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `RACE_FINISH_FANFARE_REQUIRED` | Bitiş fanfarı | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `RACE_BACKGROUND_MUSIC_REQUIRED` | Yarış teması müziği | Müzik | — | — | mp3 | — | — | — | — | — | Beklemede |
| `COMMENTARY_VOICE_REQUIRED` | Spiker anlatım klipleri (klasör) | Ses | — | — | mp3 (klasör) | — | — | — | — | — | Beklemede |
| `GATE_OPEN_SFX_REQUIRED` | Kapı açılma sesi | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HORSE_BREATHING_SFX_REQUIRED` | At nefesi (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `WIND_AMBIENCE_SFX_REQUIRED` | Rüzgar ambiyansı (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `OVERTAKE_SFX_REQUIRED` | Geçiş sesi | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `WINNER_CELEBRATION_SFX_REQUIRED` | Kazanan kutlama sesi | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `START_SIGNAL_SFX_REQUIRED` | Hazır-ol start sinyali | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `STADIUM_AMBIENT_SFX_REQUIRED` | Stadyum yapısal ortam sesi (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `CROWD_CHEERING_SFX_REQUIRED` | Kalabalık tezahürat patlaması | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `CROWD_EXCITED_SFX_REQUIRED` | Yükselmiş kalabalık ambiyansı (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HORSE_SNORT_SFX_REQUIRED` | At burun/horlama sesi | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HORSE_NEIGH_SFX_REQUIRED` | At kişneme sesi | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HORSE_MOVEMENT_SFX_REQUIRED` | At genel hareket sesi | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HOOF_GRASS_SFX_REQUIRED` | Çim yüzey nal sesi (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HOOF_DIRT_SFX_REQUIRED` | Toprak yüzey nal sesi (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HOOF_SYNTHETIC_SFX_REQUIRED` | Sentetik yüzey nal sesi (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `HOOF_TURN_SFX_REQUIRED` | Viraj nal sesi (loop) | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |
| `PHOTO_FINISH_SFX_REQUIRED` | Foto finiş (kafa kafaya bitiş) sesi | Ses efekti | — | — | mp3 | — | — | — | — | — | Beklemede |

Her satırın "Kaynak"/"Lisans"/"Poligon"/"Doku Boyutu" sütunları bir
GERÇEK varlık seçildiğinde doldurulur — `—` işareti "henüz bilinmiyor",
UYDURULMUŞ bir değer DEĞİLDİR (brief'in "sahte/placeholder veri YOK"
kuralı bu tabloya da uygulanır). 3D model satırlarının Poligon/Doku
Boyutu sütunları, ilgili varlık `docs/ASSET_GUIDE.md`'nin "Performans
bütçesi" ÖNERİSİYLE (at+jokey birleşik ≤ 15.000 üçgen) karşılaştırılarak
doldurulmalıdır.

Bir satır `Entegre Edildi` durumuna geçtiğinde, o varlığın lisans
belgesi/faturası MUTLAKA `docs/ASSET_LICENSES.md`'ye (ve varsa gerçek
belge dosyası `docs/licenses/<asset-id>.md` altına) işlenmelidir —
bkz. `docs/ASSET_LICENSES.md`'nin KENDİ kuralı: "lisansı belirsiz asset
kullanılmayacak".
