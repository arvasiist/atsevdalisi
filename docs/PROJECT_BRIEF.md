# AT SEVDALISI --- Claude Code Master Project Brief

> **Amaç:** Bu doküman, Claude Code'a verilecek ana proje briefidir.
> Claude Code bu dokümanı projenin ürün vizyonu, mimarisi, oyun akışı,
> algoritmaları, veri modeli, geliştirme sırası ve teknik kuralları için
> "source of truth" olarak kullanmalıdır.
>
> **Önemli:** Önce planlama ve altyapı hazırlanacak, sonra oyun
> akışları, ardından algoritmalar ve en son kodlama yapılacaktır. Claude
> Code eksik veya belirsiz bir konuda doğrudan büyük miktarda kod
> üretmek yerine önce mimari kararı netleştirmeli ve küçük, test
> edilebilir parçalar halinde ilerlemelidir.
>
> **Editör notu (bu depo için):** Bu brief, projenin orijinal ve değişmez
> "source of truth" belgesidir; içeriği aynen korunmuştur. Ancak proje
> sahibinin açık talebiyle istemci mimarisi **Unity + C#** yerine
> **web tabanlı, responsive ve mobil uyumlu** bir mimariye pivot
> edilmiştir. Bu pivotun gerekçeleri ve güncel mimari kararlar için
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) dosyasına bakınız. Aşağıdaki
> metinde geçen "Unity", "C#", "ASP.NET Core" gibi teknoloji isimleri
> tarihsel referans olarak korunmuş, güncel karşılıkları ARCHITECTURE.md
> içinde eşlenmiştir.

---

## 1. PROJE TANIMI

### 1.1 Geçici proje adı

**AT SEVDALISI**

İsim daha sonra değiştirilebilir. Kod içerisinde isim sabitlere ve
konfigürasyona gömülmemelidir.

### 1.2 Oyun türü

3D at yarışı + at sahibi/yönetici simülasyonu + ekonomik yönetim +
antrenman + yetiştiricilik + çevrim içi rekabet.

Oyuncu doğrudan sadece yarış kazanmaya çalışan bir jokey değildir. Ana
fantezi:

> Küçük bir ahırla başlayıp güçlü atlar yetiştiren, yarış kazanan,
> ekonomik olarak büyüyen ve kendi yarış ekosistemini kuran başarılı bir
> at sahibi/yönetici olmak.

### 1.3 Ana oyun döngüsü

```text
At bul
  ↓
Atı satın al / sahiplen
  ↓
Ahıra getir
  ↓
Veteriner kontrolü
  ↓
Atın kondisyonunu ve özelliklerini analiz et
  ↓
Antrenman planı oluştur
  ↓
Beslenme + bakım + dinlenme
  ↓
Yarış seç
  ↓
Jokey seç
  ↓
Yarış taktiği belirle
  ↓
Yarışa katıl
  ↓
Race Engine sonucu hesaplar
  ↓
3D yarış sonucu görselleştirilir
  ↓
Derece / ödül / XP / itibar
  ↓
At gelişimi
  ↓
Yorgunluk / sağlık / form güncellemesi
  ↓
Yeni yarış / satış / yetiştiricilik
  ↓
Yeni nesil atlar
  ↓
Daha büyük ahır ve çiftlik
```

---

## 2. REFERANS ÜRÜN VİZYONU

Kullanıcının sağladığı UI konseptinde aşağıdaki ana yapı
hedeflenmektedir:

-   Ana Sayfa
-   Ahırım
-   At Pazarı
-   Yarışlar
-   Antrenman
-   Çiftlik
-   Online
-   Sıralama
-   Kulüp

Üst bilgi alanı:

-   Oyuncu avatarı
-   Oyuncu adı
-   Seviye
-   XP ilerlemesi
-   Para
-   Premium para/gem
-   Mesajlar
-   Bildirimler
-   Ayarlar
-   Menü
-   Oyun içi tarih/saat
-   Hava durumu
-   Lokasyon

Ana ekran:

-   Büyük hero alanı
-   At/jokey/hipodrom görseli
-   Son yarış sonuçları
-   Hızlı erişim kartları
-   Ahır özeti
-   At listesi
-   Seçili atın özellikleri
-   Bakım ve antrenman aksiyonları

Yarış ekranı:

-   Pist
-   Atlar
-   Jokeyler
-   Pozisyon sıralaması
-   Hız göstergesi
-   Yarış zamanı
-   Kamera seçenekleri
-   Mini harita/pist görünümü
-   Son düzlük/sprint bilgisi
-   Finish/photo-finish

Bu görünüm birebir başka bir ticari oyunun kopyası olmayacak; özgün UI,
özgün asset, özgün isimlendirme ve özgün oyun mekaniği kullanılacaktır.

---

## 3. ÜRÜN HEDEFLERİ

### 3.1 Birincil hedefler

1.  Kolay öğrenilen ama derin stratejiye sahip olmak.
2.  Atın sadece "güçlü bir sayıdan" ibaret olmamasını sağlamak.
3.  Yarış sonucunun antrenman, sağlık, form, pist, mesafe, hava, jokey
    ve taktiklerden etkilenmesi.
4.  Oyuncunun uzun vadeli yatırım yapmasını sağlamak.
5.  Yetiştiricilik/genetik sisteminin oyunun önemli bir parçası olması.
6.  Online rekabeti adil ve server-authoritative tasarlamak.
7.  Yarış animasyonunun gerçek sonucu değiştirmemesini sağlamak.
8.  Oyuncunun her yarıştan sonra "neden kazandım/kaybettim?" sorusunun
    cevabını görebilmesi.

### 3.2 İkincil hedefler

-   Kulüp sistemi
-   Sezonlar
-   Turnuvalar
-   Dünya/Türkiye sıralaması
-   Başarılar
-   Görev sistemi
-   Sosyal özellikler
-   Pazar/ihale sistemi
-   Genişletilebilir çiftlik
-   Gelişmiş genetik
-   Mobil/PC uyumluluğu

---

## 4. MVP KAPSAMI

İlk sürüm gereksiz yere devasa yapılmayacaktır.

### MVP'de bulunacaklar

#### Oyuncu

-   Kayıt/giriş
-   Profil
-   Level
-   XP
-   Para
-   Premium currency
-   Basit görevler

#### Ahır

-   Ahır
-   En az 3-5 at
-   At listesi
-   At detay ekranı
-   At istatistikleri
-   Sağlık
-   Enerji
-   Yorgunluk
-   Moral
-   Kondisyon

#### At

-   İsim
-   Cinsiyet
-   Yaş
-   Seviye
-   XP
-   Özellikler
-   Gizli potansiyel
-   Genetik yapı
-   Sağlık durumu
-   Antrenman geçmişi
-   Yarış geçmişi

#### Antrenman

-   Hız
-   Sprint
-   Dayanıklılık
-   Start
-   Viraj
-   Tempo
-   Dinlenme

#### Bakım

-   Tımar
-   Yem
-   Su
-   Temizlik
-   Veteriner
-   Nalbant
-   Dinlendirme

#### Yarış

-   Pist
-   Mesafe
-   Zemin
-   Hava
-   Atlar
-   Jokey
-   Taktik
-   Yarış sonucu
-   Derece
-   Ödül
-   XP

#### Ekonomi

-   Yarış ödülü
-   At satın alma
-   At satma
-   Antrenman maliyeti
-   Veteriner maliyeti
-   Yarış giriş ücreti

#### İlk online altyapı

-   Server-authoritative race simulation
-   Yarış ID
-   Seed
-   Race result
-   Leaderboard için temel veri

---

## 5. GELİŞTİRME FAZLARI

### FAZ 0 --- Teknik keşif ve planlama

Claude Code:

-   repository yapısını oluşturacak
-   teknoloji kararlarını yazılı hale getirecek
-   coding conventions belirleyecek
-   environment dosyalarını hazırlayacak
-   database migration altyapısını kuracak
-   test altyapısını kuracak
-   dokümantasyon klasörünü oluşturacak

Bu aşamada büyük oyun mekaniği kodu yazılmayacak.

### FAZ 1 --- Core

-   Player
-   Authentication
-   Economy
-   Horse
-   Stable
-   Horse stats
-   Training
-   Care
-   Basic race engine
-   Race result
-   Progression

### FAZ 2 --- Management

-   Horse market
-   Buy/sell
-   Vet
-   Farrier
-   Nutrition
-   Jockey
-   Staff
-   Stable capacity
-   Costs

### FAZ 3 --- Genetics

-   Pedigree
-   Mare/stallion
-   Genetic traits
-   Inheritance
-   Mutation
-   Foal
-   Growth
-   Bloodline

### FAZ 4 --- Farm

-   Stable upgrade
-   Paddock
-   Training track
-   Vet center
-   Breeding center
-   Staff facilities
-   Facility bonuses

### FAZ 5 --- Advanced Race Engine

-   Continuous simulation
-   Pace
-   Position
-   Overtaking
-   Blocking
-   Turns
-   Lane changes
-   Sprint
-   Fatigue
-   Jockey decisions
-   Photo finish
-   Replay
-   Cameras

### FAZ 6 --- 3D Presentation

-   Race track
-   Horse models
-   Jockey models
-   Animations
-   Camera system
-   UI
-   VFX
-   Audio
-   Crowd
-   Weather

### FAZ 7 --- Online

-   Matchmaking
-   PvP
-   Race rooms
-   Leaderboards
-   Clubs
-   Tournaments
-   Seasons
-   Anti-cheat
-   Server-authoritative simulation

---

## 6. TEKNOLOJİ MİMARİSİ

Önerilen yapı:

```text
                ┌─────────────────────┐
                │      Unity Client   │
                │       C# / UI       │
                └──────────┬──────────┘
                           │ HTTPS/WebSocket
                           ▼
                ┌─────────────────────┐
                │      API Server     │
                │ Authentication      │
                │ Player Management   │
                │ Economy             │
                │ Horse Management    │
                └──────────┬──────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
       PostgreSQL        Redis       Race Service
                                      Server
                                         │
                                         ▼
                                  Race Simulation
                                         │
                                         ▼
                                  Race Result
```

### Client

Unity + C#

Sorumluluklar:

-   UI
-   3D
-   Animasyon
-   Kamera
-   Input
-   Local presentation
-   API iletişimi
-   Race result rendering

### Backend

Önerilen:

-   ASP.NET Core
-   PostgreSQL
-   Redis
-   REST API
-   WebSocket gerektiğinde

Backend sorumlulukları:

-   Player
-   Horse
-   Economy
-   Training
-   Race registration
-   Race result
-   Inventory
-   Market
-   Breeding
-   Online state

### Race Server

Yarış sonucu server tarafından hesaplanmalıdır.

Client:

```text
"Yarışı göster"
```

demelidir.

Client:

```text
"Benim atım kazandı"
```

diyememelidir.

---

## 7. VERİ MODELİ

### Player

```text
Player
- id
- username
- display_name
- avatar_id
- level
- xp
- money
- gems
- reputation
- created_at
- updated_at
```

### Horse

```text
Horse
- id
- owner_id
- name
- gender
- breed
- birth_date
- level
- xp
- quality
- potential
- health
- fitness
- fatigue
- energy
- morale
- weight
- status
- sire_id
- dam_id
- created_at
- updated_at
```

### Horse Stats

```text
HorseStats
- horse_id
- speed
- acceleration
- stamina
- strength
- agility
- balance
- stride_length
- stride_frequency
- start_speed
- early_speed
- mid_speed
- finish_speed
- sprint
- endurance
- cornering
- positioning
- temperament
- focus
- courage
- competitiveness
- stress_resistance
- obedience
```

### Surface Compatibility

```text
HorseSurfaceStats
- horse_id
- grass
- dirt
- wet
- heavy
- dry
- mud
```

### Distance Compatibility

```text
HorseDistanceStats
- horse_id
- short_distance
- middle_distance
- long_distance
```

### Horse Health

```text
HorseHealth
- horse_id
- health
- injury_risk
- recovery_rate
- muscle_condition
- joint_condition
- respiratory_condition
- weight_condition
- last_vet_check
```

### Training

```text
TrainingSession
- id
- horse_id
- type
- intensity
- duration
- stat_gain
- fatigue_gain
- injury_risk
- created_at
```

### Race

```text
Race
- id
- track_id
- name
- distance
- surface
- weather
- temperature
- wind
- humidity
- participant_limit
- entry_fee
- prize_pool
- start_time
- status
- simulation_seed
```

### Race Entry

```text
RaceEntry
- id
- race_id
- horse_id
- jockey_id
- gate_position
- tactical_style
- risk_level
- final_time
- finish_position
- performance_score
```

### Jockey

```text
Jockey
- id
- name
- experience
- start_skill
- tactical_skill
- sprint_skill
- horse_control
- risk_management
- track_knowledge
```

### Market Listing

```text
MarketListing
- id
- seller_id
- horse_id
- price
- listing_type
- status
- created_at
- expires_at
```

### Breeding

```text
BreedingPair
- id
- mare_id
- stallion_id
- prediction
- fee
- created_at
```

### Pedigree

```text
Pedigree
- horse_id
- sire_id
- dam_id
- grand_sire_id
- grand_dam_id
- bloodline
```

---

## 8. AT SİSTEMİ

Atın gücü tek bir rating olmayacaktır.

### 8.1 Görünen özellikler

Oyuncunun görebileceği:

-   Hız
-   Çeviklik
-   Dayanıklılık
-   Sprint
-   Start
-   Kondisyon
-   Moral
-   Sağlık
-   Enerji
-   Kalite

### 8.2 Gizli özellikler

Tam olarak gösterilmeyebilir:

-   Gerçek potansiyel
-   Stres toleransı
-   Yarış zekası
-   Son düzlük dayanımı
-   Baskı altında performans
-   Kalabalıkta davranış
-   Viraj karakteri
-   Pist uyumu
-   Mesafe uyumu
-   Recovery rate
-   Injury susceptibility
-   Temperament

Bu sistem keşif hissi yaratmalıdır.

---

## 9. AT DURUM SİSTEMİ

Aşağıdaki değerler birbirinden ayrı tutulmalıdır.

### Health

Uzun vadeli fiziksel sağlık.

### Fitness

Antrenmanla kazanılan yarışa hazır olma seviyesi.

### Fatigue

Son antrenman ve yarışların oluşturduğu yorgunluk.

### Energy

Günlük/oturumluk kullanılabilir enerji.

### Form

Son yarışlar ve hazırlık durumuna göre kısa dönem performans.

### Morale

Atın psikolojik durumu.

Örnek:

```text
health = 94
fitness = 88
fatigue = 21
energy = 76
form = 82
morale = 91
```

Bu değerlerin hiçbiri diğerinin yerine kullanılmamalıdır.

---

## 10. ANTRENMAN ALGORİTMASI

Her antrenman aynı sonucu vermemelidir.

Örnek:

```text
training_gain =
    base_gain
    × intensity_multiplier
    × potential_factor
    × trainer_factor
    × health_factor
    × recovery_factor
```

Yorgunluk:

```text
fatigue_gain =
    base_fatigue
    × intensity_multiplier
    × duration_multiplier
    × current_fatigue_modifier
```

Sakatlık riski:

```text
injury_risk =
    base_risk
    × intensity_multiplier
    × fatigue_modifier
    × health_modifier
    × age_modifier
```

### Diminishing returns

Aynı özelliği sürekli çalıştırmak giderek daha az gelişim sağlamalıdır.

Örneğin:

```text
effective_gain =
    base_gain × (1 - current_stat / max_stat)^0.7
```

Potansiyel sınırına yaklaşınca gelişim yavaşlamalıdır.

---

## 11. BAKIM SİSTEMİ

### Tımar

-   Moral +
-   Küçük sağlık +
-   Temizlik +

### Yem

-   Energy +
-   Weight etkisi
-   Fitness etkisi
-   Uzun dönem sağlık etkisi

### Su

-   Energy +
-   Recovery +

### Temizlik

-   Health küçük +
-   Infection risk -

### Veteriner

-   Health analizi
-   Injury detection
-   Recovery planı
-   Gizli sağlık bilgisi

### Nalbant

-   Hoof condition
-   Running stability
-   Cornering etkisi
-   Injury risk azaltma

### Dinlendir

-   Fatigue -
-   Energy +
-   Fitness kısa süreli stabilizasyon

---

## 12. BESLENME SİSTEMİ

Besin türleri:

-   Standart yem
-   Enerji yemi
-   Protein ağırlıklı yem
-   Recovery yem
-   Performans yemi
-   Vitamin
-   Mineral

Ancak her zaman "daha pahalı yem = daha iyi" olmayacaktır.

Atın:

-   yaşı
-   kilosu
-   antrenman yoğunluğu
-   sağlık durumu
-   yarış mesafesi
-   recovery ihtiyacı

beslenme etkisini değiştirecektir.

---

## 13. JOKEY SİSTEMİ

Jokey sadece kozmetik olmayacaktır.

Jokey özellikleri:

```text
start_skill
tactical_skill
sprint_skill
horse_control
risk_management
experience
track_knowledge
```

Jokey ile at arasında:

```text
compatibility =
    horse_temperament
    + jockey_style
    + experience
    + previous_pair_history
```

uyumu hesaplanabilir.

---

## 14. YARIŞ SİSTEMİ

### 14.1 Yarış parametreleri

-   Pist
-   Mesafe
-   Zemin
-   Hava
-   Sıcaklık
-   Rüzgar
-   Nem
-   Viraj sayısı
-   Pist eğimi
-   Katılımcı sayısı
-   Start kapısı
-   Pist genişliği

### 14.2 Oyuncu kararları

Yarış öncesi:

#### Yarış stili

-   Önde git
-   Lideri takip et
-   Orta grup
-   Geriden gel

#### Risk

-   Düşük
-   Normal
-   Yüksek

#### Start

-   Agresif
-   Dengeli
-   Kontrollü

#### Son düzlük

-   Erken sprint
-   Normal
-   Son 200 m sprint

---

## 15. YARIŞ MOTORU --- TEMEL FELSEFE

**Kazananı tek bir sayı belirlememelidir.**

Yanlış:

```text
final_rating > diğer atlar
→ kazan
```

Doğru:

```text
At özellikleri
+
form
+
fitness
+
health
+
fatigue
+
track compatibility
+
distance compatibility
+
weather
+
jockey
+
tactic
+
race pace
+
position
+
interaction
+
controlled randomness
=
race simulation
```

---

## 16. YARIŞ MOTORU AŞAMALARI

### Aşama 1 --- Start

Değerlendir:

-   start_speed
-   reaction
-   acceleration
-   jockey_start_skill
-   temperament

### Aşama 2 --- İlk bölüm

Değerlendir:

-   early_speed
-   acceleration
-   chosen strategy
-   gate position
-   jockey tactics

Önde gitmek daha fazla enerji tüketebilir.

### Aşama 3 --- Orta bölüm

Değerlendir:

-   stamina
-   pace
-   position
-   horse temperament
-   jockey decision
-   fatigue

### Aşama 4 --- Virajlar

Değerlendir:

-   agility
-   balance
-   cornering
-   jockey skill
-   lane position

### Aşama 5 --- Son bölüm

Değerlendir:

-   stamina
-   finish_speed
-   sprint
-   morale
-   courage
-   fatigue

### Aşama 6 --- Final sprint

Değerlendir:

-   acceleration
-   sprint
-   remaining stamina
-   tactical decision
-   jockey skill
-   courage

### Aşama 7 --- Finish

Exact finish time hesaplanır.

Sonuç:

```text
1. Horse A — 1:34.82
2. Horse B — 1:35.04
3. Horse C — 1:35.21
...
```

---

## 17. YARIŞ PERFORMANS FORMÜLÜ

Başlangıç modeli:

```text
BaseAbility =
    Speed × 0.25
    + Stamina × 0.20
    + Acceleration × 0.15
    + Fitness × 0.10
    + Tactic × 0.10
    + Jockey × 0.08
    + TrackCompatibility × 0.05
    + Morale × 0.04
    + Form × 0.03
```

Daha sonra bu sistem segment bazlı hale getirilecektir.

Genel model:

```text
RacePerformance =
    BaseAbility
    × ConditionModifier
    × EnvironmentModifier
    × StrategyModifier
    × JockeyModifier
    × PaceModifier
    + RandomFactor
    - FatiguePenalty
    - InjuryPenalty
```

Bu formül sabit kabul edilmemelidir. Kod içerisinde ağırlıklar config
üzerinden yönetilmelidir.

Örneğin:

```text
RaceBalanceConfig
```

içerisinde tutulmalıdır.

---

## 18. CONTROLLED RANDOMNESS

Rastgelelik oyunun önemli parçasıdır fakat adaletsiz olmamalıdır.

Hedef:

```text
%70-85 → gerçek performans
%10-20 → form/koşullar
%5-10  → kontrollü belirsizlik
```

Güçlü at her zaman kazanmayacak.

Zayıf at da sürekli sürpriz yapmayacak.

Random değer:

-   race_id
-   simulation_seed
-   horse_id

üzerinden deterministik üretilebilir.

Böylece aynı race seed tekrar çalıştırıldığında aynı sonuç alınabilir.

Bu özellik:

-   replay
-   server doğrulama
-   debug
-   dispute analysis

için önemlidir.

---

## 19. SEGMENT TABANLI YARIŞ

İlk gelişmiş sürümde yarış:

```text
0m
200m
400m
600m
800m
1000m
1200m
1400m
1600m
```

gibi segmentlere ayrılabilir.

Her segmentte:

```text
current_speed
position
stamina
fatigue
pace
lane
tactical_state
```

güncellenir.

Daha ileri sürümde sürekli zaman simülasyonuna geçilebilir.

---

## 20. PACE SİSTEMİ

Önde koşan at:

-   daha fazla hava direnci/tempo yükü
-   daha fazla stamina tüketimi
-   pozisyon avantajı

yaşayabilir.

Geriden gelen at:

-   stamina tasarrufu
-   son bölüm avantajı
-   fakat trafik/pozisyon riski

yaşayabilir.

Bu sayede yarışlar sadece "en yüksek rating kimde?" şeklinde çalışmaz.

---

## 21. OVERTAKING / BLOKLANMA

Atların birbirleriyle etkileşimi olmalıdır.

Örneğin:

```text
if front_horse blocks lane:
    overtaking_probability -= block_penalty
```

Geçiş ihtimali:

```text
overtake_probability =
    acceleration
    + speed_difference
    + courage
    + jockey_skill
    + available_space
    - traffic_penalty
```

İleri sürümde:

-   iç kulvar
-   dış kulvar
-   önündeki at
-   boşluk
-   viraj
-   pist genişliği

hesaba katılacaktır.

---

## 22. 3D YARIŞ SUNUMU

En önemli prensip:

> Önce yarış simülasyonu yapılır, sonra 3D animasyon bu sonucu
> görselleştirir.

Yanlış mimari:

```text
Animation
→ winner
```

Doğru mimari:

```text
Race Simulation
→ authoritative result
→ race timeline
→ 3D renderer
→ animation
```

3D tarafı sonucu değiştiremez.

---

## 23. RACE TIMELINE

Örnek:

```text
RaceStart
↓
GateOpen
↓
StartPhase
↓
EarlyRace
↓
MidRace
↓
FirstTurn
↓
BackStraight
↓
SecondTurn
↓
FinalStraight
↓
SprintPhase
↓
Finish
↓
PhotoFinish
↓
Results
```

Her aşamada telemetry tutulabilir.

---

## 24. RACE TELEMETRY

Debug ve replay için:

```text
timestamp
horse_id
distance
position
speed
stamina
fatigue
lane
tactical_state
current_rank
```

saklanmalıdır.

Bu bilgiler oyuncuya tamamen gösterilmek zorunda değildir.

---

## 25. FOTO-FİNİŞ

Finish sıralaması animasyon pozisyonundan değil, gerçek simülasyon
zamanından alınmalıdır.

Örneğin:

```text
Horse A: 94.820 sec
Horse B: 94.804 sec
```

B sıralamada önde olmalıdır.

3D görüntü bunu takip etmelidir.

---

## 26. AT GELİŞİMİ

Atın gelişimi:

```text
XP
↓
Level
↓
Stat development
```

Ancak her stat sonsuza kadar artmamalıdır.

Atın:

-   genetik potansiyeli
-   yaşı
-   eğitim kalitesi
-   sağlık
-   antrenör
-   antrenman yoğunluğu

gelişimi etkiler.

---

## 27. YAŞ VE GELİŞİM EĞRİSİ

Atlar:

1.  Yavru
2.  Gelişim
3.  Prime
4.  Olgunluk
5.  Yaşlanma

aşamalarından geçebilir.

Örnek:

```text
growth_factor = age_curve(age)
```

Prime dönemde performans en yüksek seviyeye yaklaşır.

Yaş ilerledikçe:

-   recovery düşebilir
-   injury risk artabilir
-   bazı fiziksel özellikler azalabilir

Ancak deneyim ve yarış zekası gibi bazı özellikler farklı davranabilir.

---

## 28. GENETİK SİSTEM

Yetiştiricilik oyunun uzun vadeli endgame sistemlerinden biridir.

```text
Mare + Stallion
       ↓
Genetic Engine
       ↓
Inherited Traits
       ↓
Mutation
       ↓
Health Check
       ↓
Foal
       ↓
Growth
       ↓
Training
       ↓
Race Career
```

### Kalıtım

Bir özellik:

```text
child_stat =
    parent_A × inheritance_A
    + parent_B × inheritance_B
    + mutation
```

olabilir.

Örnek:

```text
inheritance_A = random(0.35, 0.65)
inheritance_B = 1 - inheritance_A
```

Ancak değerler server tarafından hesaplanmalıdır.

---

## 29. GENETİK GİZLİLİĞİ

Oyuncuya tüm DNA bilgisi verilmemelidir.

Oyuncu:

-   soy
-   ebeveyn özellikleri
-   tahmini potansiyel
-   bilinen kalıtım eğilimleri

görebilir.

Gerçek genetik sonuç zaman içinde keşfedilebilir.

Bu sistem scout/genetik uzmanı gibi staff sistemlerini anlamlı hale
getirir.

---

## 30. AT PAZARI

Pazar türleri:

-   Normal satış
-   Oyuncu satışı
-   NPC satış
-   Açık artırma
-   Genç at
-   Yarış atı
-   Damızlık
-   Özel kan hattı

Fiyat:

```text
MarketValue =
    Quality
    × Potential
    × AgeFactor
    × RaceHistory
    × PedigreeValue
    × Health
    × Demand
```

Bu değer temel modeldir; gerçek fiyat dinamik ekonomiyle değişebilir.

---

## 31. EKONOMİ

Gelir:

-   Yarış ödülü
-   Satış
-   Görev
-   Turnuva
-   Başarı
-   Sezon ödülü
-   Günlük ödül

Gider:

-   At satın alma
-   Yarış giriş ücreti
-   Yem
-   Veteriner
-   Nalbant
-   Antrenman
-   Jokey
-   Personel
-   Ahır
-   Çiftlik geliştirme
-   Yetiştiricilik

Ekonomi backend tarafından authoritative tutulmalıdır.

Client'tan:

```text
money += 100000
```

gibi işlemler kabul edilmemelidir.

---

## 32. ÇİFTLİK

Tesisler:

-   Ahır
-   Paddock
-   Antrenman pisti
-   Veteriner merkezi
-   Nalbant alanı
-   Üreme/yetiştirme merkezi
-   Depo
-   Personel binası

Upgrade örneği:

```text
Stable Level 1
→ 5 horse capacity

Stable Level 2
→ 8 horse capacity

Stable Level 3
→ 12 horse capacity
```

Bonuslar kontrollü olmalıdır.

---

## 33. PERSONEL SİSTEMİ

Personeller:

-   Antrenör
-   Jokey
-   Veteriner
-   Nalbant
-   Seyis
-   Genetik uzmanı
-   Scout
-   Çiftlik yöneticisi

Personel özellikleri:

```text
skill
experience
salary
specialization
morale
contract
```

---

## 34. SCOUT SİSTEMİ

Scout oyuncuya doğrudan gerçek stat yerine tahmin sunabilir.

Örnek:

```text
Tahmini hız: 78-84
Tahmini potansiyel: 85-92
Mesafe: Orta
Çim uyumu: Çok iyi
Sağlık riski: Düşük
```

Daha iyi scout:

```text
78-84
```

yerine:

```text
81-83
```

gibi daha doğru tahmin verebilir.

---

## 35. YARIŞ TAKVİMİ

Yarış türleri:

-   Günlük yarış
-   Haftalık yarış
-   Sezon yarışları
-   Özel kupalar
-   Büyük ödüllü yarışlar
-   Oyuncu PvP yarışları

Her yarış:

```text
RaceTier
EntryRequirement
EntryFee
PrizePool
AllowedHorseLevel
AllowedDistance
AllowedSurface
```

alanlarına sahip olabilir.

---

## 36. SEVİYE SİSTEMİ

Oyuncu level:

```text
1 → 50
```

Örnek unlock:

```text
Level 1:
Basic Stable

Level 5:
Horse Market

Level 10:
Advanced Training

Level 15:
Breeding

Level 20:
Online Tournaments

Level 30:
Advanced Farm

Level 40:
Elite Races

Level 50:
Legendary content
```

Bu değerler config dosyasından değiştirilebilir.

---

## 37. GÜNLÜK OYUN DÖNGÜSÜ

```text
Login
↓
Daily Reward
↓
Horse Status Check
↓
Training
↓
Feeding
↓
Care
↓
Vet / Rest
↓
Race Selection
↓
Jockey Selection
↓
Tactics
↓
Race
↓
Result
↓
Reward
↓
Horse Development
↓
Market
↓
Tasks
↓
Online
↓
Logout
```

---

## 38. ANA SAYFA

Ana sayfa oyuncuya özet bilgi vermelidir.

Kartlar:

### Oyuncu

-   Level
-   XP
-   Money
-   Gems

### Ahır

-   At sayısı
-   Ortalama kondisyon
-   Sağlık uyarıları

### Son yarış

-   Yarış adı
-   Mesafe
-   Derece
-   Sonuç

### Hızlı işlemler

-   Atını Yönet
-   At Pazarı
-   Yarışlara Katıl
-   Antrenman
-   Çiftlik
-   Online

---

## 39. AHIR EKRANI

At listesi:

```text
Şimşek
Kara Yel
Fırtına
Bulut
Prens
```

Her kart:

-   Avatar/model
-   Level
-   Health
-   Energy
-   Fitness
-   Fatigue
-   Morale
-   Race form

At detay sekmeleri:

```text
Genel Bilgi
Bakım
Antrenman
Genetik
Geçmiş
```

---

## 40. AT DETAY EKRANI

### Genel

-   İsim
-   Yaş
-   Cinsiyet
-   Seviye
-   XP
-   Kalite
-   Potansiyel

### Performans

-   Hız
-   Çeviklik
-   Dayanıklılık
-   Sprint
-   Start
-   Kondisyon

### Durum

-   Sağlık
-   Enerji
-   Moral
-   Yorgunluk

### Geçmiş

-   Yarış
-   Derece
-   Ödül
-   Rakipler
-   Pist
-   Mesafe

---

## 41. ONLINE MİMARİ

Online yarışlarda:

```text
Client A
Client B
Client C
     ↓
Race Server
     ↓
Race Simulation
     ↓
Race Result
     ↓
All Clients
```

Client sadece kendi local görünümünü kontrol edemez.

Server:

-   participant validation
-   horse snapshot
-   jockey snapshot
-   race configuration
-   seed
-   simulation
-   result
-   reward

üretir.

---

## 42. ONLINE GÜVENLİK

Client'tan gelen:

```text
horse_speed
horse_money
race_result
reward_amount
```

gibi kritik veriler authoritative kabul edilmemelidir.

Client:

```text
"Bu atın speed'i 99"
```

derse backend kendi DB değerini kullanmalıdır.

---

## 43. SIRALAMA

Sıralamalar:

-   Global
-   Türkiye
-   Arkadaşlar
-   Kulüp
-   Sezon
-   Haftalık
-   Aylık

Puan:

```text
RankingScore =
    RacePerformance
    + WinBonus
    + PlacementBonus
    + TournamentBonus
```

Elo benzeri sistem PvP için ayrıca uygulanabilir.

---

## 44. KULÜP

Kulüp özellikleri:

-   Kulüp adı
-   Logo
-   Üyeler
-   Kulüp seviyesi
-   Kulüp puanı
-   Kulüp sıralaması
-   Kulüp sohbeti
-   Kulüp yarışları
-   Kulüp görevleri

---

## 45. GÖREV SİSTEMİ

Görev örnekleri:

```text
1 yarışa katıl
3 antrenman yap
Bir at satın al
Atını veteriner kontrolüne götür
Yarış kazan
Bir at sat
Bir tay yetiştir
10.000 para kazan
```

Ödüller:

-   XP
-   Money
-   Gems
-   Item
-   Reputation

---

## 46. BİLDİRİM SİSTEMİ

Bildirim örnekleri:

```text
Atın antrenmanını tamamladı.
Atın yoruldu.
Veteriner kontrolü gerekli.
Yarış başlıyor.
Pazardaki ilanının süresi doldu.
Atın yarış kazandı.
Kulübün yeni yarışa katıldı.
```

Backend event tabanlı tasarlanabilir.

---

## 47. UI / UX PRENSİPLERİ

UI:

-   modern
-   premium
-   okunabilir
-   hızlı
-   az tıklamalı
-   responsive
-   masaüstü ve mobil uyumlu

Renkler tema config üzerinden yönetilmelidir.

UI ile game logic birbirine doğrudan bağlanmamalıdır.

Yanlış:

```text
Button → Database
```

Doğru:

```text
Button
→ ViewModel
→ Service
→ API
→ Domain
→ Result
→ UI
```

---

## 48. KOD MİMARİSİ

Önerilen repository (orijinal, Unity temelli):

```text
/at-sevdalisi
│
├── docs/
│   ├── PROJECT_BRIEF.md
│   ├── ARCHITECTURE.md
│   ├── GAME_DESIGN.md
│   ├── GAME_FLOW.md
│   ├── ALGORITHMS.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── RACE_ENGINE.md
│   ├── GENETICS.md
│   ├── ECONOMY.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   └── ROADMAP.md
│
├── client/
│   └── unity/
│       ├── Assets/
│       │   ├── Art/
│       │   ├── Audio/
│       │   ├── Materials/
│       │   ├── Prefabs/
│       │   ├── Scenes/
│       │   ├── Scripts/
│       │   └── UI/
│       │
│       └── ProjectSettings/
│
├── server/
│   ├── Api/
│   ├── Application/
│   ├── Domain/
│   ├── Infrastructure/
│   ├── RaceEngine/
│   └── Tests/
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── config/
│   ├── race/
│   ├── horses/
│   ├── economy/
│   ├── training/
│   └── progression/
│
└── tools/
```

> **Güncel not:** Bu depoda `client/unity/` yerine `apps/web/` (Next.js),
> `server/` yerine `apps/api/` (NestJS) kullanılmıştır. Katman isimleri
> (Domain/Application/Infrastructure/API) aynen korunmuştur. Bkz.
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3.

---

## 49. BACKEND KATMANLARI

### Domain

Saf oyun kuralları.

Örnek:

```text
Horse
Race
RaceEntry
TrainingSession
BreedingPair
MarketListing
```

### Application

Use case'ler:

```text
BuyHorse
SellHorse
TrainHorse
FeedHorse
EnterRace
StartRace
SimulateRace
BreedHorse
UpgradeStable
```

### Infrastructure

-   PostgreSQL
-   Redis
-   External services
-   Messaging

### API

REST endpointleri.

---

## 50. API ÖRNEKLERİ

### Auth

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

### Player

```http
GET /api/player/me
GET /api/player/profile
GET /api/player/stats
```

### Horses

```http
GET /api/horses
GET /api/horses/{id}
POST /api/horses/{id}/train
POST /api/horses/{id}/feed
POST /api/horses/{id}/care
POST /api/horses/{id}/vet
POST /api/horses/{id}/rest
```

### Market

```http
GET /api/market/horses
POST /api/market/listings
POST /api/market/listings/{id}/buy
DELETE /api/market/listings/{id}
```

### Race

```http
GET /api/races
GET /api/races/{id}
POST /api/races/{id}/enter
POST /api/races/{id}/start
GET /api/races/{id}/result
```

### Breeding

```http
GET /api/breeding/options
POST /api/breeding
GET /api/breeding/{id}
```

---

## 51. EVENT SİSTEMİ

İleri aşamada domain event kullanılabilir.

Örnek:

```text
HorseTrained
HorseFed
HorseRested
HorseInjured
HorseHealed
RaceEntered
RaceStarted
RaceFinished
HorseWonRace
HorseSold
HorseBred
FoalBorn
StableUpgraded
```

Bu eventler:

-   notification
-   achievement
-   analytics
-   quest
-   economy

sistemlerini tetikleyebilir.

---

## 52. CONFIGURATION SİSTEMİ

Hard-coded değerlerden kaçınılmalıdır.

Yanlış:

```csharp
fatigue += 15;
```

Doğru:

```csharp
fatigue += trainingConfig.Sprint.HighIntensityFatigue;
```

Config:

```text
TrainingConfig
RaceConfig
HorseGrowthConfig
EconomyConfig
MarketConfig
GeneticsConfig
RewardConfig
LevelConfig
WeatherConfig
```

---

## 53. TEST STRATEJİSİ

Özellikle oyun algoritmaları unit test ile korunmalıdır.

### Race Engine testleri

-   Daha yüksek speed genel olarak daha hızlı olmalı.
-   Daha düşük stamina uzun yarışlarda dezavantaj yaratmalı.
-   Grass specialist çimde avantaj sağlamalı.
-   Dirt specialist dirt pistte avantaj sağlamalı.
-   Fatigue performansı azaltmalı.
-   Injury performansı azaltmalı.
-   Jockey farkı anlamlı ama aşırı olmamalı.
-   Randomness sınırlandırılmış olmalı.
-   Aynı seed + aynı input = aynı sonuç.

### Genetics testleri

-   Çocuk özellikleri ebeveyn dağılımından çıkmalı.
-   Mutation sınırları aşmamalı.
-   Potansiyel sınırlandırılmalı.
-   Soy bağlantısı doğru kaydedilmeli.

### Economy testleri

-   Negatif para oluşmamalı.
-   Aynı işlem iki kez uygulanmamalı.
-   Race reward server tarafından verilmelidir.
-   Satın alma atomik olmalıdır.

---

## 54. IDEMPOTENCY

Özellikle ödeme ve ödül sistemlerinde aynı request'in iki kere işlenmesi
engellenmelidir.

Örneğin:

```text
POST /race/claim-reward
Idempotency-Key: abc123
```

aynı key ikinci kez geldiğinde ikinci ödül verilmemelidir.

---

## 55. DATABASE KURALLARI

Para gibi kritik değerlerde:

-   transaction
-   row locking
-   atomic update

kullanılmalıdır.

Örnek:

```text
BEGIN
check balance
deduct money
create horse ownership
COMMIT
```

İşlem yarıda kalırsa rollback yapılmalıdır.

---

## 56. RACE SNAPSHOT

Yarış başladığında atın o anki değerleri snapshot alınmalıdır.

Örnek:

```text
HorseSnapshot
- horse_id
- speed
- stamina
- acceleration
- fitness
- fatigue
- health
- morale
- surface_compatibility
- distance_compatibility
- jockey_stats
- tactic
```

Yarış sırasında oyuncu atın temel statını değiştirerek sonucu manipüle
edememelidir.

---

## 57. RACE RESULT

Race result aşağıdakileri saklamalıdır:

```text
race_id
simulation_seed
horse_id
finish_position
finish_time
performance_score
segment_data
jockey_id
```

Gerekirse replay üretilebilir.

---

## 58. REPLAY SİSTEMİ

İlk aşamada tam video kaydetmek yerine:

```text
RaceSeed
+
RaceConfig
+
HorseSnapshots
+
PlayerTactics
```

saklanabilir.

Aynı simülasyon yeniden çalıştırılarak replay üretilebilir.

İleri aşamada telemetry cache tutulabilir.

---

## 59. AI RAKİPLER

NPC atlar rastgele oluşturulmamalıdır.

Her NPC'nin:

-   kalite
-   potansiyel
-   yarış stili
-   jokey
-   risk profili
-   pist tercihi
-   mesafe tercihi
-   formu

olmalıdır.

NPC racing styles:

```text
FrontRunner
Tracker
MidPack
Closer
Aggressive
Conservative
```

---

## 60. RACE AI

Jokey AI kararları:

```text
if stamina_low:
    reduce_pace()

if final_straight and sprint_available:
    push_for_finish()

if blocked:
    search_overtake_lane()

if opponent_close and risk_allowed:
    defend_position()
```

Bu sistem daha sonra Utility AI / Behavior Tree gibi yapılara
taşınabilir.

---

## 61. HAVA VE PİST

Pist koşulları yarış performansını değiştirmelidir.

Örnek:

```text
Sunny + Dry Grass
Rain + Wet Grass
Rain + Heavy Track
Dry Dirt
Windy
Cold
Hot
```

Atın çevre uyumu:

```text
environment_modifier =
    surface_modifier
    × weather_modifier
    × temperature_modifier
    × distance_modifier
```

---

## 62. MESAFE SİSTEMİ

Mesafe kategorileri:

```text
Short
Middle
Long
```

Örnek:

```text
800m
1000m
1200m
1400m
1600m
1800m
2000m
2400m
```

Uzun yarışlarda stamina ağırlığı artmalıdır.

Kısa yarışlarda:

-   acceleration
-   start
-   sprint

daha önemli olabilir.

---

## 63. OYUNCU KARARLARININ ETKİSİ

Oyuncunun yaptığı seçimler yarış sonucuna etki etmeli ancak %100 sonucu
belirlememelidir.

Örneğin:

```text
Good Horse
+ Good Training
+ Good Health
+ Suitable Track
+ Correct Tactic
= High Win Probability
```

Fakat:

```text
High Win Probability ≠ Guaranteed Win
```

Bu prensip oyunun tamamında korunmalıdır.

---

## 64. ANTI-CHEAT

Client hiçbir zaman:

-   yarış sonucunu
-   para miktarını
-   at statlarını
-   ödülü
-   inventory'yi

authoritative olarak belirleyemez.

Server:

```text
validate
calculate
persist
notify
```

yapmalıdır.

---

## 65. LOGGING

Her kritik işlem loglanmalıdır:

```text
PlayerId
Action
EntityId
OldValue
NewValue
Timestamp
RequestId
```

Özellikle:

-   money
-   gems
-   horse ownership
-   race reward
-   breeding
-   market purchase

için audit log tutulmalıdır.

---

## 66. ANALYTICS

İleri aşamada eventler:

```text
player_registered
horse_created
horse_purchased
horse_sold
training_completed
race_entered
race_finished
race_won
race_lost
breeding_started
foal_born
stable_upgraded
```

olarak izlenebilir.

---

## 67. MONETIZATION

Oyun yönetim/simülasyon merkezli olmalıdır.

Monetization seçenekleri:

-   kozmetik
-   avatar
-   stable decoration
-   horse cosmetics
-   jockey cosmetics
-   premium season
-   convenience items

Ancak oyuncuya doğrudan gerçek para ile "garantili yarış galibiyeti"
satılmamalıdır.

Gerçek para ile bahis/kumar mekaniği oyunun çekirdeği olmayacaktır.

---

## 68. GÖREVLER VE RETENTION

Oyuncuya sürekli yeni hedef verilmelidir:

```text
Daily
Weekly
Seasonal
Achievement
Club
Tournament
```

Örnek:

```text
Bugün:
- 2 antrenman
- 1 yarış
- 1 bakım

Bu hafta:
- 5 yarış
- 1 galibiyet
- 1 at satın al

Sezon:
- Top 100
- Büyük Kupaya katıl
```

---

## 69. SEZON SİSTEMİ

Her sezon:

-   yarış takvimi
-   leaderboard
-   görevler
-   ödüller
-   özel turnuvalar

içerebilir.

Sezon reseti oyuncunun tüm ilerlemesini silmemelidir.

Sadece sezon skorları resetlenir.

---

## 70. UI EKRAN HARİTASI

```text
Ana Sayfa
├── Profil
├── Son Yarış
├── Ahır Özeti
├── Görevler
└── Hızlı Erişim

Ahırım
├── At Listesi
├── At Detay
│   ├── Genel
│   ├── Bakım
│   ├── Antrenman
│   ├── Genetik
│   └── Geçmiş
└── Ahır Yönetimi

At Pazarı
├── Liste
├── Filtre
├── At Detay
├── Satın Al
└── Satışlarım

Yarışlar
├── Takvim
├── Yarış Detay
├── Katılım
├── Jokey
├── Taktik
└── Yarış

Antrenman
├── At Seç
├── Program
├── Yoğunluk
└── Sonuç

Çiftlik
├── Ahır
├── Paddock
├── Antrenman Tesisi
├── Veteriner
├── Üreme Merkezi
└── Upgrade

Online
├── PvP
├── Matchmaking
├── Turnuva
└── Sonuçlar

Sıralama
├── Global
├── Türkiye
├── Sezon
└── Arkadaşlar

Kulüp
├── Kulüp
├── Üyeler
├── Görevler
├── Yarışlar
└── Sıralama
```

---

## 71. CLAUDE CODE ÇALIŞMA KURALLARI

Claude Code aşağıdaki kurallara uymalıdır.

### Kural 1

İlk olarak repository'yi analiz et.

### Kural 2

Mevcut kodu bozmadan önce plan çıkar.

### Kural 3

Büyük dosyalar oluşturma.

### Kural 4

Domain logic ile UI logic'i ayır.

### Kural 5

Database erişimini domain sınıflarına gömme.

### Kural 6

Magic number kullanma.

### Kural 7

Config kullan.

### Kural 8

Critical game logic için unit test yaz.

### Kural 9

Online sistemde server authoritative yaklaşımı koru.

### Kural 10

Race result client tarafından belirlenemez.

### Kural 11

Aynı seed + aynı snapshot + aynı config = aynı race sonucu.

### Kural 12

Kod yazmadan önce ilgili modülün amacı ve bağımlılıkları belirlenmeli.

### Kural 13

Her büyük modülden sonra test çalıştır.

### Kural 14

Build kırılırsa yeni özellik ekleme; önce build problemini çöz.

### Kural 15

Bir sistemi değiştirmeden önce bağlı sistemleri kontrol et.

---

## 72. CLAUDE CODE GELİŞTİRME PROTOKOLÜ

Her görev şu formatta ilerlemelidir:

```text
1. ANALYZE
2. PLAN
3. IMPLEMENT
4. TEST
5. VERIFY
6. DOCUMENT
```

Örneğin "Race Engine oluştur":

### ANALYZE

-   Horse domain
-   Race domain
-   Jockey
-   Config
-   DB
-   API

incelenir.

### PLAN

Race Engine interface ve servisleri belirlenir.

### IMPLEMENT

Kod yazılır.

### TEST

Race simulation unit testleri çalıştırılır.

### VERIFY

Determinism kontrol edilir.

### DOCUMENT

`docs/RACE_ENGINE.md` güncellenir.

---

## 73. İLK GELİŞTİRİLECEK MODÜLLER

Sıra kesinlikle rastgele değiştirilmemelidir.

```text
1. Repository
2. Documentation
3. Backend skeleton
4. Database
5. Authentication
6. Player
7. Economy
8. Horse
9. Stable
10. Training
11. Care
12. Jockey
13. Race domain
14. Race Engine
15. Race Result
16. Market
17. Genetics
18. Farm
19. Unity UI
20. Unity 3D
21. Online
22. Leaderboard
23. Club
24. Tournament
```

> **Güncel not:** 19-20. maddeler ("Unity UI", "Unity 3D") bu depoda
> "Web UI (Next.js)" ve "Web 3D/Görsel Sunum (Three.js)" olarak
> uygulanacaktır. Sıra ve mantık aynen korunmuştur.

---

## 74. İLK PROTOTİP HEDEFİ

İlk oynanabilir prototipte sadece şu akış çalışmalıdır:

```text
Login
↓
Ana Sayfa
↓
Ahırım
↓
At seç
↓
Atı incele
↓
Antrenman
↓
Bakım
↓
Yarış seç
↓
Jokey seç
↓
Taktik seç
↓
Yarış başlat
↓
Race Engine
↓
Sonuç
↓
Ödül
↓
XP
↓
At gelişimi
```

Bu akış stabil olmadan:

-   breeding
-   club
-   advanced marketplace
-   tournament
-   complex social system

geliştirilmeye başlanmamalıdır.

---

## 75. ACCEPTANCE CRITERIA --- MVP

MVP başarılı sayılmak için:

-   [ ] Oyuncu oluşturulabiliyor.
-   [ ] Oyuncunun para ve XP'si tutuluyor.
-   [ ] Oyuncunun ahırı var.
-   [ ] At oluşturulabiliyor.
-   [ ] At detayları görüntülenebiliyor.
-   [ ] Antrenman yapılabiliyor.
-   [ ] Antrenman stat/fatigue etkisi oluşturuyor.
-   [ ] Bakım yapılabiliyor.
-   [ ] Yarış oluşturulabiliyor.
-   [ ] At yarışa kaydedilebiliyor.
-   [ ] Jokey seçilebiliyor.
-   [ ] Taktik seçilebiliyor.
-   [ ] Race Engine sonuç üretiyor.
-   [ ] Race Engine deterministic çalışıyor.
-   [ ] Sonuç server tarafında hesaplanıyor.
-   [ ] Ödül server tarafından veriliyor.
-   [ ] XP güncelleniyor.
-   [ ] At gelişimi kaydediliyor.
-   [ ] Race history görülebiliyor.
-   [ ] Kritik işlemler transaction içinde.
-   [ ] Temel unit testler mevcut.
-   [ ] Dokümantasyon güncel.

---

## 76. PERFORMANS HEDEFLERİ

Unity (orijinal):

-   UI mümkün olduğunca hafif
-   Object pooling
-   Addressables gerektiğinde
-   Gereksiz Update kullanımından kaçınma
-   GPU/CPU profiling
-   LOD
-   texture optimization

> **Güncel karşılığı (Web):** bkz. `ARCHITECTURE.md` §7 (Core Web Vitals,
> code-splitting, asset optimizasyonu, Three.js sahne bütçesi).

Backend:

-   async I/O
-   caching
-   pagination
-   database indexes
-   Redis gerektiğinde
-   connection pooling

Race Engine:

-   server tarafında ölçeklenebilir
-   aynı anda çok sayıda yarış çalıştırılabilecek yapı
-   deterministic
-   düşük CPU maliyeti
-   replay destekli

---

## 77. DATABASE INDEXLERİ

Önemli sorgular için index:

```text
Horse.owner_id
Horse.level
Horse.status
Race.start_time
Race.status
RaceEntry.race_id
RaceEntry.horse_id
MarketListing.status
MarketListing.price
MarketListing.created_at
Leaderboard.season_id
Leaderboard.player_id
```

---

## 78. CACHE

Redis kullanılabilecek alanlar:

-   Player session
-   Leaderboard
-   Active races
-   Race lobby
-   Market hot queries
-   Configuration cache

Ancak kritik finansal state Redis'e tek authoritative source olarak
bırakılmamalıdır.

---

## 79. ERROR HANDLING

API:

```json
{
  "success": false,
  "error": {
    "code": "HORSE_TOO_TIRED",
    "message": "Bu at şu anda yarışa hazır değil."
  }
}
```

Error code'lar frontend'den bağımsız tutulmalıdır.

---

## 80. SAVE / STATE KURALLARI

Oyuncunun state'i:

```text
Player
Horses
Stable
Farm
Inventory
Economy
Progression
Achievements
RaceHistory
```

olarak güvenli şekilde persist edilmelidir.

Client local save authoritative değildir.

---

## 81. DEBUG ARAÇLARI

Development build'de:

```text
Debug Race
Give Money
Set Horse Stats
Set Horse Fatigue
Force Weather
Force Track
Run Race With Seed
Compare Race Results
Inspect Race Telemetry
```

gibi araçlar bulunabilir.

Production build'de bunlar kapatılmalıdır.

---

## 82. BALANCE TOOL

Oyun değerleri kod değişmeden ayarlanabilmelidir.

Örneğin:

```text
speed_weight = 0.25
stamina_weight = 0.20
acceleration_weight = 0.15
```

değiştirildiğinde build yeniden kodlanmadan config
değiştirilebilmelidir.

---

## 83. RACE BALANCE TEST

Binlerce simülasyon çalıştırılarak:

```text
Win Rate
Top 3 Rate
Average Finish Time
Upset Rate
Surface Effect
Distance Effect
Jockey Effect
Fatigue Effect
```

ölçülmelidir.

Örnek:

```text
10000 races
↓
distribution analysis
↓
balance report
```

Bu, yarış motorunun gerçekten adil olup olmadığını anlamak için zorunlu
hale getirilmelidir.

---

## 84. AI BALANCE

NPC atlar oyuncuyu yapay şekilde engellememelidir.

AI sistemi:

```text
Difficulty
```

için gizli bonus vermek yerine:

-   daha iyi at havuzu
-   daha iyi taktik
-   daha iyi jokey
-   daha iyi hazırlık

kullanmalıdır.

Mümkünse oyuncu "oyun bana hile yapıyor" hissine kapılmamalıdır.

---

## 85. OYUNCU DENEYİMİ

Oyuncu her yarış sonunda:

```text
Neden kazandım?
Neden kaybettim?
```

sorusunun özet cevabını görmelidir.

Örneğin:

```text
Şimşek 2. oldu.

+ Çim pist uyumu
+ İyi kondisyon
+ Güçlü son sprint
- İlk 400m'de fazla enerji harcadı
- Son virajda trafik yaşadı
- Son 100m'de rakibin sprinti daha güçlüydü
```

Bu özellik stratejinin öğrenilmesini sağlar.

---

## 86. AT KARİYERİ

Her atın:

-   yarış geçmişi
-   galibiyetleri
-   toplam kazancı
-   en iyi derecesi
-   favori pistleri
-   favori mesafesi
-   sakatlık geçmişi
-   ebeveynleri
-   yavruları

tutulmalıdır.

Oyuncu atına bağlanmalıdır.

---

## 87. EMOTIONAL DESIGN

At isimleri, kariyer geçmişi ve başarılar sadece database verisi gibi
görünmemelidir.

Örnek:

```text
"Şimşek"

12 yarış
4 galibiyet
3 ikincilik
2 üçüncülük

Toplam ödül:
₺1.240.000

En iyi derece:
1600m Çim — 1:34.82
```

Bu ekran oyuncunun atını sahiplenmesini sağlar.

---

## 88. OYUNUN UZUN VADELİ ENDGAME'İ

Oyuncu:

```text
Küçük ahır
↓
İyi at
↓
Yarış galibiyeti
↓
Daha iyi at
↓
Büyük ahır
↓
Çiftlik
↓
Yetiştiricilik
↓
Kan hattı
↓
Şampiyon at
↓
Büyük yarışlar
↓
Kulüp
↓
Online şampiyonluk
↓
Efsane kan hattı
```

yolculuğuna sahip olmalıdır.

---

## 89. ÖNEMLİ TASARIM İLKELERİ

### İlke 1

**Stat ≠ otomatik galibiyet**

### İlke 2

**Animasyon ≠ oyun sonucu**

### İlke 3

**Client ≠ authoritative**

### İlke 4

**Randomness ≠ haksızlık**

### İlke 5

**Daha pahalı ≠ her zaman daha iyi**

### İlke 6

**Daha yüksek level ≠ otomatik şampiyon**

### İlke 7

**Genetik ≠ tamamen deterministik**

### İlke 8

**Oyuncu kararı anlamlı olmalı**

### İlke 9

**Her sistem test edilebilir olmalı**

### İlke 10

**Her önemli değer config'den yönetilebilir olmalı**

---

## 90. CLAUDE CODE'A BAŞLANGIÇ TALİMATI

Claude Code projeye başladığında aşağıdaki sırayı izlemelidir:

```text
STEP 1
Repository'yi tara.

STEP 2
Mevcut dosya ve teknolojileri analiz et.

STEP 3
PROJECT_BRIEF.md dosyasını oku.

STEP 4
Eksik mimari kararları docs/ARCHITECTURE.md içinde belirt.

STEP 5
Implementation roadmap oluştur.

STEP 6
Database schema tasarla.

STEP 7
Backend skeleton oluştur.

STEP 8
Domain modellerini oluştur.

STEP 9
Unit test altyapısını oluştur.

STEP 10
Player → Horse → Training → Race sırasını uygula.

STEP 11
Her modülün testlerini çalıştır.

STEP 12
Build doğrula.

STEP 13
Dokümantasyonu güncelle.

STEP 14
Bir sonraki modüle geç.
```

---

## 91. CLAUDE CODE İÇİN KESİN TALİMAT

Bu proje tek seferde bütün kodu üretmek için değildir.

Claude Code:

-   önce analiz edecek,
-   sonra planlayacak,
-   sonra küçük modül geliştirecek,
-   test edecek,
-   sonucu doğrulayacak,
-   dokümante edecek,
-   sonra sonraki modüle geçecektir.

**Büyük miktarda kodu tek seferde üretme.**

**Race Engine, Genetics ve Economy gibi kritik sistemleri test etmeden
sonraki sisteme geçme.**

**Kod ile dokümantasyon arasında çelişki oluşursa önce dokümantasyonu ve
mimariyi değerlendir, ardından kontrollü şekilde düzelt.**

---

## 92. SON HEDEF

Bu projenin nihai hedefi:

> Oyuncunun at satın aldığı, yetiştirdiği, eğittiği, bakımını yaptığı,
> jokey ve taktik seçtiği, gerçekçi ama erişilebilir bir yarış
> simülasyonunda mücadele ettiği; kazançlarını kullanarak ahırını ve
> çiftliğini geliştirdiği; genetik ve yetiştiricilik yoluyla kendi
> şampiyon kan hattını oluşturduğu; online yarışlar, sıralamalar,
> kulüpler ve sezonlarla uzun süre oynanabilen profesyonel bir at yarışı
> yönetim/simülasyon oyunu geliştirmektir.

---

## 93. SON NOT --- ÖNCELİK

Geliştirme önceliği:

```text
STABILITY
    ↓
CORRECTNESS
    ↓
GAMEPLAY
    ↓
BALANCE
    ↓
PERFORMANCE
    ↓
VISUAL QUALITY
    ↓
SOCIAL FEATURES
```

Önce çalışan ve doğru bir oyun çekirdeği.

Sonra derinlik.

Sonra görsellik.

Sonra online ve sosyal özellikler.

**Kodlamaya başlamadan önce bu brief'in repository içindeki
`docs/PROJECT_BRIEF.md` dosyası olarak kabul edildiğini doğrula.**

✅ **Doğrulandı:** Bu brief, bu depoda `docs/PROJECT_BRIEF.md` olarak
kabul edilmiş ve source of truth olarak işaretlenmiştir (bkz. depo
kök `README.md`).
