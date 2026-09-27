# API.md — REST API Tasarımı

> Kaynak: `docs/PROJECT_BRIEF.md` §50 (API örnekleri), §54 (Idempotency),
> §79 (Error Handling), §64 (Anti-cheat). Bu doküman brief'teki endpoint
> listesini genişletir; gerçek implementasyon FAZ 1'den itibaren
> `apps/api/src/api/controllers` altında yapılacaktır.

## 1. Genel kurallar

- Taban URL: `/api/v1` (versiyonlama en baştan eklenmiştir; brief'te yoktu,
  ileride kırıcı değişiklik yapabilmek için önerilir).
- Kimlik doğrulama: `Authorization: Bearer <access_token>` (JWT).
- Tüm yanıtlar `application/json`.
- **Hiçbir endpoint client'tan gelen `money`, `stat`, `result` gibi
  authoritative alanları doğrudan kabul etmez** (brief §42, §64). Bu
  alanlar her zaman backend tarafından, veritabanındaki güncel değerlerden
  hesaplanır.

### 1.1 Başarılı yanıt zarfı

```json
{
  "success": true,
  "data": { }
}
```

### 1.2 Hata yanıtı zarfı (brief §79 ile birebir)

```json
{
  "success": false,
  "error": {
    "code": "HORSE_TOO_TIRED",
    "message": "Bu at şu anda yarışa hazır değil."
  }
}
```

Hata kodları frontend'den bağımsız, sabit bir enum olarak
`packages/shared-types/src/error-codes.ts` içinde tutulur (bkz. o dosya).

### 1.3 Idempotency (brief §54)

Para/ödül/ödeme değiştiren tüm `POST` endpoint'leri `Idempotency-Key`
header'ı kabul eder ve zorunlu kılar:

```http
POST /api/v1/races/{id}/claim-reward
Idempotency-Key: 5f2e1c2a-...-b3d9
```

Aynı anahtar ile ikinci istek geldiğinde, işlem tekrar çalıştırılmaz;
ilk işlemin sonucu aynen döndürülür (Redis'te `idempotency:{key}` olarak
kısa süreli, örn. 24 saat, saklanır).

**Gerçek implementasyon (FAZ 1 wiring, dokuzuncu dilim):**
`api/idempotency/idempotency.interceptor.ts` — `POST /horses/{id}/practice-race`
İLK gerçek kullanıcısı; onuncu dilimde `POST /players/{id}/stable/upgrade`,
on birinci dilimde `POST /market/listings/{id}/buy` de eklendi. Anahtar
formatı GERÇEKTE `idempotency:{scopeId}:{key}` şeklindedir; `{scopeId}`
URL'deki birincil kaynak kimliğidir (`req.params.id`) — oyuncu
kaynaklarında (Ahır Yükseltme) bu `playerId`'nin AYNISIDIR, at-sahipli
kaynaklarda (Pratik Yarış) `horseId`'dir (bir at yalnızca TEK bir oyuncuya
ait olduğundan replay çakışmasını önlemek için yeterlidir), ilan-sahipli
kaynaklarda (At Pazarı satın alma) `listingId`'dir (bir ilanın satın
alınması yalnızca BİR kez gerçekleşebileceğinden — `sold` olduktan sonra
zaten `409 LISTING_NOT_ACTIVE` döner — bu da yeterlidir). Yalnızca
BAŞARILI (2xx) yanıtlar önbelleğe alınır; bir domain hatası önbelleğe
ALINMAZ, bu yüzden istemci sorunu düzeltip AYNI anahtarla tekrar
deneyebilir. Bilinçli sınırlama: aynı anahtarla GERÇEKTEN eşzamanlı
(aynı milisaniyede çakışan) iki isteğe karşı tam bir dağıtık kilit YOK —
bkz. interceptor'ın kendi doc yorumu.

### 1.4 Sayfalama

Liste endpoint'leri `?page=1&pageSize=20` parametrelerini destekler,
yanıt zarfına `meta` eklenir:

```json
{
  "success": true,
  "data": [ ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 134, "totalPages": 7 }
}
```

**Gerçek implementasyon (FAZ 1 wiring, on ikinci dilim):** bu zarf FAZ
0'dan beri belgeliydi ama HİÇBİR endpoint'te kullanılmamıştı — İLK gerçek
kullanıcısı `GET /market/listings`'tir (bkz. §5). `page` 1-tabanlıdır,
verilmezse `1` varsayılır; `pageSize` verilmezse `20`, en fazla `100`
olabilir (aşırı büyük bir sayfa isteğiyle veritabanını yormamak için).
Diğer TÜM liste endpoint'leri (`GET /horses?ownerId=`, `GET
/market/my-listings?sellerId=`) BİLİNÇLİ olarak sayfalanmaz — döndürdükleri
koleksiyon (tek bir oyuncunun atları/ilanları) doğası gereği sınırlıdır,
`GET /market/listings`'in aksine dış dünyaya açık, büyüyebilen bir
koleksiyon değildir.

---

## 2. Auth

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```

`POST /api/v1/auth/register` — örnek istek/yanıt:

```json
// İstek
{ "username": "atsevdalisi", "email": "user@example.com", "password": "..." }

// Yanıt (201)
{
  "success": true,
  "data": {
    "player": { "id": "...", "username": "atsevdalisi", "level": 1 },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

> **Açık karar (bkz. ARCHITECTURE.md §10.1):** Sosyal giriş (Google/Apple) ve
> misafir modu desteği proje sahibinin onayına sunulmuştur.

## 3. Player

```http
GET /api/v1/player/me
GET /api/v1/player/profile/{id}
GET /api/v1/player/stats
```

`GET /api/v1/player/me` yanıtı, brief §38 Ana Sayfa kartlarının doğrudan
karşılığıdır: `level`, `xp`, `money`, `gems`, `reputation`.

**Uygulama durumu (FAZ 1 wiring, bu oturum):** yukarıdaki üç uç nokta
gelecekteki gerçek Google/Apple oturum akışına (brief §7) aittir ve henüz
BAĞLANMAMIŞTIR. Bunun yerine, "en küçük uçtan uca dilim" olarak, GEÇİCİ
bir doğrudan kayıt çifti gerçek PostgreSQL'e bağlanmıştır:

```http
POST /api/v1/players
GET  /api/v1/players/{id}
```

`POST /api/v1/players` gövdesi `{ username, displayName, avatarId? }`
alır (username: 3-20 karakter, `[a-z0-9_]`), yeni oyuncuyu oluşturur ve
`{ id, displayName, avatarId, level, xp, money, gems }` (`PlayerSummary`)
döner. Kullanıcı adı doluysa `409 USERNAME_ALREADY_TAKEN`, format
hatalıysa `400 VALIDATION_ERROR` döner. `GET /api/v1/players/{id}`
bulunamazsa `404 PLAYER_NOT_FOUND`, id UUID formatında değilse
`400 VALIDATION_ERROR` döner. Bu uç noktalar `docs/ROADMAP.md` "FAZ 1
wiring" bölümünde açıklandığı gibi geçicidir; gerçek OAuth eklendiğinde
üstteki üç uç nokta bağlanacak, `RegisterPlayerUseCase` DEĞİŞMEDEN
kalacaktır.

**Güncelleme (FAZ 1 wiring, ikinci dilim, bu oturum):** `POST
/api/v1/players` artık yeni oyuncuya otomatik olarak bir başlangıç atı
da veriyor — bkz. §4 "Uygulama durumu".

**Güncelleme (FAZ 1 wiring, üçüncü dilim, bu oturum):** `Player` domain
tipine `stableLevel` alanı eklendi (DB'de zaten `players.stable_level`
olarak vardı, FAZ 1'den beri bağlı değildi — bkz. §4 "Ahır Özeti").

**Güncelleme (FAZ 1 wiring, on dördüncü dilim, bu oturum):** `Player`
domain tipine `rating` (brief §43 Elo) eklendi — yeni oyuncular
`config/online.config.json` → `elo.initialRating` (1000) ile başlar,
`GET /api/v1/players/{id}` yanıtında görünür. Bkz. §9 "PvP Eşleştirme".

### Günlük Ödül (FAZ 1 wiring, yedinci dilim, bu oturum)

```http
POST /api/v1/players/{id}/daily-reward
```

brief §37 "GÜNLÜK OYUN DÖNGÜSÜ" (Login → **Daily Reward** → ...) — gövde
almaz. `Player`'a eklenen `lastDailyRewardClaimedAt` alanına göre bir
kayan-pencere (rolling window) cooldown uygular (`config/
economy.config.json` `dailyRewardCooldownHours`, varsayılan 24). Örnek
yanıt:

```json
{
  "success": true,
  "data": {
    "amount": 500,
    "currency": "money",
    "newBalance": { "money": 5500, "gems": 50 },
    "nextClaimAvailableAt": "2026-09-14T01:50:00.000Z"
  }
}
```

Olası hata: cooldown dolmadan tekrar talep edilirse `409
DAILY_REWARD_ALREADY_CLAIMED` (bakiye HİÇ değişmez); oyuncu bulunamazsa
`404 PLAYER_NOT_FOUND`; id UUID formatında değilse `400
VALIDATION_ERROR`.

Economy'nin `credit` fonksiyonunun İLK gerçek kullanımı (`debit`, Ahır
Yükseltme dilimiyle zaten bağlanmıştı) — AYNI satır kilitleme deseni
(docs/ARCHITECTURE.md §9.3) burada da kullanılır. Takvim günü bazlı reset,
streak bonusu ve brief §54'ün tam `Idempotency-Key` + Redis "aynı yanıtı
tekrar döndürme" altyapısı bu dilimin KAPSAMI DIŞINDADIR (bu eylem kendi
cooldown kontrolüyle çifte ödüle karşı zaten finansal olarak korumalıdır).

## 4. Horses (Ahır)

```http
GET    /api/v1/horses                  # oyuncunun ahırındaki atlar
GET    /api/v1/horses/{id}             # at detayı (brief §40)
GET    /api/v1/horses/{id}/pedigree    # soy ağacı + ataların adları (bu dilimde EKLENDİ, aşağıya bkz.)
POST   /api/v1/players/{id}/breeding   # çiftleştirme + tay doğumu (27.09.2026 EKLENDİ, aşağıya bkz.)
POST   /api/v1/horses/{id}/train       # antrenman (brief §10)
POST   /api/v1/horses/{id}/care        # tımar/su/temizlik/veteriner/nalbant/dinlendirme
                                        # (brief §11 — tek uç nokta, `actionType` alanı,
                                        # bkz. §4 "Bakım ve Besleme")
POST   /api/v1/horses/{id}/feed        # besleme (brief §12, `feedType` alanı)
GET    /api/v1/horses/{id}/training-history  # antrenman geçmişi (bu turda EKLENDİ, aşağıya bkz.)
GET    /api/v1/horses/{id}/equipment                     # ekipman envanteri (bu turda EKLENDİ, aşağıya bkz.)
POST   /api/v1/horses/{id}/equipment                     # yeni bir ekipman parçası oluştur
POST   /api/v1/horses/{id}/equipment/{equipmentId}/equip    # kuşandır
POST   /api/v1/horses/{id}/equipment/{equipmentId}/unequip  # çıkar
```

`POST /api/v1/horses/{id}/train` — örnek istek (`durationMinutes` opsiyonel,
verilmezse 30 dakika varsayılır):

```json
{ "type": "sprint", "intensity": "high" }
```

örnek yanıt:

```json
{
  "success": true,
  "data": {
    "horseId": "...",
    "statChanges": { "sprint": 1.4 },
    "fatigueGain": 12.5,
    "injuryOccurred": false,
    "newStatus": { "fatigue": 36.5, "energy": 100, "morale": 80 }
  }
}
```

Olası hata: `HORSE_TOO_TIRED`, `HORSE_INJURED`, `INSUFFICIENT_ENERGY`
(üçü de `409 Conflict` — geçici bir durum engeli, kalıcı bir doğrulama
hatası değil), veya `type`/`intensity`/`durationMinutes` formatı
hatalıysa `400 VALIDATION_ERROR`.

### Uygulama durumu (FAZ 1 wiring, ikinci dilim, bu oturum)

`GET /api/v1/horses` ve `GET /api/v1/horses/{id}` gerçek bir PostgreSQL'e
bağlandı ve GitHub CI'da doğrulandı (bkz. docs/ROADMAP.md). `GET
/api/v1/horses` şimdilik bir `ownerId` sorgu parametresi ALIR (örn.
`GET /api/v1/horses?ownerId=<playerId>`) — gerçek kimlik doğrulama henüz
bağlı olmadığından (bkz. §3 Player notu) sahip, oturumdan değil
istemciden gelir. Yanıt zarfı `data` alanı doğrudan bir `Horse[]` dizisidir
(sayfalama/filtre henüz yok).

`POST /players` ile kayıt olan her yeni oyuncu, otomatik olarak bir
**başlangıç atı** alır ("Arap" cinsi, sabit isim havuzundan seçilmiş bir
isim, kalite/potansiyel sabit başlangıç değerleri, "prime" yaşam evresinde —
bkz. `domain/horse/horse.ts` `createStarterHorse`). Bu, brief'te açıkça
yazmayan ama at yetiştiriciliği oyununda gerekli bir tasarım kararıdır (at
olmadan Antrenman/Bakım/Yarış ekranları gösterilemez).

**DÜZELTME (27.09.2026) — cinsiyet artık SABİT DEĞİL.** Başlangıç atı
önceden HER ZAMAN `gelding` idi; gerekçesi "henüz wiring edilmemiş
yetiştiriciliği erken açığa çıkarmamak"tı. Bu gerekçe kendi kendini
kilitliyordu: `createStarterHorse` tek at üretme yoludur ve Pazar yalnızca
VAR OLAN atları el değiştirir — yani her at `gelding` olduğu sürece oyunda
tek bir `mare`/`stallion` bile var olamaz ve yetiştiricilik hiçbir oyuncu
için ulaşılamaz kalır. Artık `mare`/`stallion`/`gelding` arasından **düzgün
dağılımla rastgele** seçilir (`pickStarterHorseGender`, `gelding`
havuzdan çıkarılmadı). Rastgelelik Application katmanında üretilir, domain
saf kalır (`pickStarterHorseName` ile AYNI desen).

`GET /api/v1/horses/{id}/training-history` (bu turda EKLENDİ —
docs/AUDIT_REPORT.md "Antrenman geçmişi gösterimi" bulgusunun kapatılması):
`training_sessions` tablosundan (`train` çağrıldığında zaten yazılıyordu,
FAZ 1'den beri) en yeniden en eskiye sıralı, en fazla 20 kayıt döner.
`HorseOwnerGuardByParam` ile korunur (`train` ile AYNI yetkilendirme) —
bu yüzden `@Public()` DEĞİLDİR, yalnızca atın sahibi kendi antrenman
geçmişini görebilir (fatigue/injury-risk gibi ayrıntılar `PublicHorse`'a
göre daha "içeriden" bir bilgidir). NOT: brief §40'ın orijinal taslağı
(`GET /horses/{id}/history`) yarış+antrenman geçmişini TEK bir uç noktada
birleştirmeyi öngörüyordu — bu isim BİLEREK `training-history`dir, çünkü
yarış geçmişi zaten AYRI ve çalışan bir uç noktadan (`GET
/players/{id}/recent-races`, §22 Replay dilimi) sunuluyor; ikisini TEK
bir yanıtta birleştirmek yeni bir DTO icat etmeyi gerektirirdi — bu KARAR
bilinçli olarak ERTELENDİ, gerçek `/history` birleşimi AYRI bir dilimin
kapsamındadır. Örnek yanıt (`data`, doğrudan bir `TrainingSession[]`):

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "horseId": "...",
      "type": "speed",
      "intensity": "medium",
      "durationMinutes": 30,
      "statGain": { "speed": 1.2 },
      "fatigueGain": 8.4,
      "injuryRisk": 2.1,
      "injuryOccurred": false,
      "createdAt": "2026-09-26T18:00:00.000Z"
    }
  ]
}
```

### Ekipman (bu turda EKLENDİ — `claude/hizli-bitirme-plani.md`'nin proje sahibi tarafından önceliklendirdiği dilim)

`horse_equipment` tablosunda (migration 0028) bir atın ekipman envanterini
tutar (bkz. `packages/shared-types/src/horse.ts` `HorseEquipment` doc
yorumu). Beş sabit `equipmentType` desteklenir: `saddle`, `bridle`,
`horseshoe`, `blinkers`, `leg_wraps`. Dört rota da `HorseOwnerGuardByParam`
ile korunur (`train`/`training-history` ile AYNI yetkilendirme).

`POST /api/v1/horses/{id}/equipment` — yeni bir parça oluşturur (HER ZAMAN
`equipped: false` başlar — oluşturma ≠ kuşanma, iki AYRI adımdır), örnek
istek:

```json
{ "equipmentType": "saddle", "name": "Deri Eyer", "quality": 80 }
```

`quality` 0-100 ölçeğindedir (`Horse.quality` ile AYNI). Örnek yanıt (201
Created — yeni bir KAYNAK yaratır):

```json
{
  "success": true,
  "data": {
    "id": "...",
    "horseId": "...",
    "equipmentType": "saddle",
    "name": "Deri Eyer",
    "quality": 80,
    "equipped": false,
    "createdAt": "2026-09-26T18:00:00.000Z"
  }
}
```

`GET /api/v1/horses/{id}/equipment` — atın TÜM envanterini döner (`data`,
doğrudan bir `HorseEquipment[]`, en yeniden en eskiye sıralı).

`POST /api/v1/horses/{id}/equipment/{equipmentId}/equip` —
`{equipmentId}`'yi kuşandırır (200 OK — yeni bir kaynak YARATMAZ). AYNI
`equipmentType`'tan ÖNCEDEN kuşanılmış başka bir parça varsa, o parça
OTOMATİK olarak çıkarılır (`idx_horse_equipment_one_equipped_per_type`
kısmi tekil index'i, migration 0028, VERİTABANI seviyesinde bunu
GARANTİ eder — bir at, AYNI ANDA her tipten en fazla BİR parça kuşanabilir).

`POST /api/v1/horses/{id}/equipment/{equipmentId}/unequip` —
`{equipmentId}`'yi çıkarır (200 OK).

Her iki kuşanma rotası da `{equipmentId}` GERÇEKTEN `{id}`'ye (ata) ait
DEĞİLSE (başka bir ata ait ya da hiç var olmayan bir id) `404
HORSE_EQUIPMENT_NOT_FOUND` döner — `HorseOwnerGuardByParam` yalnızca
`{id}`'nin (atın) çağırana ait olduğunu doğrular, `{equipmentId}`'nin o
ata aitliği repository katmanında ayrıca kontrol edilir (bkz.
`equip-horse-equipment.use-case.ts` doc yorumu).

**Race Engine'e etkisi:** kuşanılmış (yalnızca `equipped: true`) parçalar
`RunPracticeRaceUseCase`/`JoinMatchmakingQueueUseCase` tarafından okunup
`RaceEntrantSnapshot.equipmentModifier`e (`domain/equipment/performance.ts`
`computeEquipmentPerformanceModifier`) dönüştürülür — her parça, kalitesiyle
ORANTILI olarak en fazla `%1` performans bonusu verir (beş parçanın hepsi
en yüksek kalitede olsa bile toplam en fazla `%5`, `config/weather.
config.json`'daki `sunny_grass_dry → 1.05` ile AYNI büyüklükte, bkz. o
fonksiyonun kalibrasyon notu) — ASLA bir ceza YOKTUR, kuşanılmamış/hiç
ekipmanı olmayan bir at nötr sayılır.

`train` ve `horse_stats`
FAZ 1 wiring'in DÖRDÜNCÜ diliminde bağlandı (bkz. aşağıdaki "Antrenman"
bölümü); `care`/`feed` ve `horse_health`'in dar bir alt kümesi ise
BEŞİNCİ dilimde bağlandı (bkz. aşağıdaki "Bakım ve Besleme" bölümü).

`horse_surface_stats`/`horse_distance_stats` (R3 — Track Fit, bkz.
"Pratik Yarış" bölümü) artık `PostgresHorseRepository.save()`
tarafından YAZILIYOR ve Race Engine tarafından `RaceEntrantSnapshot.
surfaceCompatibility`/`distanceCompatibility` için OKUNUYOR — ama bu iki
tablonun brief §8.2'nin "gizli özellik/keşif hissi" listesindeki gibi bir
oyuncuya doğrudan bir uç noktayla GÖSTERİLMESİ hâlâ KAPSAM DIŞINDADIR
(tam scout/keşif mekaniği, brief §34, ayrı bir dilimi hak ediyor — bkz.
`apps/api/src/domain/race/entrant-snapshot.ts` doc yorumu).

### Ahır Özeti (FAZ 1 wiring, üçüncü dilim, bu oturum)

```http
GET /api/v1/players/{id}/stable-summary
```

brief §38 Ana Sayfa "Ahır Özeti" kartının karşılığıdır. `Player.stableLevel`
(§3, `database/migrations/0012_...`) ve o oyuncuya ait atları birleştirip
`config/stable.config.json`'a göre kapasite/ortalama kondisyon/sağlık
uyarılarını hesaplar. Örnek yanıt:

```json
{
  "success": true,
  "data": {
    "stableLevel": 1,
    "horseCount": 1,
    "capacity": 5,
    "averageCondition": 75,
    "healthWarnings": []
  }
}
```

Oyuncu bulunamazsa `404 PLAYER_NOT_FOUND`, id UUID formatında değilse
`400 VALIDATION_ERROR` döner.

### Son Yarış Sonuçları (Faz 2, görsel kalite planı)

```http
GET /api/v1/players/{id}/recent-races?limit=5
```

Ana Sayfa "Son Yarış Sonuçları" paneli için — oyuncunun kendi atlarının
sonuçlanmış pratik yarışlarını en yeniden eskiye doğru döner (`races` +
`race_entries` + `horses` JOIN, `GetRecentRaceResultsUseCase`). `limit`
opsiyoneldir, varsayılan 5, en fazla 20'ye kelepçelenir (clamp). **KAPSAM
NOTU**: bot rakipler `race_entries`'e hiç yazılmadığı için (bkz.
`RaceRepository.savePracticeRace` doc yorumu) bu bir "genel/çok oyunculu
son kazananlar" akışı DEĞİLDİR — yalnızca bu oyuncunun kendi geçmişidir.
Örnek yanıt:

```json
{
  "success": true,
  "data": [
    {
      "raceId": "b1f2...",
      "raceName": "Pratik Yarış",
      "horseId": "a9e0...",
      "horseName": "Şimşek",
      "distanceMeters": 1200,
      "surface": "grass",
      "finishPosition": 2,
      "finalTimeMs": 94820,
      "performanceScore": 87.5,
      "finishedAt": "2026-09-17T10:00:00.000Z"
    }
  ]
}
```

Oyuncu bulunamazsa `404 PLAYER_NOT_FOUND`, id UUID formatında değilse
`400 VALIDATION_ERROR` döner. Hiç yarış koşulmamışsa boş dizi döner (hata
DEĞİL).

### Tam Alan Replay / Yarış Zaman Çizelgesi (AUDIT_REPORT.md Bulgu R2, bu oturum)

```http
GET /api/v1/races/{id}/timeline
```

`PracticeRaceResult`'ın (yarış sonucu yanıtı) AKSİNE, bu uç nokta yarışın
TÜM katılımcılarının (oyuncunun atı + tüm bot rakipler) ham segment
telemetrisini DB'den DOĞRUDAN okuyarak döner — `simulationSeed` ile
yeniden simülasyona bir ALTERNATİFTİR (brief §58 replay garantisi). Bot
rakipler artık `race_entries`/`race_entry_segments`'e yazılır (bkz.
migration `0025_add_race_entry_bot_support`, `RaceEntry.botLabel`) — bir
katılımcının `horseId`'si `null` ise o katılımcı bottur, gerçek adı yerine
`botLabel` (`"bot-1"` vb.) doludur.

**Yetkilendirme (27.09.2026'da GENİŞLETİLDİ — Tribün):** İstek sahibi ya
bu yarışta EN AZ bir gerçek atı olan bir KATILIMCI (`GetRaceTimelineUseCase.
isPlayerParticipant`) ya da o yarış için **tribün bileti almış** bir
SEYİRCİ olmalıdır. İkisi de değilse `403 RACE_TICKET_REQUIRED` (eskiden
düz `403 FORBIDDEN` idi — ayrı kod, istemcinin kullanıcıyı bilet alma
akışına yönlendirebilmesi içindir). Yarış hiç yoksa `404 RACE_NOT_FOUND`
— bu kontrol bilet kontrolünden ÖNCE gelir, yani yarışın VARLIĞI biletsiz
bir oyuncuya sızmaz.

**`gatePosition` (AUDIT_REPORT.md Bulgu R3, bu oturum):** [1, N] aralığında
bir başlangıç/kapı numarası (gerçek at yarışlarındaki "gate draw") —
`apps/api/src/domain/race/gate-assignment.ts`'in `assignGatePositions`'ı
ile, simülasyon TAMAMEN bittikten SONRA, deterministik olarak (aynı yarış
= aynı çekiliş) atanır. Yarış SONUCUNU etkilemez — yalnızca gerçek/görünür
bir "start numarası" sağlar (`race_entries.gate_position` sütunu projenin
İLK yarış migration'ından beri vardı ama ilk kez bu turda dolduruldu).
Örnek yanıt:

```json
{
  "success": true,
  "data": {
    "raceId": "b1f2...",
    "distanceMeters": 1600,
    "surface": "grass",
    "weather": "sunny",
    "simulationSeed": "b1f2...",
    "entrants": [
      {
        "entryId": "c3d4...",
        "isBot": false,
        "horseId": "a9e0...",
        "horseName": "Şimşek",
        "botLabel": null,
        "tacticalStyle": "closer",
        "riskLevel": "normal",
        "gatePosition": 4,
        "finalTimeMs": 94820,
        "finishPosition": 2,
        "performanceScore": 87.5,
        "segments": [
          { "raceEntryId": "c3d4...", "segmentDistanceMeters": 200, "timestampMs": 12500, "positionMeters": 198.4, "speed": 15.9, "stamina": 92.1, "fatigue": 7.9, "fatigueLevel": 16, "paceScore": 47, "lane": 3, "tacticalState": "closer", "currentRank": 4, "blocked": false, "decision": "hold" }
        ]
      },
      {
        "entryId": "d5e6...",
        "isBot": true,
        "horseId": null,
        "horseName": null,
        "botLabel": "bot-1",
        "tacticalStyle": "front_runner",
        "riskLevel": "normal",
        "gatePosition": 1,
        "finalTimeMs": 93110,
        "finishPosition": 1,
        "performanceScore": 91.2,
        "segments": []
      }
    ]
  }
}
```

**Telemetri notu (bu turda eklendi):** `segments[]` içinde iki YENİ
OPSİYONEL alan bulunur — `fatigueLevel` (yarış İÇİNDE segment segment
biriken CANLI yorgunluk) ve `paceScore` (0-100 tempo göstergesi, 50 =
nötr). Mevcut `fatigue` alanı yarış ÖNCESİ statik değeri taşımaya devam
eder; ikisi AYRI mekanizmalardır. Bu alanlar eklenmeden önce persist
edilmiş yarışlarda `null` döner ve istemci geriye dönük olarak statik
`fatigue`'a düşer. Ayrıntı için bkz. `docs/RACE_ENGINE.md` §5 "Uygulama
notu" ve `packages/shared-types/src/race.ts`.

**Test requirement (AUDIT_REPORT.md):** bir yarışı kaydet, tam alanı iki
yoldan yeniden oluştur (DB okuma vs. yeniden simülasyon) → eşleşmeli —
bkz. `race-timeline.e2e-spec.ts`.

### Tribün — Ücretli Seyirci Girişi (proje sahibinin açık talebi, 27.09.2026)

Proje sahibinin talebi: *"yarış yapılan yerlerde tribüne ücretli girişler
olsun insanlar yarışları izleyebilsin"*. Tribün, bir yarışın **tam alan
replay'ini** (`GET /races/:id/timeline`) izleme yetkisi satar. Bilet
**KATILIM DEĞİLDİR** — yarış sonucunu, istatistiği veya ödülü ETKİLEMEZ.

```http
GET  /api/v1/races/watchable
POST /api/v1/races/{id}/tickets        # Idempotency-Key ZORUNLU
GET  /api/v1/players/{id}/tickets      # yalnızca kendi listesi (assertSelf)
```

**`GET /races/watchable`** — tribünden izlenebilecek yarışlar. Filtreler:
`status = 'finished'` · son `config/grandstand.config.json →
watchWindowHours` saat içinde oluşturulmuş · istek sahibinin o yarışta bir
atı OLMAMASI (kendi yarışına bilet alması anlamsızdır — zaten
katılımcıdır). Her satır `hasTicket` taşır, böylece istemci "Bilet Al" ile
"İzle" arasında seçim yapmak için ikinci bir istek atmaz. `ticketPrice`
satırda döner ama **repository'den değil** `ListWatchableRacesUseCase`'ten
gelir (fiyat bir config değeridir; `WatchableRaceFacts = Omit<
WatchableRaceView, 'ticketPrice'>` bu yüzden vardır — fiyatı eklemeyi
unutmak DERLEME hatasıdır, sessiz "ücretsiz bilet" değil).

**`POST /races/{id}/tickets`** — **PARA YOLU.** `SELECT ... FOR UPDATE` ile
`players` satırı kilitlenir, `debit` ile bakiyeden düşülür, `race_tickets`
satırı eklenir ve AYNI transaction'da `economy_transactions`'a İMZALI
(NEGATİF) bir defter satırı yazılır (`type: 'grandstand_ticket'`). Bilet
geliri bir **SINK**'tir: kimseye kredi geçmez (mevcut sink'lerle — bakım,
yem, ahır yükseltmesi — aynı kategori). Yarış sahibine ödeme yapmak İKİ
`players` satırının kilitlenmesini gerektirirdi; bu ayrı bir dilimdir.

Yarış "izlenebilir" değilse `409 RACE_NOT_WATCHABLE` — üç neden tek kod
altında döner (kendi yarışın · yarış henüz bitmemiş · izleme penceresi
dolmuş). Aynı yarışa ikinci bilet `409 RACE_TICKET_ALREADY_OWNED` (ikinci
savunma hattı `race_tickets_unique_per_player` kısıtıdır: eşzamanlı ikinci
istek `23505` ile düşer ve TÜM transaction'ı — düşülen para dahil — geri
alır). `Idempotency-Key` yoksa `400 IDEMPOTENCY_KEY_REQUIRED`.

`config/grandstand.config.json` değerleri **doğrudan** okunur; `game-config`
yükleyicisi saf bir cast olduğundan (çalışma zamanı doğrulaması YOK),
değişmezler hem `assertTicketPriceIsValid` (çalışma zamanı) hem de
`grandstand-config.spec.ts` (CI) ile korunur.

**Testler:** `grandstand.e2e-spec.ts` (para yolu: kilit + bakiye + bilet
satırı + imzalı defter satırı; idempotency; yetersiz bakiye; OWN_RACE;
kapının biletle açılması) · `domain/grandstand/ticket.spec.ts` ·
`grandstand-config.spec.ts`.

### Arkadaşlık + Mesajlaşma (proje sahibinin açık talebi, 27.09.2026)

Proje sahibinin talebi: *"arkadaşlık + mesajlaşma"*. Yedi uç nokta,
`SocialController` (`apps/api/src/api/social/social.controller.ts`).

```http
GET    /api/v1/players/{id}/social
POST   /api/v1/players/{id}/friend-requests                    # 201
POST   /api/v1/players/{id}/friend-requests/{requestId}/respond # 200
DELETE /api/v1/players/{id}/friends/{friendId}                  # 200
POST   /api/v1/players/{id}/messages                            # 201
GET    /api/v1/players/{id}/messages/{otherPlayerId}
GET    /api/v1/players/{id}/inbox
```

**Yedi uç noktanın TAMAMI `assertSelf` ile korunur** — yoldaki `:id` her
zaman İŞLEMİ YAPAN oyuncudur, hedef DEĞİLDİR (hedef gövdede ya da ikinci
yol parametresinde gelir). Bu, IDOR'a karşı ilk kapıdır: başkasının
sosyal listesini okumak veya onun adına istek göndermek bu satır olmadan
mümkün olurdu.

**`Idempotency-Key` KULLANILMAZ (bilinçli).** Bu uç noktaların hiçbiri
para/mülkiyet değiştirmez; interceptor'ın çözdüğü sorun ("zaman
aşımından sonra tekrarlanan istek iki kez tahsil etmesin") burada
YOKTUR. Spam savunması iki katmanlıdır: `@RateLimit`
(`friend-request` 20/dk, `direct-message` 30/dk, `keyBy: 'player'`) ve
**bekleyen istek tavanı** (`config/social.config.json →
pendingRequestsLimit`, aşılırsa `409 SOCIAL_LIMIT_REACHED`).

**`DELETE .../friends/{friendId}` İKİ ANLAM taşır (bilinçli):** kabul
edilmiş bir arkadaşlığı siler VEYA bekleyen bir isteği (gönderdiğim ya da
bana gelmiş) geri çeker. Repository durum filtresi UYGULAMAZ — yalnızca
`accepted`'a izin verilseydi, yanlışlıkla gönderilen istekler tavanı
doldurup yeni istek göndermeyi kilitlerdi. Yanıt **200 + gövde**'dir
(`{ friendId }`), **204 DEĞİL**: istemcinin `request()` yardımcısı her
yanıtta `response.json()` çağırır ve gövdesiz bir 204 orada "Unexpected
end of JSON input" ile patlardı.

**`friendships` çift yönlü tek satırdır (kanonik çift).** A→B ve B→A
AYNI satırdır: `player_low_id < player_high_id` CHECK'i + `UNIQUE
(player_low_id, player_high_id)`. Karşılaştırma metin (uuid) sırasıdır ve
JS'in `<` operatörü PostgreSQL'in `memcmp` bayt sırasıyla aynı sonucu
verir (bkz. `domain/social/friendship.ts`). Bu desen, mevcut
`PostgresMarketPurchaseRepository`/`updateTwoWithLock`'un sözlüksel-id
kilit sırası geleneğiyle aynıdır.

**Yarış koşulları SQL'de kapatılır** (uygulama ön-kontrolüne ek ikinci
hat): istek `INSERT ... ON CONFLICT (player_low_id, player_high_id) DO
UPDATE ... WHERE friendships.status = 'rejected'` ile yazılır — satır
`pending`/`accepted` ise 0 satır döner ve `409
FRIENDSHIP_ALREADY_EXISTS`. Yanıt `UPDATE ... WHERE status = 'pending'
AND requested_by_id <> $2` ile yapılır — kendi isteğini yanıtlamak veya
iki kez kabul etmek 0 satır döner ve `404 FRIENDSHIP_NOT_FOUND`.

**Okuma yan etkisi:** `GET .../messages/{otherPlayerId}` bana gelen
okunmamış mesajları OKUNDU işaretler (`read_at IS NULL` koşuluyla, yani
ikinci okuma damgayı EZMEZ). `GET .../inbox` bunu YAPMAZ — listeyi
görmek okumak sayılmaz. Arkadaşlıktan çıkıldığında GEÇMİŞ yazışma
okunabilir kalır ama YENİ mesaj `403 NOT_FRIENDS` döner (mesaj geçmişi
ayrı tablodadır, silinmez).

**Gizlilik:** `SocialPlayerView` yalnızca `playerId`/`displayName`/
`level` taşır — `money`/`gems` başka bir oyuncu için GİZLİDİR
(AUDIT_REPORT.md Bulgu S4).

**Yeni hata kodları:** `CANNOT_FRIEND_SELF` (400) ·
`CANNOT_MESSAGE_SELF` (400) · `INVALID_FRIENDSHIP_ACTION` (400) ·
`INVALID_MESSAGE_BODY` (400) · `NOT_FRIENDS` (403) ·
`FRIENDSHIP_NOT_FOUND` (404) · `FRIENDSHIP_ALREADY_EXISTS` (409) ·
`SOCIAL_LIMIT_REACHED` (409).

`config/social.config.json` değerleri **doğrudan** okunur; `game-config`
yükleyicisi saf bir cast olduğundan (çalışma zamanı doğrulaması YOK),
`maxMessageLength`'in `direct_messages` CHECK kısıtıyla AYNI sayıyı
söylediği **migrasyon dosyası okunarak** kanıtlanır
(`social-config.spec.ts`) — sayıyı testte elle yazmak yalnızca config'i
sabitlerdi, migrasyonu okumak ise "config ile veritabanı ayrıştı" hatasını
CI'da yakalar.

**Testler:** `social.e2e-spec.ts` (IDOR 403'ler; kanonik çiftin TEK satır
ürettiği; reddet→yeniden istek aynı `requestId`'yi döner; kendi isteğini
yanıtlama 404; çift kabul 404; arkadaş olmayana mesaj 403; okundu
işaretlemenin damgayı ezmediği; gizlilik) ·
`domain/social/friendship.spec.ts` · `domain/social/validation.spec.ts` ·
`domain/social/social-config.spec.ts`.

### Hediye Gönderimi (proje sahibinin açık talebi, 27.09.2026)

Proje sahibinin talebi: *"hediye gönderimi"* — üç parçanın ÜÇÜNCÜSÜ
(tribün `4cb712f`, arkadaşlık + mesajlaşma `7d1db53`). İki uç nokta,
`GiftController` (`apps/api/src/api/gift/gift.controller.ts`).

```http
POST /api/v1/players/{id}/gifts
Idempotency-Key: 5f2e1c2a-...-b3d9      # ZORUNLU
{ "recipientId": "<uuid>", "amount": 750, "currency": "money" }

GET  /api/v1/players/{id}/gifts
```

**BU BİR TRANSFERDİR, SINK DEĞİL.** Tribün biletinden (`migration 0032`)
temel farkı budur: bilet geliri kimseye geçmez, hediyede ise düşülen tutar
ALICIYA eklenir. Bu yüzden her gönderim `economy_transactions`'a **İKİ
satır** yazar — `gift_send_debit` (NEGATİF, gönderen) ve `gift_send_credit`
(POZİTİF, alıcı), ikisi de AYNI `reference_id` (= `gift_sends.id`) taşır ve
bu id ile eşleştirilebilir. İki satır da `balance_before`/`balance_after`
taşır; migration 0019'un `CHECK (balance_after = balance_before + amount)`
kısıtı burada da geçerlidir.

**PARA YOLU — `Idempotency-Key` ZORUNLUDUR** (§1.3). Anahtar istek başına
bir kez üretilir ve yeniden denemelerde AYNEN tekrarlanır; anahtarsız istek
`400 IDEMPOTENCY_KEY_REQUIRED` döner ve **hiçbir satır yazılmaz**. Aynı
anahtarla tekrarlanan istek AYNI `giftId`'yi döner — ikinci bir transfer
OLMAZ. Bu, hediyenin doğası gereği kritiktir: çift gönderim, alıcıyı haksız
yere zenginleştirir ve geri alınamaz.

**Kilit sırası:** iki `players` satırı SÖZLÜKSEL id sırasıyla `FOR UPDATE`
ile kilitlenir (`PostgresMarketPurchaseRepository.executePurchase` ve
`updateTwoWithLock` ile AYNI gelenek → kilit döngüsü kurulamaz). Arkadaşlık
satırı kilitsiz OKUNUR: `removeFriendship` yalnızca `friendships` satırını
tuttuğu için bir döngü oluşamaz. Günlük sayaç, gönderenin satırı KİLİTLİYKEN
okunur — aynı gönderenin eşzamanlı iki isteği bu kilit üzerinden serileşir,
yani sayım tutarlıdır.

**Ön koşul arkadaşlıktır ve İKİ KEZ kontrol edilir:** `SendGiftUseCase`'te
(403 `GIFT_REQUIRES_FRIENDSHIP`, yazma denenmeden önce) ve gönderim
transaction'ının İÇİNDE (aynı `PoolClient` üzerinden, TOCTOU penceresini
kapatmak için). Bu kural istenmeyen para transferlerini YAPISAL olarak
engeller: bir oyuncuya hediye gönderebilmek için o oyuncunun isteği KABUL
etmiş olması gerekir — rastgele hesaplara para yağdırma mümkün değildir.

**Ön koşul NEDEN veritabanı kısıtı DEĞİL:** `friendships` bir DURUM
makinesidir ve gönderim ANINDAKİ duruma bakar; iki tablo arasında FK kurmak
"arkadaşlık silinince hediye kaydı da silinsin" gibi yanlış bir sonuç
üretirdi — hediye GEÇMİŞTİR, silinmemelidir.

**Sınırlar config'tedir, koda gömülmez** (`config/gift.config.json`):
`minAmount`/`maxAmount` (tek istek), `dailyLimit` + `dailyWindowHours`
(KAYAN pencere, varsayılan 20 hediye / 24 saat), `allowedCurrencies`,
`historyLimit`. Pencere uzunluğu SQL'de sabitlenmez; sorgu
`created_at >= now() - ($2::int * interval '1 hour')` biçimindedir —
**açık `::int` cast'i ZORUNLUDUR**: node-postgres parametreleri `unknown`
tipiyle gönderir ve çıplak `$2 * interval '1 hour'` PostgreSQL tarafından
"operator is not unique: unknown * interval" ile reddedilir.

`dailyWindowHours <= 0` ÖZEL olarak doğrulanır (`assertGiftConfigIsValid`):
pencere boşalır, `COUNT(*)` her zaman 0 döner ve tavan **SESSİZCE** kapanır
— hata görünmez, savunma ortadan kalkar. Aynı kapı `minAmount`/`maxAmount`/
`dailyLimit`'i ve `allowedCurrencies ⊆ CURRENCIES` olmasını da kontrol eder.

**Gizlilik:** yanıt `recipientBalance` TAŞIMAZ (`SendGiftResult` doc
yorumu). At Pazarı satın alması satıcının bakiyesini döner; o desen burada
TAKLİT EDİLMEDİ — bir hediyenin alıcısı, gönderene kendi bakiyesini
göstermeyi kabul etmemiştir. Gönderen yalnızca KENDİ yeni bakiyesini
(`senderBalance`) görür. `GET .../gifts` satırlarındaki `counterparty` de
`SocialPlayerView`'dir (yalnızca `playerId`/`displayName`/`level`).

**`GET /players/:id/gifts`** hem GELEN hem GİDEN hediyeleri tek listede, en
yeniden eskiye döner; her satır `direction` taşır. `assertSelf` ile
korunur (yalnızca kendi geçmişin). Arkadaşlık bittikten sonra da okunabilir
— hediye geçmişi silinmez.

**Yeni hata kodları:** `CANNOT_GIFT_SELF` (400) ·
`INVALID_GIFT_AMOUNT` (400) · `GIFT_CURRENCY_NOT_ALLOWED` (400) ·
`GIFT_REQUIRES_FRIENDSHIP` (403) · `DAILY_GIFT_LIMIT_REACHED` (409).
Yetersiz bakiye MEVCUT `INSUFFICIENT_FUNDS` kodunu kullanır ve **409**
döner — brief §29 "duplicate economy implementation oluşturma" gereği yeni
bir sınıf TANIMLANMADI, yani `InsufficientFundsError`'ın projedeki mevcut
eşlemesi (`http-exception.filter.ts`: "yetersiz bakiye GEÇİCİDİR, oyuncu
para kazanınca çözülür" → 409, 400/402 DEĞİL) hediye yolunda da AYNEN
geçerlidir. Bu, `HorseNotReadyForTrainingError` (INSUFFICIENT_ENERGY) ve
`InsufficientFeedStockError` ile AYNI kategoridir.

`config/gift.config.json → allowedCurrencies`'in `gift_sends.currency`
CHECK kısıtıyla AYNI kümeyi söylediği **migrasyon dosyası okunarak**
kanıtlanır (`gift-config.spec.ts`) — gerekçe `social-config.spec.ts` ile
AYNI (yükleyici saf cast, çalışma zamanı doğrulaması yok).

**Testler:** `gift.e2e-spec.ts` (mutlu yolda İKİ defter satırının
`balance_before`/`balance_after` ile birlikte doğrulanması; aynı
`Idempotency-Key` ile tekrar → aynı `giftId` ve TEK `gift_sends` satırı;
anahtarsız istek 400 ve hiçbir satır yazılmaması; arkadaş olmayana 403 ve
bakiye değişmemesi; arkadaşlıktan çıkınca 403; yetersiz bakiyede
`INSUFFICIENT_FUNDS` + rollback kanıtı; kayan pencerede tavana ulaşınca 409,
pencerenin DIŞINDAKİ satırların sayılmaması, BAŞKA gönderenin satırlarının
sayılmaması; `assertSelf` 403'ü; `GET .../gifts` yön ayrımı ve gizlilik) ·
`domain/gift/gift.spec.ts` · `domain/gift/validation.spec.ts` ·
`domain/gift/gift-config.spec.ts`.

### Soy Ağacı (soy ağacı veri zinciri dilimi, 27.09.2026)

```http
GET /api/v1/horses/{id}/pedigree
```

örnek yanıt:

```json
{
  "success": true,
  "data": {
    "pedigree": {
      "horseId": "…",
      "sireId": "…",
      "damId": "…",
      "grandSireId": "…",
      "grandDamId": null,
      "bloodline": "Safkan Arap"
    },
    "horseNamesById": { "…": "Baba Aygır", "…": "Anne Kısrak" }
  }
}
```

**`@Public()`** — `GET /horses/{id}` ile AYNI gerekçe (bkz. §4 notu): Pazar
akışı başka bir oyuncunun atının profiline bakabilmelidir. `PublicHorse`'dan
farklı olarak burada **gizli stat YOKTUR** (soy ağacı performans verisi
değildir), bu yüzden ayrı bir mapper'a gerek duyulmadı.

**`pedigree` HER ZAMAN doludur — "soy kaydı yok" bir HATA değildir.**
Başlangıç atları hiçbir zaman çiftleştirilmediği için `pedigrees` satırları
yoktur; bu durumda `404` DEĞİL, tüm ata alanları `null` olan bir `Pedigree`
döner. `404` yalnızca **atın kendisi yoksa** (`HORSE_NOT_FOUND`) döner.
Bu ayrım bilinçlidir: `PedigreeTree.tsx` zaten `null` alanları "Bilinmiyor"
düğümüne çevirir, istemcinin ikinci bir `null` dalı yazmasına gerek kalmaz.

**İKİ KAYNAK — öncelik `pedigrees`'tedir (bilinçli karar).** Şemada ebeveyn
bilgisi İKİ yerde durur ve ikisi de bu uç noktadan okunur:

| Kaynak | Kapsam | Nereden yazılır |
|---|---|---|
| `pedigrees` (migration 0008) | 2 nesil + `bloodline`; `Pedigree` tipiyle 1:1 | `createFoalPedigree` (çiftleştirme yazma yolu — bkz. aşağıda §"Çiftleştirme") |
| `horses.sire_id`/`dam_id` (migration 0002) | yalnızca düz ebeveynler | `PostgresHorseRepository.save` |

Repository `pedigrees` satırı varsa **onu** kullanır (zengin olan ve
`PedigreeTree`'nin beklediği şekil); satır yoksa `horses.sire_id`/`dam_id`'ye
düşer ve şemada o satırda **bulunmayan** büyükebeveyn alanları `null` kalır —
hiçbir veri uydurulmaz, hiçbir kaynak da yok sayılmaz. İkisi ÇELİŞİRSE
`pedigrees` kazanır (e2e testiyle sabitlenmiştir).

**ŞEMANIN ASİMETRİK ŞEKLİ — uydurulmadı.** `Pedigree` tam 4 büyükebeveyn
TUTMAZ: yalnızca `grandSireId` (aygırın babası — baba hattı büyükbaba) ve
`grandDamId` (kısrağın annesi — anne hattı büyükanne) vardır. Diğer iki slot
şemada **sütun olarak bile yoktur**, bu yüzden yanıtta da yoktur (bkz.
`domain/breeding/pedigree.ts` `createFoalPedigree` doc yorumu).

**`horseNamesById` yalnızca GERÇEKTEN var olan atları taşır** — adı
çözülemeyen bir ID için sahte ad üretilmez; `pedigree-tree.ts` o durumda ham
ID'yi gösterir.

**Hâlâ YAPILMAYAN (bu dilimin bilinçli sınırı):** `pedigrees` satırlarını
YAZAN yol bu dilimde YOKTU. **27.09.2026'da yazıldı** — bkz. aşağıdaki
"Çiftleştirme" bölümü. Yani artık soy kaydı ÜRETİLEBİLİR ve ağaç, yalnızca
çiftleştirilmiş atlar için dolar (başlangıç atlarında boş kalması hâlâ
NORMALDİR).

**Testler:** `pedigree.e2e-spec.ts` (2 nesil + kan hattının tam eşleşmesi;
`@Public` doğrulaması — header'sız 200; soy kaydı olmayan başlangıç atı için
404 DEĞİL boş ağaç; `pedigrees` yokken `horses.sire_id`/`dam_id`'ye düşme ve
büyükebeveynlerin `null` kalması; **çelişkide `pedigrees`'in kazanması** ve
kaybeden sütunların ad haritasına hiç girmemesi; var olmayan at 404
`HORSE_NOT_FOUND`; UUID olmayan id 400).

### Çiftleştirme (soy ağacı veri zincirinin YAZMA parçası, 27.09.2026)

```http
POST /api/v1/players/{id}/breeding
Idempotency-Key: <zorunlu>
Content-Type: application/json

{ "mareId": "…", "stallionId": "…", "foalName": "Rüzgar" }
```

örnek yanıt (`201 Created`):

```json
{
  "success": true,
  "data": {
    "pairId": "…",
    "foalId": "…",
    "foalName": "Rüzgar",
    "foalGender": "mare",
    "mareId": "…",
    "stallionId": "…",
    "fee": 1250,
    "inbreedingDetected": false,
    "birthHealthRisk": 0.08,
    "payerBalance": { "money": 8750, "gems": 0 }
  }
}
```

**`:id` KISRAĞIN sahibidir** — `assertSelf` ile korunur, yani başkasının
bakiyesinden damızlık ücreti ödenemez ve tay başkasının ahırına doğamaz.
**Aygır başkasının olabilir**; o durumda sahibine damızlık ücreti ödenir
(`fee`, `calculateStudFee` = aygırın `(quality+potential)/2` ortalaması ×
`studFeeMultiplier`). Aynı sahip kendi atlarını çiftleştirirse `fee = 0` ve
`payerBalance = null` olur — kendine ödeme yapılmaz ve sıfır tutarlı bir
defter satırı YAZILMAZ (migration 0019 `CHECK (amount <> 0)`).

**Tay ANINDA doğar.** Bu projede gebelik süresi modellenmez;
`breedingCooldownDays` kısrağın BİR SONRAKİ çiftleştirmesine kadar geçen
süredir. Tay `horses` + `horse_stats` + `horse_health` +
`horse_surface_stats` + `horse_distance_stats` + `pedigrees` satırlarıyla
birlikte, AYNI transaction'da doğar; `breeding_pairs` satırı da (ücret +
`foal_id` ile) aynı transaction'da yazılır.

**`seed` BİLİNÇLİ OLARAK DÖNMEZ:** tayın statları deterministiktir ve seed
`pairId`'ye EŞİTTİR; `pairId` zaten yanıttadır ve `breeding_pairs.id` olarak
saklanır — yani sonuç, kayıt satırından bağımsız olarak yeniden üretilebilir.
Ayrıca dönmek ikinci bir doğruluk kaynağı yaratırdı.

**Doğum sağlık riski gerçek bir sütuna yazılır:** domain'in hesapladığı
`birthHealthRisk` ([0,1]) tayın `horse_health.injury_risk` sütununa ×100
olarak girer.

**Tayın cinsiyeti `mare`/`stallion`'dur — `gelding` ASLA.** İğdişlik bir
doğum sonucu değildir (başlangıç atı havuzundan farkı budur).

**Olası hatalar:**

| Durum | HTTP | Kod |
|---|---|---|
| Kısrak çağıranın değil | 403 | `FORBIDDEN` |
| Kısrak/aygır pazarda aktif ilanda | 409 | `HORSE_LISTED_IN_MARKET` |
| Yaş/cinsiyet/durum/cooldown uygun değil | 409 | `NOT_ELIGIBLE_FOR_BREEDING` |
| At yok | 404 | `HORSE_NOT_FOUND` |
| Ahır kapasitesi dolu | 409 | `STABLE_CAPACITY_EXCEEDED` |
| Bakiye yetersiz | 409 | `INSUFFICIENT_FUNDS` |
| Tay adı geçersiz | 400 | `VALIDATION_ERROR` |
| `Idempotency-Key` yok | 400 | `IDEMPOTENCY_KEY_REQUIRED` |

`@RateLimit` (dakikada 10) + `IdempotencyInterceptor` birlikte uygulanır —
`POST /players/:id/gifts` ile AYNI gerekçe (biri "aynı istek iki kez
yürütülmesin", diğeri "ne kadar sık").

**KİLİT SIRASI (deadlock'tan kaçınmak için — global kuralla aynı):** iki
`horses` satırı (sözlüksel id sırası) → iki `players` satırı (sözlüksel id
sırası). `PostgresMarketPurchaseRepository` zaten horses→players sırasını
kullanır; `PostgresGiftRepository` yalnızca players'a dokunur. Domain
kararı (`breedHorses`) transaction İÇİNDE, KİLİTLİ satırlardan okunan
değerlerle verilir — yaş/cooldown/sahiplik yarış durumuna düşemez.

**Testler:** `domain/breeding/breeding.spec.ts` (`pickFoalGender`,
`assertBreedingConfigIsValid`) · `domain/horse/horse.spec.ts`
(`validateHorseName`'in `unknown` kabulü) · **`test/api/breeding.e2e-spec.ts`
(24 test, 27.09.2026 — yerelde 24/24 geçti).** E2E dosyası yazılırken
gerçek bir hata bulundu ve düzeltildi: gövdede UUID olmayan `mareId`
400 yerine **500** dönüyordu (esbuild `design:paramtypes` üretmediği için
`@IsUUID()` atlanıyordu); controller'a elle `isUUID()` ikinci savunma hattı
eklendi.

### Ahır Yükseltme (FAZ 1 wiring, altıncı dilim; onuncu dilimde Idempotency-Key eklendi, bu oturum)

```http
POST /api/v1/players/{id}/stable/upgrade
Idempotency-Key: 5f2e1c2a-...-b3d9
```

**Onuncu dilimden itibaren `Idempotency-Key` header'ı ZORUNLUDUR** (bkz.
§1.3) — bu, projenin PARA değiştiren İLK endpoint'iydi ama dokuzuncu
dilimde bu koruma bilinçli olarak KAPSAM DIŞI bırakılmıştı; bu dilim tam
olarak o geriye dönük sertleştirmedir. Eksikse `400
IDEMPOTENCY_KEY_REQUIRED` döner. Aynı anahtarla ikinci istek işlemi
TEKRAR ÇALIŞTIRMAZ, ilk sonucu aynen döner (bakiye tekrar DÜŞÜLMEZ).

brief §32 "Ahır yükseltme" — gövde/parametre ALMAZ (Idempotency-Key
DIŞINDA), her zaman oyuncunun mevcut seviyesinden BİR SONRAKİ seviyeye
yükseltmeyi dener. `domain/stable/stable.ts`'teki
`getNextStableUpgradeCost`'u `domain/economy/wallet.ts`'teki `debit`'le
birleştirir — Economy'nin `debit` fonksiyonunun İLK gerçek kullanımı.
Örnek yanıt:

```json
{
  "success": true,
  "data": {
    "newStableLevel": 2,
    "newCapacity": 8,
    "newBalance": { "money": 12000, "gems": 50 },
    "cost": { "currency": "money", "amount": 8000 }
  }
}
```

Olası hata: yetersiz bakiyede `409 INSUFFICIENT_FUNDS` (bakiye/seviye
HİÇ değişmez — işlem tek bir veritabanı transaction'ında ATOMİKtir);
zaten `config/stable.config.json`'da tanımlı en yüksek seviyedeyse `409
MAX_STABLE_LEVEL_REACHED`; oyuncu bulunamazsa `404 PLAYER_NOT_FOUND`; id
UUID formatında değilse `400 VALIDATION_ERROR`.

Bu, projenin PARA/mülkiyet değiştiren İLK use-case'idir — bu yüzden
docs/SECURITY.md §5'in satır kilitleme (`SELECT ... FOR UPDATE` + tek
transaction) kuralı İLK KEZ burada gerçek anlamda uygulandı (bkz.
docs/ARCHITECTURE.md §9.3). Yükseltme geçmişi kaydı ve bir onay/geri alma
akışı bu dilimin KAPSAMI DIŞINDADIR (Idempotency-Key koruması artık
DEĞİL — bkz. yukarıdaki "onuncu dilim" notu).

### Antrenman (FAZ 1 wiring, dördüncü dilim, bu oturum)

```http
POST /api/v1/horses/{id}/train
```

brief §10 ve §75 MVP kriterinin ("Antrenman stat/fatigue etkisi
oluşturuyor") karşılığıdır. `domain/training/training.ts`'teki saf
`applyTraining`/`rollInjuryOccurred` fonksiyonlarını gerçek `horses` +
(bu dilimde YENİ bağlanan) `horse_stats` tablolarına bağlar; her
antrenman ayrıca `training_sessions`'a bir geçmiş satırı yazar (`GET
.../history` henüz OKUMUYOR — KAPSAM DIŞI, aşağıya bakınız).

Tasarım kararları (bkz. `domain/training/training.ts` `getPrimaryStatKey`
ve `application/use-cases/train-horse.use-case.ts` üstündeki KAPSAM
notları):

- Her antrenman türü TEK bir "birincil" görünen stat'ı günceller:
  `speed→speed`, `sprint→sprint`, `stamina→stamina`, `start→startSpeed`,
  `cornering→cornering`, `tempo→midSpeed`, `rest→(yok)`. Brief'in
  örneklediği ikincil/sinerji stat etkileri (örn. sprint antrenmanının
  `acceleration`'ı da etkilemesi) bu dilimin KAPSAMI DIŞINDADIR.
- `applyTraining`'in döndürdüğü sonuç yalnızca `statGain`/`fatigueGain`/
  `injuryRisk` içerir — `energy`/`morale` HENÜZ modellenmemiştir, bu
  yüzden `newStatus`'ta antrenmandan ÖNCEKİ değerleriyle döner.
- Antrenmanın bu dilimde bir PARA maliyeti YOKTUR (Economy entegrasyonu,
  Ahır yükseltme ile AYNI gerekçeyle, KAPSAM DIŞI).
- Sakatlık oluşursa (`rollInjuryOccurred`, deterministik seed —
  `Math.random()` KULLANILMAZ, brief §18) at `status: 'injured'`'a
  geçer; sakat bir at tekrar antrenmana alınamaz (`409 HORSE_INJURED`).
- Yeni oluşturulan her at artık kendisine ait bir `horse_stats` satırıyla
  (tüm görünen/gizli stat'lar migration 0003'teki varsayılan `50` ile)
  BİRLİKTE, tek bir veritabanı transaction'ında yaratılır (bkz.
  docs/ARCHITECTURE.md §9.2 `withTransaction`) — önceki dilimde bu satır
  hiç oluşturulmuyordu.

`GET /horses/{id}/history` bu dilimin KAPSAMI DIŞINDADIR.

### Bakım ve Besleme (FAZ 1 wiring, beşinci dilim, bu oturum)

```http
POST /api/v1/horses/{id}/care
POST /api/v1/horses/{id}/feed
```

brief §11-12 ve §75 MVP kriterinin ("Bakım yapılabiliyor") karşılığıdır.
`domain/care/care.ts`'teki saf `applyCareAction`/`applyFeed`
fonksiyonlarını gerçek `horses` tablosuna VE (bu dilimde YENİ bağlanan,
önceden hiç kullanılmayan) `horse_health` tablosunun dar bir alt kümesine
bağlar; her bakım eylemi ayrıca YENİ `horse_care_log` tablosuna
cooldown takibi için bir satır yazar/günceller (migration 0015).

`POST /horses/{id}/care` — örnek istek (`actionType`: `groom`|`water`|
`clean`|`vet`|`farrier`|`rest`):

```json
{ "actionType": "groom" }
```

örnek yanıt:

```json
{
  "success": true,
  "data": {
    "horseId": "...",
    "actionType": "groom",
    "newVitals": { "health": 92, "fitness": 70, "fatigue": 20, "energy": 85, "morale": 88 },
    "newHealth": { "injuryRisk": 12, "recoveryRate": 60, "jointCondition": 75, "weightCondition": 70 }
  }
}
```

`POST /horses/{id}/feed` — örnek istek (`feedType`: `saman`|`arpa`|`mama`|
`havuc`|`vitamin`):

```json
{ "feedType": "saman" }
```

> **DEĞİŞTİ (27.09.2026 — yem dilimi).** `feedType` artık SOYUT besin
> türleri (`standard`/`energy`/`protein`/`recovery`/`performance`) DEĞİL,
> somut yem KALEMLERİDİR. Tek doğruluk kaynağı
> `apps/api/src/domain/care/validation.ts` → `FEED_TYPES`'tır; ayrıntı
> `config/care.config.json` → `feedTypes`.
>
> - `saman` — **BEDAVA**, stoklanmaz (`stocked: false`), at başına günde
>   3 kez (`dailyLimit: 3`).
> - `arpa` / `mama` / `havuc` / `vitamin` — **Elmasla** satın alınır
>   (`POST /players/{id}/feed-inventory/{type}/buy`; envanteri okumak için
>   `GET /players/{id}/feed-inventory`, atın bugünkü hakkı/durumu için
>   `GET /horses/{id}/feed-status`). Stoktan düşer; stok yoksa besleme
>   reddedilir (`409 INSUFFICIENT_FEED_STOCK`), günlük sınır dolduysa
>   `409 DAILY_FEED_LIMIT_REACHED`.
>
> brief §12'nin "daha pahalı yem = daha iyi garantisi YOKTUR" kuralı
> korunur: kalemler farklı vital alanlarına farklı ağırlıkta etki eder
> (`weightConditionDelta`/`recoveryRateDelta` dahil), düz bir güç sırası
> değildir.

Yanıt şekli `care` ile aynıdır (`feedType` alanı `actionType` yerine) ve
`remainingToday` (bugün kalan hak) ile `stockAfter` (stoklanan kalemde
kalan adet, `saman` için `null`) alanlarını ekler.

Tasarım kararları (bkz. `application/use-cases/perform-care-action.use-case.ts`
ve `feed-horse.use-case.ts` üstündeki KAPSAM notları):

- docs/API.md'nin önceki taslağındaki AYRI `vet`/`farrier`/`rest` uç
  noktaları TEK `/care` uç noktasına (`actionType` alanıyla) birleştirildi
  — `train`'in "tek endpoint + type alanı" kararıyla AYNI gerekçe (domain
  katmanında zaten TEK bir `applyCareAction` fonksiyonu var).
- `HorseHealthRepository` KASITLI olarak `horse_health` tablosunun
  yalnızca dar bir alt kümesini (`injuryRisk`/`recoveryRate`/
  `jointCondition`/`weightCondition`) okur/yazar — `health`/
  `muscleCondition`/`respiratoryCondition`/`lastVetCheck` gibi alanlar
  bilinçli olarak DOKUNULMADAN bırakıldı (brief §29/§34'teki "veteriner
  kontrolü gizli sağlık verisini ortaya çıkarır" özelliği için ayrılmıştır
  — KAPSAM DIŞI).
- Bakım/beslemenin bu dilimde bir PARA maliyeti YOKTUR (Economy
  entegrasyonu, Antrenman/Ahır yükseltme ile AYNI gerekçeyle, KAPSAM DIŞI)
  — `getCareActionCost`/`getFeedCost` domain katmanında zaten hazırdır.
- Beslemenin (`feed`) bir cooldown'u YOKTUR (`care.config.json`
  `feedTypes`'ta `cooldownMinutes` tanımlı değil); bakım eylemlerinin
  (`groom`/`water`/`clean`/`vet`/`farrier`/`rest`) HER BİRİNİN kendi
  cooldown'u vardır ve `horse_care_log`'da AT+EYLEM TÜRÜ çiftine göre ayrı
  ayrı takip edilir (bir eylemin cooldown'u diğerlerini etkilemez).
- Cooldown dolmadan aynı eylem tekrar istenirse `409
  CARE_ACTION_ON_COOLDOWN` döner; geçersiz `actionType`/`feedType` için
  `400 VALIDATION_ERROR` (bkz. docs/ARCHITECTURE.md §9.1 Hata 7 — bu
  dilimde CI'ı beklemeden BAŞTAN uygulanan proaktif domain-katmanı
  doğrulaması).

### Pratik Yarış (FAZ 1 wiring, sekizinci dilim; dokuzuncu dilimde giriş ücreti + ödül eklendi; **27.09.2026'da GERÇEK ÖDÜL HAVUZU + kademeler eklendi**)

```http
POST /api/v1/horses/{id}/practice-race
Idempotency-Key: 5f2e1c2a-...-b3d9
```

**Dokuzuncu dilimden itibaren `Idempotency-Key` header'ı ZORUNLUDUR**
(bkz. §1.3) — bu artık PARA değiştiren bir endpoint (giriş ücreti + ödül).
Eksikse `400 IDEMPOTENCY_KEY_REQUIRED` döner. Aynı anahtarla ikinci istek
işlemi TEKRAR ÇALIŞTIRMAZ, ilk sonucu aynen döner (para tekrar ÇEKİLMEZ).

brief §6 Race Engine ve §75 MVP kriterinin ("temel yarış motoru
çalışıyor") karşılığıdır. `domain/race/race-engine.ts`'teki `simulateRace`
(FAZ 5'te yazılıp test edilmişti, ama hiç ÇAĞRILMIYORDU) burada İLK
gerçek orkestrasyonuna kavuşuyor: oyuncunun atı, seçilen KADEMENİN alan
büyüklüğü kadar (`fieldSize − 1`) deterministik yapay zeka rakibe karşı
SOLO yarışır; sonuç `races`/`race_entries`/`race_entry_segments`
tablolarına (migration 0006/0014, önceden hiç yazılmıyordu) gerçekten
kaydedilir.

Gövde TAMAMEN opsiyoneldir — hiçbiri gönderilmezse `racingStyle: mid_pack`,
`riskLevel: normal`, `startApproach: balanced`, `finalStretchPlan: normal`
ve `tierId` için İLK kademe kullanılır:

```json
{
  "racingStyle": "front_runner",
  "riskLevel": "high",
  "startApproach": "aggressive",
  "finalStretchPlan": "early_sprint",
  "tierId": "regional"
}
```

`tierId` bilinmeyen bir kademeyse `400 INVALID_RACE_TIER` döner (kademe
kimlikleri config'ten geldiği için derleme zamanında `@IsIn` ile
doğrulanamaz — otoritatif kontrol use-case içindedir, bkz.
`api/race/dto/run-practice-race.dto.ts`).

örnek yanıt (`finalResult`/`explanations` TÜM katılımcıları — oyuncunun
atı + `fieldSize − 1` bot — içerir, `horseId` alanı oyuncunun hangi girişi
olduğunu gösterir):

```json
{
  "success": true,
  "data": {
    "raceId": "...",
    "horseId": "...",
    "tierId": "regional",
    "tierLabel": "Bölgesel Koşu",
    "fieldSize": 10,
    "distanceMeters": 1600,
    "surface": "grass",
    "weather": "sunny",
    "finalResult": [
      { "horseId": "...", "finishPosition": 1, "finishTimeMs": 94820, "performanceScore": 91.4 },
      { "horseId": "bot-1", "finishPosition": 2, "finishTimeMs": 94990, "performanceScore": 89.7 }
    ],
    "explanations": [
      { "horseId": "...", "positives": ["İyi kondisyon", "Güçlü son sprint"], "negatives": ["İlk 400m'de fazla enerji harcadı"] }
    ],
    "entryFee": 250,
    "prizePool": 2500,
    "prizeWon": 900,
    "newBalance": { "money": 5650, "gems": 50 }
  }
}
```

`prizePool` HAVUZUN TAMAMIDIR (`entryFee × fieldSize`), `prizeWon` ise
oyuncunun bitiş sırasına düşen PAYIDIR. Dokuzuncu dilimde bu iki alan
yanlışlıkla aynı değerden (`prizeWon`) dolduruluyordu; 27.09.2026'da
ayrıştırıldı.

Tasarım kararları (bkz. `application/use-cases/run-practice-race.use-case.ts`
üstündeki KAPSAM notu):

- Bu, §6'daki TAM (gerçek çok oyunculu, programlı, zamanlanmış) Race
  API'sinin YERİNE GEÇMEZ — takvim/`GET /races` hâlâ wiring edilmedi. Bu
  uç nokta, motoru gerçek veriye bağlayan, anında koşulan bir adımdır.
- **Giriş ücreti + ödül (dokuzuncu dilim):** ikisi de TEK bir
  `PlayerRepository.updateWithLock` çağrısı içinde uygulanır (Ahır
  Yükseltme'deki AYNI satır kilitleme deseni). Bakiye yetersizse `409
  INSUFFICIENT_FUNDS` döner ve HİÇBİR ŞEY yazılmaz (ne para çekilir ne
  yarış kaydedilir).
- **ÖDÜL HAVUZU (27.09.2026 — proje sahibinin talebi: "yarışlar ücretli
  olsun, verilen ücret kadarıyla giriş yapan kişiler çarpan olsun ve bir
  yarışta 8 / 10 / 12 / 14 / 16 at koşabilsin"):** ödül artık sabit bir
  tablodan DEĞİL, `havuz = entryFee × fieldSize` havuzundan dağıtılır
  (botlar da giriş ücretini ödemiş sayılır). Bitiş sırasına düşen pay
  `config/economy.config.json` `raceTiers[].payoutShares`'ten gelir ve
  `Σ payoutShares = 1 − raceRake` olduğundan dağıtılan toplam ödül havuzdan
  YAPISAL OLARAK küçüktür — yarış hiçbir alan büyüklüğünde para BASAMAZ
  (denetim bulgusu E7'nin çözümü; değişmez `apps/api/test/domain/race/
  prize.spec.ts` ile korunur, çünkü config elle düzenlenebilir bir JSON'dur
  ve `game-config` loader'ı çalışma zamanı doğrulaması YAPMAZ).
  Oyuncunun gördüğü çarpan türetilir: `payoutShares[i] × fieldSize`.
  Kesinti `raceRake` = %10 (proje sahibinin kararı) — eşit güçte bir alanda
  oyuncunun beklenen NET sonucu tam olarak `−raceRake × entryFee`'dir, yani
  yarış bir Çip KAYNAĞI değil HAVUZUDUR (denetim bulgusu E30'un çözümü).
- **Kademeler:** `local` (8 at, 100), `regional` (10 at, 250), `national`
  (12 at, 500), `elite` (14 at, 1000), `championship` (16 at, 2000).
  `fieldSize` hem katılımcı sayısını hem havuzu belirler.
- **HAZIR OLMA KAPISI (aynı talep: "hazır olan kişiler yarışabilsinler"):**
  `domain/race/readiness.ts` `checkRaceReadiness` ile at `active` olmalı,
  sağlığı ≥ 50, yorgunluğu ≤ 70 ve enerjisi ≥ 30 olmalıdır
  (`config/race.config.json` `readiness`). Ret → `409` ve nedene göre
  `HORSE_NOT_ACTIVE` / `INSUFFICIENT_HEALTH` / `HORSE_TOO_TIRED` /
  `INSUFFICIENT_ENERGY`; HİÇBİR para hareketi ve HİÇBİR yarış kaydı olmaz.
  Eşikler antrenmanınkinden (enerji ≥ 15, yorgunluk ≤ 90) BİLEREK daha
  sıkıdır: yorgun bir at antrenmana girebilir ama yarışa giremez.
- Bot rakipler gerçek `horses` satırları DEĞİLDİR, `race_entries`'e ayrı
  satır olarak YAZILMAZLAR — yalnızca oyuncunun kendi girişi kalıcıdır.
- Zemin (grass) + hava (sunny) + mesafe (1600m) SABİTTİR — gerçek pist
  seçimi (`tracks` tablosu) henüz wiring edilmedi.
- Sakatlanmış bir at yarışamaz → `409 HORSE_INJURED` (`train`/`care` ile
  AYNI hata sınıfı, `errors.ts`'te YENİ bir sınıf GEREKMEDİ). Geçersiz bir
  taktik alanı → `400 VALIDATION_ERROR` (bkz. docs/ARCHITECTURE.md §9.1
  Hata 7 ilkesinin BAŞTAN uygulanmış hali — `domain/race/entrant-snapshot.ts`
  `assertValidRaceTactic`). `Idempotency-Key` eksikse → `400
  IDEMPOTENCY_KEY_REQUIRED`.
- ~~**Bilinçli sınırlama:** Ahır Yükseltme'nin KENDİ endpoint'i hâlâ
  Idempotency-Key koruması OLMADAN çalışıyor~~ — **onuncu dilimde
  KAPATILDI** (bkz. yukarıdaki "Ahır Yükseltme" bölümü ve
  docs/ROADMAP.md).

## 5. Market (At Pazarı)

**Uygulama durumu (FAZ 1 wiring, on birinci + on ikinci + on üçüncü
dilim, bu oturum):** aşağıdaki ALTI uç nokta gerçek veritabanına
bağlandı; on üçüncü dilim yeni bir uç nokta EKLEMEDİ, ilan oluşturmaya
opsiyonel süre (`expiresInHours`) ve süresi dolan ilanların gerçekten
`expired`'a çevrilmesini ekledi.

```http
POST   /api/v1/market/listings            # ilan oluştur (oyuncu satışı)
GET    /api/v1/market/listings            # tara (filtrelenebilir, sayfalı)
GET    /api/v1/market/my-listings         # "İlanlarım" (bir satıcının ilanları)
GET    /api/v1/market/listings/{id}
POST   /api/v1/market/listings/{id}/buy   # satın al — Idempotency-Key zorunlu
DELETE /api/v1/market/listings/{id}       # ilanı iptal et
```

`domain/market/market.ts`'teki `createListingDraft`/`purchaseListing`/
`cancelListing` FAZ 0'dan beri hazırdı (bkz. domain/market/README.md);
bu dilim onları gerçek `HorseRepository`/`PlayerRepository`/YENİ
`MarketListingRepository`'ye bağlayan İLK dilimdir. Bu AYRICA
`domain/economy/wallet.ts`'teki `transfer`'in ve YENİ
`PlayerRepository.updateTwoWithLock`'un (bkz. docs/SECURITY.md §5) İLK
gerçek kullanıcısıdır — projenin PARA değiştiren İLK ÇOK-taraflı
(iki OYUNCU arasında) use-case'i.

**İlan oluştur:**

```json
POST /api/v1/market/listings
{ "horseId": "...", "price": 5000, "expiresInHours": 48 }
```

`sellerId` GÖNDERİLMEZ — atın `ownerId`'sinden türetilir. `expiresInHours`
OPSİYONELDİR (FAZ 1 wiring, on üçüncü dilim, bu oturum — YENİ);
verilmezse ilan öncekiyle AYNI şekilde süresizdir (`expiresAt: null`);
verilirse `1-720` (30 gün) aralığında bir tam sayı olmalıdır. Örnek yanıt
(`201 Created`, `expiresInHours` verilmediğinde):

```json
{
  "success": true,
  "data": {
    "id": "...", "sellerId": "...", "horseId": "...", "price": 5000,
    "listingType": "fixed_price", "status": "active",
    "createdAt": "...", "expiresAt": null
  }
}
```

Olası hata: at bulunamazsa `404 HORSE_NOT_FOUND`; at zaten aktif bir
ilana sahipse `409 HORSE_ALREADY_LISTED` (bir atın aynı anda yalnızca
TEK aktif ilanı olabilir — YENİ: süresi dolmuş ESKİ bir ilan artık aktif
SAYILMAZ, bkz. aşağıdaki "İlan süresi dolma" notu); fiyat negatif/tam
sayı değilse `400 INVALID_LISTING_PRICE`; `expiresInHours` `1-720`
aralığı dışındaysa `400 INVALID_LISTING_EXPIRY`.

**Tara (FAZ 1 wiring, on ikinci dilim):**

```http
GET /api/v1/market/listings?status=active&minPrice=1000&maxPrice=5000&page=1&pageSize=20
```

Tüm parametreler OPSİYONELDİR. `status` verilmezse `active` varsayılır
(bir alıcının satın ALABİLECEĞİ ilanlar varsayılan görünümdür) — diğer
değerler: `sold`/`expired`/`cancelled`. `minPrice`/`maxPrice` fiyat
aralığına göre filtreler (ikisi de dahildir — `>=`/`<=`). §1.4'teki
sayfalama zarfının İLK gerçek kullanıcısıdır (`page` varsayılan `1`,
`pageSize` varsayılan `20`, en fazla `100`). Sonuçlar `createdAt DESC`
sıralıdır (en yeni ilan önce). Örnek yanıt:

```json
{
  "success": true,
  "data": [ { "id": "...", "sellerId": "...", "horseId": "...", "price": 3000, "listingType": "fixed_price", "status": "active", "createdAt": "...", "expiresAt": null } ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
}
```

Olası hata: `status` geçersiz bir değerse, `minPrice`/`maxPrice` negatif
olmayan bir tam sayı değilse, `minPrice` > `maxPrice` ise, `page` 1'den
küçükse veya `pageSize` 1-100 aralığı dışındaysa `400`. **KAPSAM DIŞI
(bilinçli, bu dilim):** brief §30/§70'in `?breed=&minAge=...` gibi ata
özgü filtreleri YOK — bunlar `horses` tablosuna JOIN gerektirir, ayrı bir
dilimi hak ediyor.

**İlanlarım (FAZ 1 wiring, on ikinci dilim):**

```http
GET /api/v1/market/my-listings?sellerId=...&status=active
```

`sellerId` ZORUNLUDUR (bu projede henüz gerçek bir kimlik doğrulama/
oturum sistemi olmadığından — bkz. "Açık kararlar" madde 1 — `GET
/horses?ownerId=` ile AYNI gerekçe). `status` OPSİYONELDİR; verilmezse
satıcının TÜM durumlardaki ilanları döner (bir "ilanlarımı yönet"
ekranı, varsayılan olarak satılmış/iptal edilmiş geçmişi de göstermek
isteyebilir — `GET /market/listings`'in "yalnızca active" varsayılanının
TERSİ, bilinçli bir tasarım kararı). Sayfalama YOK (bkz. §1.4). Olası
hata: `sellerId` geçerli bir UUID değilse veya eksikse `400`; `status`
geçersiz bir değerse `400`.

**Satın al:**

```http
POST /api/v1/market/listings/{id}/buy
Idempotency-Key: 5f2e1c2a-...-b3d9
{ "buyerId": "..." }
```

`buyerId` AÇIKÇA gönderilir (bu projede henüz gerçek bir kimlik
doğrulama/oturum sistemi olmadığından — bkz. "Açık kararlar" madde 1 —
alıcı, satılan atın/ilanın URL'sinden TÜRETİLEMEZ). Örnek yanıt:

```json
{
  "success": true,
  "data": {
    "listing": { "...": "...", "status": "sold" },
    "buyerBalance": { "money": 4000, "gems": 50 },
    "sellerBalance": { "money": 9500, "gems": 50 }
  }
}
```

Sıralama: para transferi (`transfer`) + iki oyuncunun satırlarının
kilitlenmesi TEK bir `updateTwoWithLock` transaction'ında olur; BAŞARILI
olursa AYRI iki adımda atın `ownerId`'si alıcıya geçer ve ilan `sold`
olur (bkz. `BuyMarketListingUseCase` doc yorumundaki kabul edilmiş risk
notu — `RunPracticeRaceUseCase`'in wallet+yarış kaydı deseniyle AYNI
kategori). Olası hata: ilan bulunamazsa `404 LISTING_NOT_FOUND`; ilan
`active` değilse (zaten satılmış/iptal edilmiş/**süresi dolmuş** — bkz.
aşağıdaki not, bu ÜÇÜ de `409 LISTING_NOT_ACTIVE` döner) `409
LISTING_NOT_ACTIVE`; kendi ilanını almaya çalışırsa `400
CANNOT_BUY_OWN_LISTING`; alıcının bakiyesi yetersizse `409
INSUFFICIENT_FUNDS` (hiçbir şey yazılmaz); `Idempotency-Key` eksikse
`400 IDEMPOTENCY_KEY_REQUIRED`. (`409 LISTING_EXPIRED` kodu hâlâ VAR ama
pratikte artık HİÇ dönmez — bkz. aşağıdaki not.)

**İptal et:** `DELETE /market/listings/{id}` — ilanı `cancelled` yapar.
Olası hata: `404 LISTING_NOT_FOUND`, zaten aktif değilse `409
LISTING_NOT_ACTIVE`. **Bilinçli sınırlama:** yetkilendirme (yalnızca
ilanın sahibi iptal edebilmeli) YOK — bkz. `CancelMarketListingUseCase`
doc yorumu (bu projede HİÇBİR uç noktada henüz gerçek bir oturum sistemi
yok, bu dilime özgü bir boşluk değil).

**İlan süresi dolma (FAZ 1 wiring, on üçüncü dilim, bu oturum):** projede
henüz gerçek bir zamanlanmış görev (cron/scheduler) altyapısı yok — bu
yüzden süresi dolan ilanlar bir arka plan işiyle DEĞİL, ilanları dışa
açan HER okuma isteğinden (tara/İlanlarım/ilan detayı/satın alma) ÖNCE
çalışan TEMBEL bir süpürmeyle `expired`'a çevrilir (bkz.
`infrastructure/market/postgres-market-listing.repository.ts`
`sweepExpiredListings` doc yorumu). Gözlemlenebilir sonuç: bir istemci
süresi dolmuş bir ilanı ASLA `active` olarak görmez; ama satın alma
isteği bu ilanı `409 LISTING_EXPIRED` yerine `409 LISTING_NOT_ACTIVE`
ile reddeder (süpürme, `purchaseListing`'in kendi süre kontrolünden ÖNCE
status'ü zaten `expired`'a çevirmiş olur) — hata mesajı yine de "durum:
expired" der, bilgi kaybı yoktur.

**KAPSAM (bu oturum, bilinçli):** `listingType` her zaman `fixed_price`'tır
(`auction`'ın teklif verme/kazanma mantığı domain katmanında hiç yok,
bkz. domain/market/README.md). Tarama ekranının ata özgü filtreleri (`?breed=&
minAge=...`) YOK (bkz. "Tara" bölümündeki KAPSAM DIŞI notu).

## 6. Race (Yarışlar)

> **Not (FAZ 1 wiring, sekizinci dilim; 27.09.2026'da güncellendi):**
> Aşağıdaki TAM (çok oyunculu, programlı, zamanlanmış) Race API'si — özellikle
> `GET /races` takvimi ve `claim-reward` — henüz wiring edilmedi. Bunun
> yerine `simulateRace`'in ilk gerçek orkestrasyonu, §4 Horses altındaki
> `POST /horses/{id}/practice-race` olarak eklendi: **artık ÜCRETLİ ve ödül
> havuzlu** (giriş ücreti kademeye göre 100–2000 Çip, havuz = giriş × alan
> büyüklüğü, kesinti %10), rakip sayısı seçilen kademenin alan büyüklüğü
> kadardır (8/10/12/14/16) ve yalnızca HAZIR atlar koşabilir — bkz. o
> bölümdeki not. Kalan fark: botlar gerçek oyuncu değil, pist/mesafe sabit,
> yarış önceden zamanlanmıyor (anında koşuluyor).

```http
GET  /api/v1/races                    # yarış takvimi (brief §35)
GET  /api/v1/races/{id}
POST /api/v1/races/{id}/enter         # ata + jokey + taktik ile kayıt (brief §14.2)
POST /api/v1/races/{id}/start         # sadece server/scheduler tetikler
GET  /api/v1/races/{id}/result        # authoritative sonuç (brief §57)
GET  /api/v1/races/{id}/replay        # seed + snapshot + config (brief §58)
POST /api/v1/races/{id}/claim-reward  # Idempotency-Key zorunlu (brief §54)
```

> **`GET /races` ARTIK VAR — ama "takvim" DEĞİL, "LOBİ"dir.** 27.09.2026'da
> (brief §42 PHASE 3) yayına alınan `GET /races` yalnızca **şu an
> katılınabilir** yarışları döner (`status = 'scheduled'`, `start_time ASC`).
> Yukarıdaki "yol haritası" bloğundaki `GET /races` **takvim**
> anlamındadır: geçmiş/gelecek TÜM yarışlar, sonuçlarıyla birlikte — o hâlâ
> YOKTUR. İkisi aynı yolu paylaştığı için bu ayrım önemlidir; uç bugünkü
> hâliyle lobi sözleşmesini uygular. Tam belge için aşağıdaki
> "Ücretli Yarış Lobi" bölümüne bakın.

`POST /api/v1/races/{id}/enter` — örnek istek:

```json
{
  "horseId": "...",
  "jockeyId": "...",
  "racingStyle": "front_runner",
  "riskLevel": "normal",
  "startApproach": "balanced",
  "finalStretchPlan": "late_sprint"
}
```

`GET /api/v1/races/{id}/result` — örnek yanıt (brief §85 "neden
kazandım/kaybettim" özetini de içerir):

```json
{
  "success": true,
  "data": {
    "raceId": "...",
    "simulationSeed": "race_2026...:horse_...",
    "results": [
      { "horseId": "...", "finishPosition": 1, "finishTimeMs": 94820, "performanceScore": 91.4 },
      { "horseId": "...", "finishPosition": 2, "finishTimeMs": 94840, "performanceScore": 90.9 }
    ],
    "explanation": {
      "horseId": "...",
      "positives": ["Çim pist uyumu", "İyi kondisyon", "Güçlü son sprint"],
      "negatives": ["İlk 400m'de fazla enerji harcadı", "Son virajda trafik yaşadı"]
    }
  }
}
```

### Ücretli Yarış Lobi — oluştur / listele / katıl / hazır (brief §1-§7, §42 PHASE 1 + 3)

**Oyuncunun kendi açtığı yarış** — sunucunun ürettiği pratik yarıştan
(§4 `POST /horses/{id}/practice-race`) farkı: yarışı bir OYUNCU açar, giriş
ücreti gerçek oyunculardan tahsil edilir ve o para `races.prize_pool`'a
girer. Kontrolcü `api/race/race-lobby.controller.ts`'tir; iş kuralı
`domain/race/lobby.ts`'te, para yolu `postgres-race.repository.ts`'tedir.

```http
POST /api/v1/races                # yeni yarış tanımı açar (201)
GET  /api/v1/races                # lobi listesi: yalnızca katılınabilir yarışlar
POST /api/v1/races/{id}/join      # KATIL — Idempotency-Key ZORUNLU (PARA YOLU)
POST /api/v1/races/{id}/ready     # READY/NOT_READY bildirimi (para yolu DEĞİL)
```

Dördü de **kimliği doğrulanmış oyuncu** ister (`AuthGuard` global); oyuncu
her zaman **token'dan** gelir, gövdeden ASLA — gövdede `playerId` gönderilse
bile yok sayılır (CLAUDE.md "SUNUCU OTORİTESİ").

#### `POST /races` — yarış açma

Gövde: `name`, `fieldSize` (8/10/12/14/16), `maxPlayers`, `entryFee`,
`raceType` (`free`|`paid`), `startTime` (ISO 8601), `surface`, `weather`,
`distanceMeters`, `tribuneFee`, `spectatorCapacity`. Tümü
`config/race-lobby.config.json`'daki seçeneklerden biri olmalıdır.

**`Idempotency-Key` YOKTUR ve bu bilinçlidir:** bu uç hiçbir bakiye/ödül/
envanter değiştirmez (ücret yarışa KATILIRKEN alınır) — brief §54'ün zorunlu
kıldığı kapsama girmez. Buna karşılık `@RateLimit` (10/60 sn, oyuncu başına)
vardır, çünkü her istek kalıcı bir `races` satırı yazar. Ayrıca
`maxOpenRacesPerPlayer` (config) oyuncunun AÇIK yarış sayısını sınırlar —
biri HIZ, diğeri SAYI sınırıdır.

`raceType: 'paid'` ile `entryFee: 0` çelişir; `raceType: 'free'` ile
`entryFee > 0` de öyle. Bu kural hem domain'de hem migration 0036'daki
`(race_type = 'paid') = (entry_fee > 0)` CHECK'inde durur.

#### `GET /races` — lobi listesi

`?limit=` (varsayılan 20, tavan 100 — `config/race-lobby.config.json →
lobbyListDefaultLimit` / `lobbyListMaxLimit`). **Geçersiz `limit` 400
DÖNMEZ, varsayılana düşer**; tavanı aşan değer kırpılır. Bu bir okuma
ucudur — bir liste isteğini hatalı bir sorgu parametresi yüzünden
reddetmek kullanıcıya hiçbir şey kazandırmaz.

Yanıt `RaceLobbyView[]`:

```json
{
  "success": true,
  "data": [
    {
      "id": "...", "name": "...", "status": "scheduled",
      "entryFee": 250, "raceType": "paid", "prizePool": 750,
      "maxPlayers": 8, "joinedPlayers": 3,
      "startTime": "2026-09-28T18:00:00.000Z",
      "surface": "grass", "weather": "sunny", "distanceMeters": 1600,
      "tribuneFee": 10, "spectatorCapacity": 500
    }
  ]
}
```

- **Yalnızca `status = 'scheduled'`** yarışlar döner. `in_progress` /
  `finished` / `cancelled` yarışlar listede GÖRÜNMEZ — görünselerdi oyuncu
  katılamayacağı bir yarışa tıklar ve `RACE_NOT_JOINABLE` yerdi.
- **`joinedPlayers` GERÇEK oyuncuları sayar, botları SAYMAZ.**
  (`COUNT(e.player_id)`, `COUNT(*)` değil.) Bot satırları brief §6 "kalan
  koltuklar AI ile dolar" kuralı yüzünden her yarışta bulunur; sayılsalardı
  lobi her yarışı DOLU gösterirdi.
- **Katılımı olmayan yarış da görünür** (`LEFT JOIN`, `joinedPlayers: 0`).
- **`prizePool` gerçek ödül havuzudur** — katılımlardan birikmiş giriş
  ücretlerinin toplamı; henüz dağıtılmamıştır.

#### `POST /races/{id}/join` — katılma (PARA YOLU)

`Idempotency-Key` **ZORUNLUDUR**; yoksa 400. Gövde: `horseId` (zorunlu,
UUID), `tacticalStyle`, `riskLevel` (isteğe bağlı — verilmezse varsayılan
uygulanır).

Akış tek bir transaction'dadır ve kilit sırası **`races` → `players`**'dır
(ters sıra iki eşzamanlı katılımda kilitlenme üretirdi):

1. `SELECT ... FOR UPDATE` ile yarış kilitlenir (durum + başlangıç zamanı +
   doluluk aynı anda okunur; TOCTOU kapanır).
2. `SELECT ... FOR UPDATE` ile oyuncu satırı kilitlenir.
3. `debit()` ile giriş ücreti düşülür, `races.prize_pool` aynı tutar kadar
   artar.
4. `race_entries` satırı `player_id` **DONDURULARAK** ve `status =
   'waiting'` ile yazılır.
5. Aynı transaction'da `economy_transactions` defter kaydı yazılır.

`player_id`'nin donmasının sebebi: ücreti ÖDEYEN ödülü almalıdır. At
sonradan satılırsa `horses.owner_id` canlı okunsaydı ödül yanlış kişiye
giderdi.

**Aynı oyuncu aynı yarışa bir kez girebilir.** Kural uygulamadaki ön
kontrolle değil, `race_entries_race_player_uq` **kısmi tekil indeksiyle**
(migration 0037) zorlanır — iki eşzamanlı istek arasındaki yarışı yalnızca
indeks kapatır.

`max_players` **GERÇEK oyuncu** kontenjanıdır; kalan koltuklar yapay zekâyla
dolar. Dolduysa `RACE_FULL`.

200 OK döner (201 değil): gövde `RaceLobbyView`'dir ve katılımın kendi
adresi yoktur.

#### `POST /races/{id}/ready` — hazırım / hazır değilim

Gövde: `{ "status": "ready" }` ya da `{ "status": "not_ready" }`.
Yalnızca bu ikisi kabul edilir — `waiting` ve `cancelled` **reddedilir**
(400). `cancelled` bilinçli olarak kapalıdır: iptal, giriş ücretinin iadesi
demektir ve o ayrı bir para yoludur; READY ucundan yazılabilseydi ücret
ödemeden çıkmanın bir yolu doğardı.

**`Idempotency-Key` YOKTUR** — bu uç bakiye, ödül havuzu ve deftere
dokunmaz; aynı değeri iki kez yazmak sonucu değiştirmez.

Kabul koşulları: yarış `scheduled` olmalı, başlangıç zamanı gelmemiş olmalı
(tam başlangıç anında pencere KAPALIDIR — `join` ile aynı sınır), katılım
`cancelled` olmamalı. Red nedeni önceliği: **durum > zaman > iptal**.

**403 DEĞİL 404:** oyuncunun bu yarışta katılımı yoksa
`RACE_ENTRY_NOT_FOUND` döner. 403 dönmek "burada bir katılım var ama senin
değil" bilgisini sızdırırdı.

200 OK döner ve gövde GÜNCELLENMİŞ `RaceLobbyView`'dir (doluluk korunur —
READY katılımı silmez).

#### `POST /races` / `POST /races/{id}/join` — örnek istek/yanıt

```json
{ "horseId": "...", "tacticalStyle": "tracker", "riskLevel": "normal" }
```

```json
{
  "success": true,
  "data": {
    "id": "...", "name": "Hazırlık Kupası", "status": "scheduled",
    "entryFee": 50, "raceType": "paid", "prizePool": 50,
    "maxPlayers": 8, "joinedPlayers": 1,
    "startTime": "2026-09-28T18:00:00.000Z",
    "surface": "grass", "weather": "sunny", "distanceMeters": 1600,
    "tribuneFee": 0, "spectatorCapacity": 500
  }
}
```

#### Kapsam dışı (henüz YOK)

Yarışın **otomatik başlaması** yoktur: `scheduled` bir yarışı `in_progress`e
çeviren bir zamanlayıcı (cron/worker) henüz bağlanmamıştır — bu yüzden
`GET /races` listesindeki yarışlar katılım toplar ama kendiliğinden
koşmaz. READY durumu da bu yüzden şu an **bilgi**dir: motor başlatma anında
hangi atların "hazır" olduğunu henüz OKUMAZ. Ödül dağıtımı (`claim-reward`),
jokey seçimi ve yarış takvimi de kapsam dışıdır.

## 7. Breeding (Yetiştiricilik)

```http
GET  /api/v1/breeding/options          # uygun eş adayları + tahmini (brief §34, §28)
POST /api/v1/breeding                  # çiftleştirme talebi
GET  /api/v1/breeding/{id}
```

## 8. Farm / Stable (Çiftlik)

```http
GET  /api/v1/farm                      # tesis durumu (brief §32)
POST /api/v1/farm/upgrade              # tesis yükseltme
GET  /api/v1/farm/staff                # personel listesi (brief §33)
POST /api/v1/farm/staff/hire
POST /api/v1/farm/staff/{id}/fire
```

## 9. Online / Sıralama / Kulüp / Turnuva / Sezon (FAZ 7)

```http
GET  /api/v1/leaderboard?scope=global|country|friends|club|season|weekly|monthly
GET  /api/v1/clubs/{id}
POST /api/v1/clubs
POST /api/v1/clubs/{id}/join
POST /api/v1/clubs/{id}/leave
POST /api/v1/clubs/{id}/members/{playerId}/kick
GET  /api/v1/tournaments
POST /api/v1/tournaments/{id}/register    # Idempotency-Key zorunlu (brief §54)
GET  /api/v1/tournaments/{id}/bracket
POST /api/v1/matchmaking/queue            # PvP kuyruğuna gir (brief §41)
DELETE /api/v1/matchmaking/queue          # kuyruktan çık
GET  /api/v1/seasons/current
```

**Uygulama durumu (FAZ 7, bu oturum):** yukarıdaki uç noktaların ARKASINDAKİ
tüm hesaplama mantığı `apps/api/src/domain/{online,ranking,club,tournament,
season}/` altında saf TypeScript fonksiyonları olarak tamamlanmış ve test
edilmiştir (bkz. o klasörlerin README.md'leri, docs/ROADMAP.md "FAZ 7
tamamlanma durumu"). Bu tablo, önceki fazlardaki (FAZ 1-5) aynı desenle
tutarlı olarak, gerçek NestJS controller/route wiring'i henüz YAPILMAMIŞ,
domain katmanı hazır bir sözleşme/tasarımdır — brief §41-44, §68-69 ile
tutarlıdır.

**FAZ 1 wiring, on dördüncü dilim (bu oturum) — `POST`/`DELETE
/matchmaking/queue` WIRING EDİLDİ**, yukarıdaki 8 uç noktadan yalnızca
bu ikisi (bkz. `apps/api/src/api/matchmaking/`, `domain/online/README.md`
"On dördüncü dilim"; `leaderboard`/`clubs`/`tournaments`/`seasons` HÂLÂ
kapsam dışıdır):

```http
POST /api/v1/matchmaking/queue
Content-Type: application/json

{ "horseId": "<uuid>" }
```

Yanıt İKİ şekilden biridir (`playerId` gövdede YOKTUR — atın `ownerId`'sinden
türetilir, `POST /market/listings` ile AYNI desen):

```jsonc
// Uygun bir rakip HEMEN bulunamadıysa (201 Created — kuyruğa yeni bir bilet eklendi):
{ "success": true, "data": { "matched": false, "ticket": { "playerId": "...", "horseId": "...", "rating": 1000, "queuedAt": "..." } } }

// Uygun bir rakip HEMEN bulunduysa (201 Created — yarış AYNI istek içinde simüle edildi):
{
  "success": true,
  "data": {
    "matched": true,
    "match": {
      "matchId": "...", "raceId": "...",
      "opponentPlayerId": "...", "opponentHorseId": "...",
      "winnerId": "...",
      "ownFinishPosition": 1, "ownFinishTimeMs": 61234,
      "opponentFinishPosition": 2, "opponentFinishTimeMs": 61890,
      "ownRatingBefore": 1000, "ownRatingAfter": 1016,
      "opponentRatingBefore": 1000, "opponentRatingAfter": 984
    }
  }
}
```

Olası hatalar: `404 HORSE_NOT_FOUND`, `409 HORSE_INJURED`, `409
ALREADY_IN_MATCHMAKING_QUEUE`, `400 VALIDATION_ERROR` (`horseId` UUID
değilse).

```http
DELETE /api/v1/matchmaking/queue?horseId=<uuid>
```

Kuyruktaki bileti kaldırır, kaldırılan bileti döner. Olası hatalar: `404
HORSE_NOT_FOUND`, `404 NOT_IN_MATCHMAKING_QUEUE`, `400 VALIDATION_ERROR`.

**Tasarım kararı — TAMAMEN SENKRON eşleştirme:** bu dilimde bir
zamanlanmış görev/arka plan işçisi altyapısı YOK (`domain/market`'in on
üçüncü dilimindeki AYNI keşif — sandbox'ta npm registry erişimi yoktu) —
bu yüzden `join`, uygun bir rakip bulursa yarışı KENDİ İSTEĞİ İÇİNDE
HEMEN simüle eder; bulamazsa çağıranın bileti kuyruğa eklenir. Giriş
ücreti/ödül YOK (yalnızca Elo, `config/online.config.json`'da `matchmaking`
bölümü hiçbir entry fee tanımlamaz). Her iki taraf da SABİT taktik/zemin/
hava kullanır (`RunPracticeRaceUseCase` ile AYNI KAPSAM DIŞI gerekçesi).
BİLİNÇLİ SINIRLAMA (bu turda `lobby.update` eklendikten SONRA GÜNCELLENDİ):
kuyrukta önce bekleyen oyuncu, eşleşme SONRADAN gelen bir oyuncunun isteği
İÇİNDE gerçekleştiğinde bunu ARTIK öğrenebilir — bkz. §10 `lobby.update`
(ARTIK `[UYGULANDI]`). AMA bu BEST-EFFORT'tur, GARANTİ DEĞİL: yalnızca o
oyuncunun istemcisi O AN `/races` namespace'ine bağlıyken çalışır;
bağlantısı yoksa (sekme kapalı, ağ kopmuş, hiç bağlanmamış) bildirim
SESSİZCE kaybolur ve oyuncu hâlâ kendi başına öğrenemez, yeniden
`join`/`leave` çağırmak ZORUNDADIR — bkz. `JoinMatchmakingQueueUseCase`'in
tam doc yorumu.

Anti-cheat (brief §42): her uç nokta, client'tan gelen payload'ı
`domain/online/anti-cheat.ts` `pickAllowedClientFields` ile ALLOWLIST'ten
geçirmeli; `race.enter` gibi uç noktalarda client bir snapshot da
gönderirse `assertSnapshotMatchesAuthoritative` ile server'ın kendi DB
değerleriyle karşılaştırılıp uyuşmazlık reddedilmelidir.

## 10. WebSocket olayları

Brief'te WebSocket "gerektiğinde" kullanılacağı belirtilmiş (§6).
AUDIT_REPORT.md Bulgu F2 (bu turda proje sahibinin AskUserQuestion ile
onayladığı seçim) `race.telemetry`/`race.finished`'i temel bir
bağlantı+yayın iskeleti olarak UYGULADI; sonraki bir turda `lobby.update`
de bu ALTYAPI ÜZERİNE (YENİDEN İCAT EDİLMEDEN) eklendi. `notification.new`
hâlâ PLANLI/uygulanmadı (daha belirsiz/büyük bir kapsam, bkz.
docs/ROADMAP.md):

```text
race.roster        — race.subscribe sonrası katılımcı isim/kimlik eşlemesi  [UYGULANDI]
race.telemetry     — canlı yarış sırasında segment güncellemeleri            [UYGULANDI]
race.finished      — yarış sonucu hazır olduğunda                           [UYGULANDI]
lobby.update       — online yarış lobisi (brief §41)                        [UYGULANDI]
race.spectators    — canlı izleyici sayısı (brief §27)                      [UYGULANDI]
chat.message       — istemci → sunucu, yarış sohbeti (brief §13)            [UYGULANDI]
chat.message.received — sunucu → oda, yazılan sohbet satırı (brief §13)     [UYGULANDI]
chat.history       — sunucu → abone, abonelik anında geçmiş (brief §13)     [UYGULANDI]
chat.error         — sunucu → istemci, sohbet reddi (brief §13)             [UYGULANDI]
notification.new   — brief §46 bildirim sistemi                             [PLANLI]
```

**Uygulanan kısım (`apps/api/src/api/realtime/race.gateway.ts`, `/races`
namespace'i):**

- **Bağlantı/kimlik doğrulama:** İstemci `io(url + '/races', { auth: { token } })`
  ile bağlanır — `token`, HTTP `Authorization: Bearer <token>` ile AYNI
  oturum JWT'sidir. Token yoksa/geçersizse bağlantı ANINDA kesilir
  (`disconnect`), HTTP'nin 401'iyle aynı ilke.
- **`race.subscribe` (istemci → sunucu):** `{ raceId: string }` gönderir.
  Sunucu `GetRaceTimelineUseCase` ile AYNI yetkilendirmeyi uygular (§6
  `GET /races/:id/timeline` ile BİREBİR aynı mantık, tekrar kullanılır) —
  yarış bulunamazsa veya istekte bulunan oyuncunun o yarışta bir atı yoksa
  `race.error` (`{ message: string }`) döner, kaynağın var olup olmadığı
  sızdırılmaz.
- **`race.roster` (sunucu → istemci, `race.subscribe` sonrası TAM OLARAK
  bir kez, `race.telemetry`'DEN ÖNCE — bu turda EKLENDİ):** `{ raceId,
  entrants: RaceRosterEntrant[] }` — `entryId`/`isBot`/`horseId`/
  `horseName`/`botLabel`/`tacticalStyle`/`gatePosition` (segment/final-
  sonuç alanları OLMADAN). Bunun eklenme nedeni gerçek bir boşluktu:
  `race.telemetry`'nin segmentleri `raceEntryId`'ye (`race_entries.id` —
  GERÇEK bir `horseId` DEĞİL) göre gruplanır, ama daha önce hiçbir olay
  istemciye `entryId → horseId/horseName` eşlemesini GÖNDERMİYORDU — yani
  bir istemci segmentleri alabiliyordu ama yarış SÜRERKEN "bu hangi at"
  sorusunu cevaplayamıyordu (`race.finished` bunu YALNIZCA yarış BİTİNCE
  verir). Şimdi frontend'in canlı `RaceViewer` entegrasyonu (bu bölümün
  sonundaki "Frontend entegrasyonu" notuna bkz.) bu olayı isim/"bu benim
  atım mı" bilgisi için kullanır.
- **`race.telemetry` (sunucu → istemci, ✅ yetkiliyse birden çok kez):**
  `{ raceId, segments: RaceSegmentSnapshot[] }`. **ÖNEMLİ — bu GERÇEK
  zamanlı bir simülasyon DEĞİLDİR:** yarış sunucuda zaten (senkron/anında)
  tamamlanmış ve `race_entries`/`race_entry_segments`'e yazılmıştır; bu
  olay o kayıtlı timeline'ın SABİT `PLAYBACK_DURATION_MS=4000` (4 saniye)
  içine orantılı sıkıştırılmış bir "tempolu replay"idir.
- **`race.finished` (sunucu → istemci, tam olarak bir kez):**
  `{ raceId, entrants: [...] }` — final sıralama/süre/skor (`finishPosition`'a
  göre sıralı).
- **`lobby.update` (sunucu → istemci, BEST-EFFORT — bu turda UYGULANDI):**
  `PvpMatchResult` (bkz. §9 `POST /matchmaking/queue`'nun `matched: true`
  yanıt şekli, ALICININ KENDİ perspektifinden). HANGİ ODAYA: her istemci,
  bağlantı KURULUR KURULMAZ (herhangi bir `race.subscribe`'tan BAĞIMSIZ,
  `handleConnection` içinde) kendi `player:${playerId}` odasına otomatik
  katılır — bu olay o odaya yayınlanır. NE ZAMAN: `JoinMatchmakingQueueUseCase.
  playMatch`, bir rakip bulup DB yazımını (Elo dahil, tek transaction)
  TAMAMLADIKTAN HEMEN SONRA. KİME: ÇAĞIRANA DEĞİL, ZATEN kuyrukta bekleyen
  tarafa (ÇAĞIRANIN rakibi) — ÇAĞIRAN sonucu zaten senkron HTTP yanıtından
  alır. BEST-EFFORT: alıcının o an `/races` namespace'ine bağlı bir soketi
  YOKSA (`player:${playerId}` odası boşsa) yayın SESSİZCE kaybolur — garanti
  teslim/kuyruk sistemi YOKTUR; bağlantısı olmayan oyuncu hâlâ kendi başına
  öğrenemez ve yeniden `join`/`leave` çağırmak zorundadır (bkz. §9'un
  güncellenmiş "BİLİNÇLİ SINIRLAMA" notu, `race.gateway.ts`'in
  "`lobby.update`" doc bölümü).
- **Senkronize çoklu-izleyici (bu turda EKLENDİ):** aynı `raceId`'yi
  izleyen TÜM istemciler artık bir Socket.IO odasına (`race:${raceId}`)
  katılır ve `race.telemetry`/`race.finished` odanın TAMAMINA aynı anda
  yayınlanır — kendi abone olma anına göre bağımsız bir replay YOK, TEK
  bir paylaşılan zamanlayıcı var. `race.subscribe` oturum ZATEN
  başladıktan SONRA çağrılırsa (geç katılım), istemci önce o ana kadar
  fiilen ateşlenmiş TÜM segmentleri TEK bir "yakalama" `race.telemetry`
  olayında alır (yarış zaten bitmişse ANINDA `race.finished` alır),
  SONRA odaya katılıp gelecekteki yayınları normal şekilde alır — yani
  bir yeniden bağlanma artık "sıfırdan başlama" değil, bu yakalama
  mekanizmasından FAYDALANIR (tam bir reconnection protokolü HÂLÂ YOK,
  istemci `race.subscribe`'ı kendisi yeniden çağırmalıdır). Bir
  playback oturumu, bitişten 60 saniye sonra bellekten temizlenir.
- **`race.spectators` (sunucu → oda, BEST-EFFORT — brief §27, bu dilimde
  EKLENDİ):** `{ raceId, count }`. `count`, `race:${raceId}` odasındaki
  **AÇIK SOKET** sayısıdır — `race_entries`/`race_tickets` **SATIR SAYISI
  DEĞİLDİR**. Yani "bu yarışa kayıtlı kaç at var" değil, "şu an kaç kişi
  izliyor" sorusunun cevabıdır (brief'in "👥 348 spectators" göstergesi).
  NE ZAMAN yayınlanır: bir soket odaya girdiğinde (`race.subscribe`) ve bir
  soket koptuğunda (`handleDisconnect` → `client.data.raceIds` üzerinden o
  soketin abone olduğu HER yarış için ayrı ayrı). **BİLİNÇLİ SINIRLAMA:**
  sayaç `server.sockets.adapter.rooms` üzerinden okunur, yani **TEK
  INSTANCE** içindir — Socket.IO'nun Redis adapter'ı (brief §6) bağlanana
  kadar çok-instance'lı bir dağıtımda her instance YALNIZCA kendi soketlerini
  sayar ve sayı olduğundan KÜÇÜK görünür. Bu, sessiz bir yanlış değil,
  bilinçli olarak belgelenmiş bir sınırdır (bkz. `RaceSpectatorCountPayload`
  doc yorumu).
- **`chat.message` (istemci → sunucu — brief §13, bu dilimde EKLENDİ):**
  `{ raceId: string, body: string }` gönderir. **`playerId` GÖNDERİLMEZ**
  (gönderilse bile yok sayılır) — gönderen, HTTP'deki gibi oturum
  token'ından çözülür (`CLAUDE.md` "SUNUCU OTORİTESİ"). Sunucu sırası
  ÖNEMLİDİR ve her adım bir öncekine bağlıdır: (1) kimlik yoksa soket
  kesilir, (2) gövde şekli (`raceId` UUID + `body` alanı) kaba kontrol,
  (3) **hız sınırı** (`config/chat.config.json → rateLimit`, brief §32),
  (4) **yetki**: soket o yarışa `race.subscribe` ile abone mi, (5) yazma,
  (6) odaya yayın. (3) ve (4) **yazmadan ÖNCE** çalışır — reddedilen mesaj
  veritabanına sızmaz.
- **`chat.message.received` (sunucu → `race:${raceId}` odasının TAMAMI,
  bu dilimde EKLENDİ):** `RaceChatMessageView` = `{ messageId, raceId,
  playerId, username, body, createdAt }`. **Yayınlanan gövde, istemcinin
  gönderdiği HAM gövde DEĞİL, sunucunun yazdığı satırdır** (kırpılmış,
  `maxMessageLength`'e uygun, `username` `players` JOIN'inden) — gönderen
  dahil odadaki herkes aynı `messageId`'yi görür.
- **`chat.history` (sunucu → YALNIZCA abone olan soket, abonelik anında
  TAM OLARAK bir kez, bu dilimde EKLENDİ):** `{ raceId, messages: [] }` —
  **KRONOLOJİK** (eskiden yeniye) sırada, en fazla `config/chat.config.json
  → historyLimit` satır. Odaya DEĞİL tek sokete gönderilir (geç katılan bir
  izleyicinin geçmişi ikinci kez herkese basması anlamsız olurdu). **Mesaj
  yoksa da BOŞ LİSTE gönderilir** — istemcinin "geçmiş boş" ile "geçmiş hiç
  gelmedi" arasındaki farkı ayırt edebilmesi için. Geçmiş okunamazsa
  (DB hatası) boş liste gönderilir ve sunucu tarafında uyarı loglanır: bu
  bir replay/izleme akışıdır, sohbet geçmişi yüzünden yarış izleme
  DÜŞMEMELİDİR.
- **`chat.error` (sunucu → istemci, bu dilimde EKLENDİ):** `{ message:
  string }`. HTTP'deki 400/429'un WebSocket karşılığıdır — aynı olay hem
  gövde doğrulama hatası (`normalizeMessageBody`: boş / yalnızca boşluk /
  aşırı uzun / metin değil), hem hız sınırı aşımı, hem "bu yarışa abone
  değilsin" için kullanılır (HTTP'de bunlar 400/429/403 iken burada tek
  kanal vardır). **Yetki YENİDEN İCAT EDİLMEDİ:** sohbet, `race.subscribe`
  ile AYNI kapıyı kullanır (katılımcı **VEYA** tribün bileti sahibi) —
  `chat.message` için ayrı bir izin kontrolü YOKTUR.
- **Bilinçli kapsam dışı (hâlâ YOK):** `notification.new` (yukarıdaki
  tablo) — `lobby.update`, `race.spectators` ve `chat.*` ARTIK UYGULANDI
  (bkz. yukarıdaki maddeler). İstemci tarafında otomatik yeniden abone olma
  ARTIK VAR — bkz. aşağıdaki "Frontend entegrasyonu" notunun reconnection
  paragrafı. **`chat.*` olaylarının HENÜZ bir frontend tüketicisi YOKTUR**
  (backend + e2e tamamdır; tribün sohbeti arayüzü brief §35'in açık
  işidir).

**Frontend entegrasyonu (bu turda EKLENDİ — daha önce F2'nin GERÇEK bir
tüketicisi YOKTU):** `apps/web/src/features/race-viewer/live-race-socket.ts`
bu namespace'e bağlanan ince bir sarmalayıcıdır; `apps/web/src/app/
races/page.tsx`, gerçek `POST /horses/:id/practice-race` çağrısının
döndürdüğü `raceId` ile `LiveRaceViewer` bileşenini mount ederek pratik
yarış ekranını canlı 3D görüntüleyiciye bağlar (`apps/web/package.json`'a
`socket.io-client` bağımlılığı eklendi). Bu, `RaceViewer`/`timeline-
playback.ts`'in aksine SEEK/HIZ/DURAKLAT kontrolleri SUNMAZ (canlı bir
yayında geçmişe gidilemez/hızlandırılamaz — bu dürüstçe bir "CANLI"
rozetiyle gösterilir, bkz. `RaceHud.tsx`'in `liveStatus` prop'u); at
kimliği `horseId` DEĞİL `entryId` (`race_entries.id`) üzerinden takip
edilir (segmentlerin gerçek anahtarı budur), isim/"bu benim atım mı"
eşlemesi `race.roster`'dan gelir.

**Reconnection (bu turda EKLENDİ):** `socket.io-client`'ın KENDİ otomatik
yeniden bağlanması (varsayılan davranış) `race.subscribe`'ı her yeniden
bağlanmada zaten otomatik tekrar gönderiyordu (backend'in paylaşılan
`RacePlaybackSession`'ı sayesinde bu bir "yakalama" yayınından
FAYDALANIR — bkz. yukarısı) — ama istemci tarafında iki gerçek boşluk
vardı: (1) kullanıcı bağlantı koptuğunda hiçbir geri bildirim
GÖRMÜYORDU, (2) her yeniden bağlanmanın getirdiği "yakalama" segmentleri
koşulsuz olarak birikip sınırsız büyüyordu. `live-race-socket.ts`'e yeni
`onDisconnected` handler'ı (`RaceHud`'un `liveStatus`'unu
`'reconnecting'`ye çevirir) ve yeni `segment-merge.ts`'in `mergeSegments`
fonksiyonu (`raceEntryId:timestampMs` anahtarına göre tekilleştirir)
eklendi. `mergeSegments` framework-bağımsız saf bir fonksiyon olduğundan
bu sandbox'ta GERÇEKTEN `tsc --noEmit` + `tsx` ile doğrulandı (bkz. o
dosyanın doc yorumu).

## 11. Hata kodu kataloğu (örnek, genişletilecek)

| Kod | Anlamı |
|---|---|
| `HORSE_TOO_TIRED` | Atın enerjisi/yorgunluğu yarış veya antrenman için yetersiz |
| `HORSE_INJURED` | At sakat, işlem yapılamaz |
| `INSUFFICIENT_FUNDS` | Oyuncunun parası işlemi karşılamıyor |
| `INSUFFICIENT_ENERGY` | Antrenman için enerji yetersiz |
| `RACE_FULL` | Yarış katılımcı limitine ulaştı; `POST /races/:id/join`'de ayrıca GERÇEK oyuncu kontenjanı (`races.max_players`) doldu demektir (Ücretli yarış, 27.09.2026) |
| `RACE_ALREADY_STARTED` | Yarış başladıktan sonra kayıt/değişiklik denemesi |
| `LISTING_NOT_FOUND` | Pazar ilanı bulunamadı veya süresi doldu |
| `IDEMPOTENCY_KEY_REQUIRED` | Kritik işlemde `Idempotency-Key` header'ı eksik |
| `VALIDATION_ERROR` | İstek gövdesi şema doğrulamasından geçemedi |
| `USERNAME_ALREADY_TAKEN` | Kayıt sırasında seçilen kullanıcı adı zaten alınmış (FAZ 1 wiring) |
| `PLAYER_NOT_FOUND` | Verilen id'ye ait oyuncu bulunamadı (FAZ 1 wiring) |
| `HORSE_NOT_FOUND` | Verilen id'ye ait at bulunamadı (FAZ 1 wiring, ikinci dilim) |
| `RACE_NOT_FOUND` | Verilen id'ye ait yarış bulunamadı (AUDIT_REPORT.md R2, `GET /races/:id/timeline`) |
| `CARE_ACTION_ON_COOLDOWN` | Bakım eylemi cooldown süresi dolmadan tekrar istendi (FAZ 1 wiring, beşinci dilim) |
| `MAX_STABLE_LEVEL_REACHED` | Ahır zaten en yüksek seviyede, daha fazla yükseltilemez (FAZ 1 wiring, altıncı dilim) |
| `DAILY_REWARD_ALREADY_CLAIMED` | Günlük ödül cooldown süresi dolmadan tekrar talep edildi (FAZ 1 wiring, yedinci dilim) |
| `INVALID_LISTING_PRICE` | Pazar ilanı fiyatı negatif veya tam sayı değil (FAZ 1 wiring, on birinci dilim) |
| `CANNOT_BUY_OWN_LISTING` | Oyuncu kendi pazar ilanını satın almaya çalıştı (FAZ 1 wiring, on birinci dilim) |
| `LISTING_NOT_ACTIVE` | Pazar ilanı aktif değil — zaten satılmış/iptal edilmiş/süresi dolmuş (FAZ 1 wiring, on birinci dilim; üçüncü anlamı on üçüncü dilimde eklendi) |
| `LISTING_EXPIRED` | Pazar ilanının süresi dolmuş (FAZ 1 wiring, on birinci dilim — pratikte artık dönmez, bkz. §5 "İlan süresi dolma" notu, on üçüncü dilim) |
| `HORSE_ALREADY_LISTED` | Bu ata ait zaten aktif bir pazar ilanı var (FAZ 1 wiring, on birinci dilim) |
| `INVALID_LISTING_EXPIRY` | Pazar ilanı süresi (`expiresInHours`) 1-720 saat aralığı dışında (FAZ 1 wiring, on üçüncü dilim) |
| `ALREADY_IN_MATCHMAKING_QUEUE` | Oyuncunun zaten eşleştirme kuyruğunda bir bileti var (FAZ 1 wiring, on dördüncü dilim) |
| `NOT_IN_MATCHMAKING_QUEUE` | Oyuncunun eşleştirme kuyruğunda bileti yok (kuyruktan çıkma denemesi) (FAZ 1 wiring, on dördüncü dilim) |
| `HORSE_EQUIPMENT_NOT_FOUND` | Verilen `equipmentId` bulunamadı ya da başka bir ata ait (Ekipman dilimi, bu turda EKLENDİ) |
| `RACE_TICKET_ALREADY_OWNED` | Bu yarış için zaten bir tribün bileti var (Tribün, 27.09.2026) |
| `RACE_NOT_WATCHABLE` | Yarış tribünden izlenemez — kendi yarışın / henüz bitmemiş / izleme penceresi dolmuş (Tribün, 27.09.2026) |
| `RACE_TICKET_REQUIRED` | Yarışın katılımcısı değilsin ve tribün biletin yok — `GET /races/:id/timeline` (Tribün, 27.09.2026; eskiden düz `FORBIDDEN` idi) |
| `CANNOT_FRIEND_SELF` | Kendine arkadaşlık isteği gönderilemez (Arkadaşlık, 27.09.2026) |
| `CANNOT_MESSAGE_SELF` | Kendine mesaj gönderilemez (Arkadaşlık, 27.09.2026) |
| `INVALID_FRIENDSHIP_ACTION` | `action` alanı `accept`/`reject` dışında (Arkadaşlık, 27.09.2026) |
| `INVALID_MESSAGE_BODY` | Mesaj gövdesi boş ya da `config/social.config.json → maxMessageLength` üstünde (Arkadaşlık, 27.09.2026) |
| `NOT_FRIENDS` | Alıcıyla kabul edilmiş bir arkadaşlık yok — mesaj gönderilemez (Arkadaşlık, 27.09.2026) |
| `FRIENDSHIP_NOT_FOUND` | Böyle bir arkadaşlık/istek yok, ya da bu oyuncuya ait değil (Arkadaşlık, 27.09.2026; üç durum TEK kodda toplanır — varlık sızdırmamak için) |
| `FRIENDSHIP_ALREADY_EXISTS` | Bu çiftte zaten bekleyen veya kabul edilmiş bir arkadaşlık var (Arkadaşlık, 27.09.2026) |
| `SOCIAL_LIMIT_REACHED` | Bekleyen arkadaşlık isteği tavanı aşıldı — `config/social.config.json → pendingRequestsLimit` (Arkadaşlık, 27.09.2026) |
| `CANNOT_GIFT_SELF` | Kendine hediye gönderilemez (Hediye, 27.09.2026) |
| `INVALID_GIFT_AMOUNT` | Hediye miktarı tam sayı değil ya da `config/gift.config.json → minAmount`/`maxAmount` aralığı dışında (Hediye, 27.09.2026) |
| `GIFT_CURRENCY_NOT_ALLOWED` | Bu para birimi hediye olarak gönderilemez — `config/gift.config.json → allowedCurrencies` (Hediye, 27.09.2026) |
| `GIFT_REQUIRES_FRIENDSHIP` | Alıcıyla kabul edilmiş bir arkadaşlık yok — hediye gönderilemez (Hediye, 27.09.2026) |
| `DAILY_GIFT_LIMIT_REACHED` | Kayan penceredeki (`dailyWindowHours`) hediye SAYISI tavanı aşıldı — `config/gift.config.json → dailyLimit` (Hediye, 27.09.2026) |
| `INVALID_RACE_DEFINITION` | Yarış tanımı geçersiz: ad uzunluğu, at sayısı (8/10/12/14/16 dışında), giriş ücreti, mesafe, başlangıç zamanı, tribün ücreti/kapasitesi ya da `raceType`–`entryFee` çelişkisi — `POST /races` (Ücretli yarış, 27.09.2026) |
| `RACE_LIMIT_REACHED` | Oyuncunun AÇIK yarış sayısı tavanı aşıldı — `config/race-lobby.config.json → maxOpenRacesPerPlayer` — `POST /races` (Ücretli yarış, 27.09.2026) |
| `INVALID_RACE_JOIN_INPUT` | Katılım gövdesi geçersiz: `horseId` yok, UUID değil ya da yanlış tipte; taktik/risk bilinen bir değer değil — `POST /races/:id/join` (Ücretli yarış, 27.09.2026) |
| `RACE_NOT_JOINABLE` | Yarışa katılunamaz: durumu `scheduled` değil ya da başlangıç zamanı geçmiş — `POST /races/:id/join` (Ücretli yarış, 27.09.2026) |
| `ALREADY_JOINED_RACE` | Oyuncu bu yarışa zaten katılmış; kural uygulamada değil `race_entries_race_player_uq` kısmi tekil indeksinde ZORLANIR (migration 0037) — `POST /races/:id/join` (Ücretli yarış, 27.09.2026) |
| `INVALID_ENTRY_READY_INPUT` | READY gövdesi geçersiz: `status` yok, metin değil ya da `ready`/`not_ready` dışında bir değer (`waiting`/`cancelled` dâhil) — `POST /races/:id/ready` (Ücretli yarış lobisi, 27.09.2026) |
| `RACE_ENTRY_NOT_FOUND` | Oyuncunun bu yarışta katılımı yok — `POST /races/:id/ready`. **403 DEĞİL 404:** ortada işlem yapılacak bir KAYNAK yoktur ve 403 "burada bir katılım var ama senin değil" bilgisini sızdırırdı (Ücretli yarış lobisi, 27.09.2026) |
| `RACE_ENTRY_NOT_READYABLE` | Hazır-olma penceresi kapalı: yarış `scheduled` değil, başlangıç zamanı gelmiş (sınırda kapalı) ya da katılım `cancelled` — `POST /races/:id/ready`. Ret nedeni önceliği: durum > zaman > iptal (Ücretli yarış lobisi, 27.09.2026) |
