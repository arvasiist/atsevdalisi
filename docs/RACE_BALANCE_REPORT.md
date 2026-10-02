# YARIŞ DENGESİ RAPORU

> **Bu belge ELLE YAZILMAZ.** `apps/api/tools/race-balance-report.ts` ölçüp üretir.
> Aynı ölçüm kodu (`apps/api/test/domain/race/race-balance-harness.ts`) `race-balance.spec.ts`
> tarafından da koşulur ve **CI'da eşiklerle kilitlidir** — yani buradaki sayılar ile CI'ın
> kırmızıya döndüğü sayılar aynı koşumdan gelir. Config değişip eşikler güncellenmezse CI kırılır.

| | |
| --- | --- |
| Ölçüm zamanı | 2026-09-29T00:01:39.938Z |
| Saha boyutları | 8 / 10 / 12 / 14 / 16 (`config/race-lobby.config.json` → `fieldSizes`) |
| Saha boyutu başına koşum | **10.000** (her biri beş ayrı koşumda) |
| Toplam simülasyon | **265.125** |
| Kanonik yarış | 1600 m, çim, güneşli, 22 °C |
| `RACE_ENGINE_VERSION` | `1.0.0` |
| `RACE_RULESET_VERSION` | `1.3.0` |
| `race.config.json` parmak izi | `7e569597af38` (sha256, ilk 12 hane) |

Üretmek için (`apps/api` dizininden):

```
node ../../node_modules/tsx/dist/cli.mjs tools/race-balance-report.ts
```

Süre ~30-45 sn. `--trials=300` ile hızlı ön bakış alınabilir, ama **hızlı değerle üretilen
rapor commit edilmez** — yukarıdaki “saha boyutu başına koşum” satırı kaç koşumla üretildiğini
yazar.

---

## 1. Yöntem — neden DÖRT ayrı saha

Denge ölçümünde en kolay hata, **tek sahada birden fazla değişkeni aynı anda oynatmak**tır:
o zaman “fark yetenekten mi, taktikten mi, kulvardan mı geldi” sorusu cevaplanamaz. Bu yüzden
her ölçüm kendi sahasını kurar ve o sahada tek bir değişken bırakır.

| Saha | Değişken | Sabit | Ne ölçer |
| --- | --- | --- | --- |
| **Dar merdiven** (62 → 74) | statlar | tümü `mid_pack`, sabit ağırlık | Yetenek aktarımı — bant daralınca ne değişiyor? |
| **Geniş merdiven** (55 → 85) | statlar | tümü `mid_pack`, sabit ağırlık | Yetenek aktarımı — bant genişleyince? |
| **Stil** | `racingStyle` | tüm statlar özdeş | Taktik seçimi kazanma payını haksız domine ediyor mu? |
| **Bot** | **20 ayrı rastgele** üretim sahası (`generateBotEntrants`) | — | **Üretim gerçeği**: rastgele bir lobide denge nasıl? |

**Neden dört saha:** merdiven sahaları YAPAYDIR — sekiz özellik aynı anda aynı yönde hareket eder
ve bu, gerçek bir sahada asla olmaz. Onlar bir **yetenek aktarım probudur**; denge tablosu DEĞİL
(§2c). Denge iddiaları §4'teki üretim sahasında kurulur. İkisi de olmasaydı rapor ya “yetenek hiç
işlemiyor” sanırdı ya da “ölçtüğüm şey üretimde yok” durumunu gizlerdi.

**Neden 20 ayrı bot sahası:** tek saha yetmez. Ölçüm ilk kez TEK sabit sahayla yapıldığında saha
boyutları arasında uçurum çıktı — bir boyutta favori ezici biçimde kazanırken diğerlerinde yazı-tura
gibiydi. Fark motordan değil, tek bir **çekilişten**
geliyordu (o sahada en güçlü botun ikinciye farkı büyüktü). Üretimde her lobi kendi rastgele
sahasını alır (`settle-race.use-case.ts` seed'i yarış başına üretir), dolayısıyla doğru soru
“bu sabit sahada kim kazanıyor” değil, **“rastgele bir sahada favori ortalama ne sıklıkla
kazanıyor ve en kötü durumda ne oluyor”**dur.

**Ölçülmeyen: `gatePosition`.** İstendi ve ölçülemedi, çünkü `simulateRace` kapı pozisyonunu
**hiç okumaz**. `race_entries.gate_position` yalnızca yazılır, saklanır ve istemciye yansıtılır
(`settle-race.use-case.ts`, `postgres-race.repository.ts`, `race.gateway.ts`). Olmayan bir etkiyi
“dengeli çıktı” diye raporlamak uydurma olurdu — bkz. §7.

---

## 2. Yetenek sinyali — merdiven sahaları

`1/N` **tarafsız** (yazı-tura) motorda beklenen paydır. Galibiyetin yeteneğe bağlı olması
`1/N`'in ÜZERİNDE bir favori payı **gerektirir**; oyunun yarış olması da payın `1.00`
OLMAMASINI gerektirir (aksi hâlde sonuç önceden bilinirdi).

**“Hiç kazanmayan at” sütunu yapısal ölü at arar.** 10.000 yarışta bir at hiç kazanmıyorsa o at
bu motorda yarışamaz durumdadır — sahibi için görünmez bir duvardır.

### 2a. Dar merdiven — 62 → 74

| Saha | Favori payı | Tarafsız `1/N` | Favori / tarafsız | En zayıf at | İlk yarı toplam | Son yarı toplam | Hiç kazanmayan at | Tek atın en yüksek payı | Yetenek–galibiyet korelasyonu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 82.49% | 12.50% | **6.60×** | 0.00% | 100.00% | 0.00% | 4 | 82.49% | 0.669 |
| 10 | 68.55% | 10.00% | **6.85×** | 0.00% | 100.00% | 0.00% | 5 | 68.55% | 0.684 |
| 12 | 64.70% | 8.33% | **7.76×** | 0.00% | 100.00% | 0.00% | 6 | 64.70% | 0.647 |
| 14 | 61.74% | 7.14% | **8.64×** | 0.00% | 100.00% | 0.00% | 7 | 61.74% | 0.648 |
| 16 | 56.21% | 6.25% | **8.99×** | 0.00% | 100.00% | 0.00% | 9 | 56.21% | 0.634 |

### 2b. Geniş merdiven — 55 → 85

| Saha | Favori payı | Tarafsız `1/N` | Favori / tarafsız | En zayıf at | İlk yarı toplam | Son yarı toplam | Hiç kazanmayan at | Tek atın en yüksek payı | Yetenek–galibiyet korelasyonu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 94.26% | 12.50% | **7.54×** | 0.00% | 100.00% | 0.00% | 5 | 94.26% | 0.608 |
| 10 | 85.96% | 10.00% | **8.60×** | 0.00% | 100.00% | 0.00% | 7 | 85.96% | 0.590 |
| 12 | 83.70% | 8.33% | **10.04×** | 0.00% | 100.00% | 0.00% | 8 | 83.70% | 0.554 |
| 14 | 76.99% | 7.14% | **10.78×** | 0.00% | 100.00% | 0.00% | 10 | 76.99% | 0.554 |
| 16 | 71.57% | 6.25% | **11.45×** | 0.00% | 100.00% | 0.00% | 11 | 71.57% | 0.546 |

**Okunuşu:** “yetenek–galibiyet korelasyonu”, merdivenin sırası ile `computeBaseAbility`
çıktısı arasındaki Spearman katsayısıdır — motorda **gerçekten kullanılan** taban puana göre
ölçülür, merdivenin kendi sırasına göre değil. `1.000` olsaydı motor tamamen deterministik
olurdu; `0` olsaydı yetenek hiç işlemiyor olurdu.

### 2c. ÖLÇÜLEN BULGU — motorun sürpriz payı DARDIR

İki tablo yan yana okunduğunda iki şey çıkıyor ve **ikincisi beklenmeyen olandır**:

1. Merdiven sahalarında favori payı `1/N`'in katları mertebesinde ve **alt yarı 10.000 yarışta
   HİÇ kazanmıyor** (`Son yarı toplam` = 0.00%, `Hiç kazanmayan at` sütunu sıfırdan büyük).
2. **Dar bant da neredeyse aynı derecede deterministik.** Bandı daraltmak favori payını
   düşürüyor — ama alt yarı **hâlâ** hiç kazanmıyor ve birkaç at yine hiç kazanmıyor.
   Yani sorun bandın genişliği DEĞİL.

Kök neden ölçülebilir bir orandır:

```
race.config.json → randomFactorRange: [-6, 6]   (segment başına ±6 puan)
segment sayısı (1600 m / 200 m)                  = 8
gürültünün yarış düzeyindeki standart hatası     ≈ 6 / √3 / √8 ≈ 1.2 puan
```

Yani segment gürültüsü yarış boyunca **toplanarak ortalanır**: tek bir segmentte ±6 puan
büyük görünür, ama 8 segmentin toplam süresinde etkisi ~1.2 puana iner. Merdiven sahasında
komşu iki atın farkı bunun üzerindedir — dolayısıyla sıralama neredeyse önceden belirlenir.

⚠️ **Ama merdiven sahası ÜRETİM DEĞİLDİR ve bu tablolar denge kararı için kullanılmamalıdır.**
Merdiven yapaydır: sekiz özellik (speed, stamina, acceleration, fitness, morale, surface/
distance uyumu, yorgunluk) **aynı anda ve aynı yönde** hareket eder. Gerçek bir sahada iki at
farklı özelliklerde birbirini geçer ve `computeBaseAbility` farkı küçülür. Merdiven bir
**yetenek aktarım probudur** (“motor yeteneği ne kadar güçlü ödüllendiriyor”), denge tablosu
değildir. Üretim gerçeği **§4'tedir** ve orada favori payı merdiveninkinin belirgin ALTINDADIR —
ama yine de `1/N`'in katları mertebesinde, yani sürpriz payı orada da dar (§4a).

**Bu, determinizmle KARIŞTIRILMAMALIDIR.** Determinizm (§5) motorun *doğruluğudur*: aynı seed
aynı sonucu verir. Buradaki bulgu ise oyunun **sürpriz payının** genişliğidir: farklı seed'ler
bile aynı sıralamayı üretir. İkisi ayrı şeylerdir ve ikisi de doğrudur.

**Neden bu dilim değeri DEĞİŞTİRMEDİ:** `race.config.json`'daki bir sayıyı oynatmak
(CLAUDE.md kural 2 — “RACE ENGINE'E DOKUNMA”; config dondurulmuş `horse_snapshot`ların
replay'ini belirler) eski yarışların yeniden koşumunu **sessizce başka bir sonuca** çevirirdi.
Bu dilim ölçümü ve karar için gereken sayıyı üretir; denge kararı proje sahibinindir.

---

## 3. Taktik dengesi — stil sahası

Sahadaki atlar istatistiksel olarak **özdeş**; tek fark `racingStyle`. Beklenen pay sabit %25
**değildir** — stil `index % 4` ile dağıtıldığı için 10 ve 14 atlık alanlarda 3-3-2-2 ve 4-4-3-3
olur. Sabit %25 eşiği kullanmak o iki boyutta ölçüm hatası olurdu.

| Saha | front_runner | tracker | mid_pack | closer |
| --- | --- | --- | --- | --- |
| 8 | 22.84% (bekl. 25.00%) | 21.78% (bekl. 25.00%) | 22.23% (bekl. 25.00%) | 33.15% (bekl. 25.00%) |
| 10 | 29.07% (bekl. 30.00%) | 27.48% (bekl. 30.00%) | 17.30% (bekl. 20.00%) | 26.15% (bekl. 20.00%) |
| 12 | 24.89% (bekl. 25.00%) | 21.26% (bekl. 25.00%) | 21.34% (bekl. 25.00%) | 32.51% (bekl. 25.00%) |
| 14 | 29.97% (bekl. 28.57%) | 24.05% (bekl. 28.57%) | 18.20% (bekl. 21.43%) | 27.78% (bekl. 21.43%) |
| 16 | 26.17% (bekl. 25.00%) | 20.60% (bekl. 25.00%) | 21.31% (bekl. 25.00%) | 31.92% (bekl. 25.00%) |

**Neden tam %25 beklenmiyor:** `race.config.json`'ın `pace` bölümü bilinçli olarak asimetriktir
(`front_runner` yarış boyunca daha çok stamina harcar ama erken/orta aşamada pozisyon bonusu
alır; `closer` daha az harcar ve geç aşamada küçük bir bonus alır). Bu, dört stilin de
**kimlikli** olması demektir. Aranan şey payların eşit olması değil, hiçbirinin **yapısal olarak
ölü** (~%0) ya da **baskın** (~%100) olmamasıdır — eşikler `race-balance.spec.ts` içinde, ölçülen
temel çizgiye güvenli marj bırakılarak sabitlenmiştir.

---

## 4. ÜRETİM GERÇEĞİ — rastgele bot lobileri

**Bu, raporun asıl denge tablosudur.** §2'deki merdivenler yapay problar (§2c); üretimde bir
oyuncunun karşılaştığı saha burada ölçülendir. `generateBotEntrants` üretimde de çağrılan
fonksiyonun ta kendisidir (`settle-race.use-case.ts`).

Saha boyutu başına **20 ayrı rastgele lobi** × 500 yarış.

⚠️ **Burada stil tablosu YOKTUR ve olmamalıdır.** Bir lobide stil payı ölçmek, en güçlü botun
hangi stile düştüğü **yazı-turasını** ölçmek olurdu (ilk koşumda tam olarak bu yanılgı görüldü:
sabit bir saha için bir stilin payı ezici çıktı — çünkü o sahanın en güçlü botu o stile düşmüştü).
Yirmi lobiye dağıtmak bu tesadüfü ortalar ama yine de stili değil **saha kompozisyonunu**
ölçerdi. Taktik dengesi §3'ün işidir; burada ölçülen şey **yetenek dağılımıdır**.

| Saha | Favori payı (ort.) | Tarafsız `1/N` | Favori / tarafsız | En kötü lobide favori | Hiç kazanmayan bot (ort. / en kötü) | Tek botun en yüksek payı (ort.) | Kazananın ort. süresi | 1. ile son arası ort. fark |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 64.71% | 12.50% | **5.18×** | 97.00% | 3.1 / 6 | 70.09% | 174.69 sn | 44.31 sn |
| 10 | 64.95% | 10.00% | **6.50×** | 98.40% | 4.3 / 6 | 67.35% | 173.65 sn | 48.81 sn |
| 12 | 70.41% | 8.33% | **8.45×** | 96.40% | 6.0 / 9 | 72.13% | 171.64 sn | 54.86 sn |
| 14 | 54.64% | 7.14% | **7.65×** | 85.80% | 6.8 / 10 | 59.04% | 173.24 sn | 56.75 sn |
| 16 | 43.02% | 6.25% | **6.88×** | 85.40% | 8.4 / 12 | 55.05% | 172.43 sn | 59.50 sn |

“Favori” = `computeBaseAbility` çıktısı en yüksek olan bot — motorda **gerçekten kullanılan**
taban puandır, sahaya bakıp seçilmiş bir etiket değil.

**Okunuşu:** `Favori payı (ort.)` `1/N`'in belirgin üzerindeyse yetenek üretimde işliyor demektir;
`1.00`'a yaklaşırsa oyun yazı-turaya döner. `En kötü lobide favori` sütunu ise tek bir lobide
ne kadar domine edilebildiğini gösterir — dağıtım genişse **bazı lobiler yarış olmaktan çıkar**,
oyuncu bunu seçemez ve göremez.

### 4a. ÖLÇÜLEN BULGU — üretimde de sürpriz payı dar

Bu tablo §2c'deki bulguyu **üretim sahasında doğruluyor** ve oradan daha rahatsız edici, çünkü
merdiven yapaydı; burası gerçek:

Sayılar yukarıdaki tablodadır; burada **okunuşu** var:

- **Ortalama favori payı `1/N`'in katları mertebesinde** (`Favori / tarafsız` sütunu). Yani
  yetenek işliyor — ama fazla iyi.
- **`En kötü lobide favori` sütunu `1.00`'a yaklaşıyor.** Bir lobide favorinin yarışı kazanması
  neredeyse kesinleşiyor; oyuncunun o lobiye girip girmemesi bir şans, sonucu değil.
- **Yapısal ölü botlar var:** `Hiç kazanmayan bot` sütunu 500 yarışta hiç kazanmayan botları
  sayar. Bu botlar için o lobi bir yarış değil — ve oyuncu hangi lobiye düştüğünü seçemez.
- **`Tek botun en yüksek payı (ort.)`**, galibiyetlerin tek bir botta toplandığını gösterir.

**Neden botlar ölü kalıyor — ve bu neden bir oyuncu sorunudur.** Botun statları `[45, 75]`
bandından **bağımsız** çekilir; dört ağırlıklı statın bileşimi (speed .25 + stamina .20 +
acceleration .15 + fitness .10) 30 puanlık bantta ~3.2 puan standart sapma verir, yani 16 botluk
bir sahada en iyi ile en kötü arasında ~11 puan fark oluşur. Yarış gürültüsü ise ~1.2 puandır
(§2c). Dolayısıyla **sıralama çoğunlukla saha kurulduğu anda belirlenir**; koşu onu yalnızca
teyit eder. Gerçek bir oyuncu, botların arasına girdiğinde de aynı gürültüyle koşar: iyi bir atla
**neredeyse her zaman** kazanır, kötü bir atla **neredeyse hiç**. Oyunun “sürpriz” üretmesi beklenen
yer burasıdır ve bugün üretmiyor.

⚠️ **Bu bir bulgudur, düzeltme DEĞİL.** `randomFactorRange` / segment sayısı / taban puan ölçeği
değişikliği `race.config.json` değişikliğidir ve dondurulmuş `horse_snapshot`ların replay'ini
sessizce başka bir sonuca çevirir (CLAUDE.md kural 2). Karar proje sahibinindir; bu dilim
ölçümü ve eşikleri üretti.

---

## 5. Yapısal sağlamlık ve determinizm

Yapısal koşum, dar merdiven sahasında ayrıca koşar (sıra bütünlüğü ve beraberlik için
statların ÖZDEŞ olduğu bir saha daha zorlayıcıdır).

| Saha | Sıra 1..N değil | Uzunluk ≠ N | Beraberlik içeren yarış | Determinizm ihlali | Kazanan ort. | Sonuncu ort. | Fark ort. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 0 | 0 | 10 | 0 / 25 | 143.29 sn | 186.63 sn | 43.34 sn |
| 10 | 0 | 0 | 8 | 0 / 25 | 143.22 sn | 189.00 sn | 45.78 sn |
| 12 | 0 | 0 | 11 | 0 / 25 | 143.38 sn | 190.68 sn | 47.30 sn |
| 14 | 0 | 0 | 15 | 0 / 25 | 143.39 sn | 191.87 sn | 48.48 sn |
| 16 | 0 | 0 | 26 | 0 / 25 | 143.33 sn | 193.40 sn | 50.07 sn |

**Determinizm** brief §18/§53/§58'in replay/audit garantisidir: aynı `simulationSeed` + aynı
`entries` + aynı config **bit bit** aynı `RaceTimeline`'ı üretmelidir. Her saha boyutunda ilk
25 seed iki kez koşulup `JSON.stringify` ile karşılaştırılır.

**Beraberlik** sayısı sıfır olmak zorunda değildir ama küçük olmalıdır: motorda tam beraberlik
`finishTimeMs` eşitliğidir ve `horseId` sözlük sırasıyla bozulur (brief §25 foto-finiş). Sıfır
olması bir hata değildir; BÜYÜK olması “motor ayrıştırmıyor” demek olurdu.

---

## 6. Mesafe duyarlılığı

Saha boyutu başına 1.000 koşum; kazananın ortalama süresi.
Uzun yarış **daha yavaş** olmalıdır (stamina tüketimi + yorgunluk birikimi). Aksi, mesafenin
sonuca hiç girmemesi demek olurdu.

| Saha | 1200 m | 1600 m | 2400 m | 2400/1200 oranı |
| --- | --- | --- | --- | --- |
| 8 | 105.61 sn | 151.98 sn | 221.51 sn | 2.097 |
| 10 | 105.48 sn | 152.04 sn | 221.39 sn | 2.099 |
| 12 | 105.53 sn | 151.84 sn | 221.28 sn | 2.097 |
| 14 | 105.22 sn | 151.74 sn | 221.00 sn | 2.100 |
| 16 | 105.19 sn | 151.67 sn | 220.87 sn | 2.100 |

---

## 7. Dürüst eksikler — bu raporun KAPSAMADIĞI şeyler

1. **Kapı pozisyonu (`gatePosition`) ölçülmedi** — çünkü motora hiç girmiyor. Brief §17/§21
   kapı pozisyonunu bir faktör olarak sayar; bugün `race_entries.gate_position` yalnızca
   saklanan ve istemciye yansıtılan bir **etikettir**. Bu bir denge bulgusu değil, bir
   **bağlanmamış özelliktir**.
2. **Jokey ve kişilik BU RAPORDA ölçülmedi — ama artık BAĞLIDIR** (PHASE 6.2/6.3,
   29.09.2026). Bu madde eskiden "jokey motora bağlı değil" diyordu; **o cümle artık
   yanlıştı ve düzeltildi.** Bugünkü durum: `RaceEntrantSnapshot.jockeySkillComposite`
   gerçek bir motora girdisidir, `race_entries.jockey_id` kilit anında YAZILIR ve
   `temperament` (mizaç) `horse_stats`ten snapshot'a taşınıp Geçiş C'ye girer.
   **Bu raporda ölçülmemelerinin sebebi bağlantısızlık değil, KONTROLDÜR:**
   `race-balance-harness.ts` yetenek merdivenini ve stil paylarını ölçerken jokeyi ve
   mizacı saha İÇİNDE sabit tutar (nötr), yoksa ölçülen şey yetenek değil jokey olurdu.
   İkisinin **etkisi kendi spec'lerinde** ölçülür: `jockey-decisions.spec.ts` ve
   `temperament.spec.ts` (ikisi de CI'da kilitli).
3. **`startApproach` / `finalStretchPlan` artık ÖLÇÜLÜR durumda** (PHASE 6.1, 29.09.2026).
   Bu madde eskiden "doğrulanan ama kullanılmayan alanlar" diyordu; `simulateRace` artık
   ikisini de okur. Bu raporda ayrıca tablolaştırılmadılar çünkü etkileri
   `tactic-effect.spec.ts`te ve §3'ün stil tablosunda zaten görünür — **bu raporun
   kapsamı denge taramasıdır, özellik-bazlı etki ölçümü değil.**
4. **Kişilik (temperament) etkisi BİLEREK KAPALI ÖDÜNLEŞİMDİR** (PHASE 6.3).
   "Sıcak at hızlı kalkar, çabuk yorulur" kuralı erken ve final penceresinde **simetrik**
   puan uygular; ölçüm bunu doğruladı (1v1, nötr rakibe karşı, 5.000 koşum):
   `0 → 0.4764`, `25 → 0.5022`, `50 → 0.4956`, `75 → 0.5088`, `100 → 0.4814`.
   Yani kişilik **yarış içi konumu ve stamina profilini** değiştirir, ama nötr bir
   rakibe karşı **galibiyet payını sistematik olarak kaydırmaz** — gizli bonus yoktur.
   ⚠️ Bu satırlar bir EŞİK değildir; kilitlenen şey `temperament.spec.ts`teki
   "hiçbir uç nötr atı ezmez" değişmezidir.
5. **Tek mesafe/saha koşulu** — kanonik yarış 1600 m / çim / güneşli / 22 °C'dir. Diğer
   zemin ve hava koşulları (`weather.config.json`) §6'daki mesafe probu DIŞINDA ölçülmedi;
   çoklu-zemin denge taraması bu dilimin kapsamı dışındadır.
6. **Gerçek oyuncu atı verisiyle ölçüm yok** — sahalar sentetik merdivenler, sentetik özdeş
   alan ve üretim botlarıdır. Gerçek `horses` satırlarıyla koşan bir denge taraması ancak
   gerçek oyuncu popülasyonu oluştuğunda anlamlı olur.
7. **Sürpriz payı ölçüldü ama DEĞİŞTİRİLMEDİ — bu raporun EN ÖNEMLİ AÇIK UCU** (§2c + §4a).
   Ölçüm üretimde de doğruladı: favori payı `1/N`'in katları mertebesinde, en kötü lobide
   `1.00`'a yaklaşıyor, tek bot galibiyetlerin çoğunu alıyor ve hiç kazanmayan botlar var
   (§4 tablosu). Düzeltmesi
   (`randomFactorRange`, segment sayısı ya da taban puan ölçeği) `race.config.json` değişikliği
   gerektirir ve dondurulmuş snapshot replay'lerini etkiler. Bu dilim ölçüm dilimiydi;
   **karar verilmedi** ve `race-balance.spec.ts` bu değeri “iyi” diye kilitlemez.
8. **`in_progress` hâlâ ölü** (CLAUDE.md) — ölçüm bunu etkilemez ama yarış akışının gerçek
   zamanlı bir aşaması olmadığını hatırlatır: buradaki tüm sayılar **tek seferde koşan**
   simülasyonun sonucudur, canlı bir yarışın değil.

---

## 8. Sonuç

| Soru | Cevap |
| --- | --- |
| Motor sonucu sunucuda mı belirliyor? | Evet — simülasyon yalnızca `domain/race/race-engine.ts`'te koşar |
| Aynı seed aynı sonucu veriyor mu? | Evet — §5 determinizm ihlali sütunu tüm sahalarda 0 |
| Yetenek kazandırıyor mu? | Evet — üretim sahasında favori `1/N`'in belirgin üzerinde (§4) |
| Sonuç önceden bilinebilir mi? | **Üretimde hayır** — rastgele lobilerde favori oranı §4'ün “ort. favori” sütununda, sürpriz payı vardır. **Yapay merdiven sahasında neredeyse evet** — alt yarı hiç kazanmıyor (§2c) |
| Bir taktik domine ediyor mu? | Hayır — dört stil de kimlikli, hiçbiri yapısal ölü/baskın değil (§3) |
| Sürpriz payı yeterli mi? | **HAYIR — §2c + §4a + §7.6.** Gürültünün yarış düzeyindeki etkisi ~1.2 puan; yetenek farkı bunu aşınca sıralama saha kurulurken belirlenir. Üretimde “en kötü lobide favori” sütunu `1.00`'a yaklaşıyor (§4 tablosu). Ölçüldü, DEĞİŞTİRİLMEDİ |
| Düzeltildi mi? | **Hayır, bilerek.** `race.config.json` değişikliği dondurulmuş snapshot replay'ini bozar; karar proje sahibinindir |
| AI'ye gizli bonus var mı? | Hayır — botlar `generateBotEntrants` ile üretilir, ayrı bir bonus yolu yoktur (§4) |
| Kapı pozisyonu etkiliyor mu? | **Hayır — motora hiç girmiyor (§7.1, bağlanmamış özellik)** |
| Jokey etkiliyor mu? | **Evet — `jockeySkillComposite` motora giren gerçek bir girdidir ve `race_entries.jockey_id` kilit anında yazılır** (PHASE 6.2, §7.2). Etkisi `jockey-decisions.spec.ts`te ölçülür; **bu raporda** saha içinde sabit tutulur |
| Kişilik (temperament) etkiliyor mu? | **Evet, ama KAPALI ödünleşimle** — erken kalkış ve final düzlüğü simetrik puan uygular, nötr rakibe karşı galibiyet payı kaymaz (PHASE 6.3, §7.4). Etkisi `temperament.spec.ts`te ölçülür |
| `startApproach` / `finalStretchPlan` etkiliyor mu? | **Evet — `simulateRace` ikisini de okur** (PHASE 6.1, §7.3). Etkisi `tactic-effect.spec.ts`te ölçülür |


---

## 9. Oyuncu kontrolü (kırbaç / sakin) — 01.10.2026

Oyuncu kontrollü pratik yarışın (§13.55) kuralları ölçülerek ayarlandı.
Oyuncunun atı 8 atlık bot sahasında 1. at; deterministik tohumlar. Ölçüm
kodu harness'ta (`measurePlayerControlPlan`), CI kilitleri
`race-engine-player-control.spec.ts`te.

**İlk sürümde bulunan iki açık (düzeltildi):** (1) "sakin" bedavaydı
(yorgunluğu yarıya indiriyor, hızı düşürmüyordu) — "ilk yarı sakin + sonda
kırbaç" yapay zekâya göre ortalama 1 sıra kazandırıyordu; (2) kırbaç ucuzdu
— "baştan sona kırbaç" yapay zekâdan iyiydi, son düzlükte kırbaç ise sprint
rezervi (%25) yüzünden hiç etki etmiyordu.

**Yeni kurallar (`race.config.json` → `playerControl`):** sakin = −4 puan
hız, dayanıklılık tüketimi ×0.6 · kırbaç = rezerv şartı YOK, bonus
dayanıklılıkla orantılı ve `kırbaç^0.5` (azalan), her kırbaç 4 dayanıklılık
+ 6 KALICI yorgunluk (bir sonraki segmentten itibaren).

| Strateji (1500 yarış) | 1200 m | 1600 m | 2400 m |
|---|---|---|---|
| Hiç dokunma (yapay zekâ) | 4.49 | 4.50 | 4.48 |
| Son bölümde ×5 kırbaç | 4.39 | 4.44 | 4.47 |
| Son bölümde ×20 kırbaç | 4.30 | 4.38 | 4.42 |
| İlk yarı sakin | 4.64 | 4.23 | 3.85 |
| Baştan sona ×1 kırbaç | 5.11 | 5.63 | 6.28 |
| İlk 3 bölümde ×3 kırbaç | 6.77 | 7.04 | 7.19 |

(ortalama bitiş sırası, düşük = iyi.) Okuma: kırbaç yalnızca sonda işe yarar;
erken/aralıksız kırbaç ağır cezalı; tempo yönetimi uzun yarışta değerli,
sprintte zararlı. Hiçbir basit strateji statları ezmez (en iyi kazanç
≈ 0.6 sıra, 2400 m). **Komutsuz yarış değişmedi** (parmak izi testi).

### 9.1 Yön komutu ve çok oyunculu kontrol — 02.10.2026

1000 yarış, 8 atlık bot sahası, 1600 m (`measurePlayerControlPlan`,
`measureMultiPlayerControl`; ortalama bitiş sırası, düşük = iyi):

| Plan | Sıra |
|---|---|
| Komutsuz (yapay zekâ) | 4.49 |
| Her bölüm sol | 4.42 |
| Her bölüm sağ | 4.44 |
| Zikzak | 4.47 |
| İlk yarı sakin + sonda kırbaç | 4.20 |

| Sahadaki "akıllı" sürücü sayısı | Sürücülerin ortalaması | Aynı atlar komutsuz |
|---|---|---|
| 1 | 4.20 | 4.49 |
| 2 | 4.22 | 4.49 |
| 3 | 4.29 | 4.50 |
| 4 | 4.36 | 4.52 |

Aynı sahada akıllı sürücü 3.82, erken kırbaçlayan 7.11.

Okuma: yön komutu bedava hız DEĞİLDİR (±0.07). Kontrol avantajı birden çok
sürücüde küçülür (sıfır toplamlı sıralama, beklenen) ama kaybolmaz; beceri
farkı belirgin ödüllendirilir. Düzeltme gerekmedi. CI kilitleri:
`race-engine-player-control.spec.ts` (yön > yapay zekâ − 0.25; dört akıllı
sürücü komutsuzdan iyi; akıllı, pervasızdan en az 1 sıra iyi).
