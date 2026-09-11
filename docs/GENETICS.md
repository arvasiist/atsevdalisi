# GENETICS.md — Yetiştiricilik ve Kalıtım Sistemi

> Kaynak: `docs/PROJECT_BRIEF.md` §28-29, §34, §86. Formüller için
> `docs/ALGORITHMS.md` §10. Bu sistem **FAZ 3**'te uygulanacaktır; bu
> doküman şimdiden tasarımı sabitler ki `pedigrees`/`breeding_pairs` şeması
> (FAZ 0'da zaten oluşturuldu) doğru varsayımlarla kurulmuş olsun.

## 1. Akış

```text
Mare + Stallion
     ↓
Genetic Engine (apps/api/src/domain/breeding/)
     ↓
Inherited Traits
     ↓
Mutation
     ↓
Health Check
     ↓
Foal (yeni horses kaydı)
     ↓
Growth (age_curve ile zaman içinde gelişir)
     ↓
Training
     ↓
Race Career
```

## 2. Gizlilik prensibi (brief §29)

Oyuncuya **tam DNA verisi asla gösterilmez.** Oyuncunun görebileceği:

- Soy ağacı (`pedigrees` tablosu: sire, dam, grand-sire, grand-dam, bloodline)
- Ebeveyn özellikleri (görünen stat'lar, brief §8.1)
- Tahmini potansiyel (scout sistemi ile aralık olarak, brief §34)
- Bilinen kalıtım eğilimleri (örn. "bu kan hattı genelde çim pistte iyi
  sonuç verir" gibi soyut gözlemler)

Gerçek genetik sonuç (`horses.potential`, gizli stat'lar) zaman içinde
yarış performansı ve veteriner/scout raporlarıyla **keşfedilir**, asla
tek seferde ifşa edilmez. Bu, scout/genetik uzmanı gibi personel
sistemlerini anlamlı kılar (brief §29 son cümle, §33-34).

## 3. Kalıtım modeli

Her kalıtsal stat için (bkz. `docs/ALGORITHMS.md` §10):

```text
child_stat = parent_A_stat × inheritance_A + parent_B_stat × inheritance_B + mutation
inheritance_A = random(0.35, 0.65)  (server, seed'e bağlı)
inheritance_B = 1 - inheritance_A
```

Bu hesaplama **her zaman backend'de** yapılır; istemci sadece sonucu
(yeni tay kaydını) görür. `inheritance_A/B` değerleri her stat için ayrı
ayrı rastgele üretilir (yani bir tay bazı özelliklerde anneye, bazılarında
babaya daha yakın olabilir) — bu, brief §89 İlke 7 "genetik tamamen
deterministik değildir" ilkesini destekler.

## 4. Mutasyon

```text
mutation = clamp(random(-mutationRange, +mutationRange), mutationBounds)
```

Mutasyon sınırları `config/genetics.config.json` içinde tanımlıdır ve
küçük tutulur (varsayılan öneri: ±3 puan) — amaç nadir ama anlamlı
sürprizler yaratmaktır, kalıtımı anlamsızlaştırmamaktır.

## 5. Potansiyel sınırlaması

```text
child_potential ≤ average(parent_potentials) × config.genetics.maxPotentialGainOverParents
```

Bu üst sınır sayesinde "iki vasat attan efsanevi bir tay" ihtimali düşük
tutulur, ancak sıfır değildir (mutasyon payı sayesinde) — kontrollü
sürpriz burada da geçerlidir.

## 6. Sağlık kontrolü (Health Check aşaması)

Yeni doğan tay için doğuştan sağlık riski hesaplanır:

```text
birth_health_risk =
    base_risk
    × parent_age_factor       # çok genç/yaşlı ebeveynlerde risk artar
    × inbreeding_factor        # soy ağacında ortak ata varsa risk artar
    × parent_health_factor
```

`inbreeding_factor`, `pedigrees` tablosundaki `sire_id`/`dam_id`/
`grand_sire_id`/`grand_dam_id` zincirinde çakışma olup olmadığı
kontrol edilerek hesaplanır — bu kontrol brief'te açıkça yazılmamıştır
ama gerçekçi bir yetiştiricilik sistemi için gereklidir; bkz.
`ARCHITECTURE.md` §10 "Ek öneriler" listesine eklenmesi önerilir.

## 7. Kan hattı (Bloodline) ve at kariyeri (brief §86-87)

Her atın `pedigrees.bloodline` alanı, oyuncunun uzun vadede "kendi
şampiyon kan hattını" kurma hedefine (brief §88) hizmet eder. At kariyeri
ekranında (brief §86-87) gösterilecek bilgiler zaten `horses`,
`race_entries` ve `breeding_pairs` tablolarından türetilebilir; ek bir
`horse_career_summary` view'ı (materialized view veya sorgu) FAZ 3'te
eklenmesi önerilir.

## 8. Test kriterleri (brief §53 Genetics testleri — FAZ 3'te uygulanacak)

- Çocuk özellikleri, ebeveyn dağılımından (parent_A, parent_B aralığı +
  mutasyon payı) istatistiksel olarak çıkmalı.
- Mutasyon, `config/genetics.config.json`'daki sınırları hiçbir koşulda
  aşmamalı.
- `child_potential`, üst sınırı hiçbir koşulda aşmamalı.
- Soy bağlantısı (`pedigrees`) her yeni tay için doğru kaydedilmeli.
- Aynı seed ile aynı ebeveyn çifti → aynı tay sonucu (determinism, brief
  §18 ile tutarlı).
