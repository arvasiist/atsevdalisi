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
POST   /api/v1/horses/{id}/train       # antrenman (brief §10)
POST   /api/v1/horses/{id}/care        # tımar/su/temizlik/veteriner/nalbant/dinlendirme
                                        # (brief §11 — tek uç nokta, `actionType` alanı,
                                        # bkz. §4 "Bakım ve Besleme")
POST   /api/v1/horses/{id}/feed        # besleme (brief §12, `feedType` alanı)
GET    /api/v1/horses/{id}/history     # yarış/antrenman geçmişi (brief §40 Geçmiş)
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
**başlangıç atı** alır (`gelding`, "Arap" cinsi, sabit isim havuzundan
seçilmiş bir isim, kalite/potansiyel sabit başlangıç değerleri, "prime"
yaşam evresinde — bkz. `domain/horse/horse.ts` `createStarterHorse`).
Bu, brief'te açıkça yazmayan ama at yetiştiriciliği oyununda gerekli bir
tasarım kararıdır (at olmadan Antrenman/Bakım/Yarış ekranları gösterilemez).

`history` uç noktası ve `horse_surface_stats`/`horse_distance_stats`
tablolarının okunması/yazılması hâlâ KAPSAM DIŞINDADIR. `train` ve
`horse_stats` FAZ 1 wiring'in DÖRDÜNCÜ diliminde bağlandı (bkz. aşağıdaki
"Antrenman" bölümü); `care`/`feed` ve `horse_health`'in dar bir alt
kümesi ise BEŞİNCİ dilimde bağlandı (bkz. aşağıdaki "Bakım ve Besleme"
bölümü).

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

`POST /horses/{id}/feed` — örnek istek (`feedType`: `standard`|`energy`|
`protein`|`recovery`|`performance` — brief §12: "daha pahalı yem = daha
iyi" garantisi YOKTUR, örn. `performance` enerjiyi çok artırır ama
`weightCondition`'ı düşürür):

```json
{ "feedType": "performance" }
```

Yanıt şekli `care` ile aynıdır (`feedType` alanı `actionType` yerine).

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

### Pratik Yarış (FAZ 1 wiring, sekizinci dilim; dokuzuncu dilimde giriş ücreti + ödül eklendi, bu oturum)

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
gerçek orkestrasyonuna kavuşuyor: oyuncunun atı, sabit sayıda (5)
deterministik yapay zeka rakibe karşı SOLO yarışır; sonuç `races`/
`race_entries`/`race_entry_segments` tablolarına (migration 0006/0014,
önceden hiç yazılmıyordu) gerçekten kaydedilir.

Gövde TAMAMEN opsiyoneldir — hiçbiri gönderilmezse `racingStyle: mid_pack`,
`riskLevel: normal`, `startApproach: balanced`, `finalStretchPlan: normal`
kullanılır:

```json
{
  "racingStyle": "front_runner",
  "riskLevel": "high",
  "startApproach": "aggressive",
  "finalStretchPlan": "early_sprint"
}
```

örnek yanıt (`finalResult`/`explanations` TÜM katılımcıları — oyuncunun
atı + 5 bot — içerir, `horseId` alanı oyuncunun hangi girişi olduğunu
gösterir):

```json
{
  "success": true,
  "data": {
    "raceId": "...",
    "horseId": "...",
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
    "entryFee": 50,
    "prizeWon": 200,
    "newBalance": { "money": 5150, "gems": 50 }
  }
}
```

Tasarım kararları (bkz. `application/use-cases/run-practice-race.use-case.ts`
üstündeki KAPSAM notu):

- Bu, §6'daki TAM (gerçek çok oyunculu, programlı, giriş ücretli/ödül
  havuzlu) Race API'sinin YERİNE GEÇMEZ — o API hâlâ wiring edilmedi. Bu
  uç nokta, motoru ilk kez gerçek veriye bağlayan, solo/pratik bir ön
  adımdır.
- **Dokuzuncu dilim (bu oturum):** Giriş ücreti (`config/economy.config.json`
  `practiceRace.baseEntryFee` × `raceEntryFeeMultiplier`) yarış başlamadan
  ÖNCE düşülür, ödül (`practiceRace.prizeByFinishPosition`, bitiş sırasına
  göre) yarış SONUCUNA göre eklenir — ikisi de TEK bir `PlayerRepository.
  updateWithLock` çağrısı içinde (Ahır Yükseltme'deki AYNI satır kilitleme
  deseni). Bakiye yetersizse `409 INSUFFICIENT_FUNDS` döner ve HİÇBİR ŞEY
  yazılmaz (ne para çekilir ne yarış kaydedilir). Bu, gerçek bir çok
  oyunculu ödül havuzu DEĞİLDİR — sabit, önceden belirlenmiş bir tablodur
  (botlar para yatırmaz).
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

**Uygulama durumu (FAZ 1 wiring, on birinci + on ikinci dilim, bu
oturum):** aşağıdaki ALTI uç nokta gerçek veritabanına bağlandı.

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
{ "horseId": "...", "price": 5000 }
```

`sellerId` GÖNDERİLMEZ — atın `ownerId`'sinden türetilir. Örnek yanıt
(`201 Created`):

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
TEK aktif ilanı olabilir); fiyat negatif/tam sayı değilse `400
INVALID_LISTING_PRICE`.

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
`active` değilse (zaten satılmış/iptal edilmiş) `409 LISTING_NOT_ACTIVE`;
süresi dolmuşsa `409 LISTING_EXPIRED`; kendi ilanını almaya çalışırsa
`400 CANNOT_BUY_OWN_LISTING`; alıcının bakiyesi yetersizse `409
INSUFFICIENT_FUNDS` (hiçbir şey yazılmaz); `Idempotency-Key` eksikse
`400 IDEMPOTENCY_KEY_REQUIRED`.

**İptal et:** `DELETE /market/listings/{id}` — ilanı `cancelled` yapar.
Olası hata: `404 LISTING_NOT_FOUND`, zaten aktif değilse `409
LISTING_NOT_ACTIVE`. **Bilinçli sınırlama:** yetkilendirme (yalnızca
ilanın sahibi iptal edebilmeli) YOK — bkz. `CancelMarketListingUseCase`
doc yorumu (bu projede HİÇBİR uç noktada henüz gerçek bir oturum sistemi
yok, bu dilime özgü bir boşluk değil).

**KAPSAM (bu oturum, bilinçli):** `listingType` her zaman `fixed_price`'tır
(`auction`'ın teklif verme/kazanma mantığı domain katmanında hiç yok,
bkz. domain/market/README.md). İlan süresi (`expiresInHours`) YOK —
ilanlar süresizdir (`expireListingIfNeeded` hazır ama tetikleyecek
zamanlanmış bir job yok). Tarama ekranının ata özgü filtreleri (`?breed=&
minAge=...`) YOK (bkz. "Tara" bölümündeki KAPSAM DIŞI notu).

## 6. Race (Yarışlar)

> **Not (FAZ 1 wiring, sekizinci dilim):** Aşağıdaki TAM (çok oyunculu,
> programlı, giriş ücretli/ödül havuzlu) Race API'si henüz wiring
> edilmedi. Bunun yerine `simulateRace`'in ilk gerçek orkestrasyonu,
> §4 Horses altındaki `POST /horses/{id}/practice-race` (solo, ücretsiz,
> sabit rakip/pist) olarak eklendi — bkz. o bölümdeki not.

```http
GET  /api/v1/races                    # yarış takvimi (brief §35)
GET  /api/v1/races/{id}
POST /api/v1/races/{id}/enter         # ata + jokey + taktik ile kayıt (brief §14.2)
POST /api/v1/races/{id}/start         # sadece server/scheduler tetikler
GET  /api/v1/races/{id}/result        # authoritative sonuç (brief §57)
GET  /api/v1/races/{id}/replay        # seed + snapshot + config (brief §58)
POST /api/v1/races/{id}/claim-reward  # Idempotency-Key zorunlu (brief §54)
```

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

Anti-cheat (brief §42): her uç nokta, client'tan gelen payload'ı
`domain/online/anti-cheat.ts` `pickAllowedClientFields` ile ALLOWLIST'ten
geçirmeli; `race.enter` gibi uç noktalarda client bir snapshot da
gönderirse `assertSnapshotMatchesAuthoritative` ile server'ın kendi DB
değerleriyle karşılaştırılıp uyuşmazlık reddedilmelidir.

## 10. WebSocket olayları (öneri)

Brief'te WebSocket "gerektiğinde" kullanılacağı belirtilmiş (§6). Önerilen
kullanım alanları:

```text
race.telemetry     — canlı yarış sırasında segment güncellemeleri
race.finished      — yarış sonucu hazır olduğunda
notification.new   — brief §46 bildirim sistemi
lobby.update       — online yarış lobisi (brief §41)
```

## 11. Hata kodu kataloğu (örnek, genişletilecek)

| Kod | Anlamı |
|---|---|
| `HORSE_TOO_TIRED` | Atın enerjisi/yorgunluğu yarış veya antrenman için yetersiz |
| `HORSE_INJURED` | At sakat, işlem yapılamaz |
| `INSUFFICIENT_FUNDS` | Oyuncunun parası işlemi karşılamıyor |
| `INSUFFICIENT_ENERGY` | Antrenman için enerji yetersiz |
| `RACE_FULL` | Yarış katılımcı limitine ulaştı |
| `RACE_ALREADY_STARTED` | Yarış başladıktan sonra kayıt/değişiklik denemesi |
| `LISTING_NOT_FOUND` | Pazar ilanı bulunamadı veya süresi doldu |
| `IDEMPOTENCY_KEY_REQUIRED` | Kritik işlemde `Idempotency-Key` header'ı eksik |
| `VALIDATION_ERROR` | İstek gövdesi şema doğrulamasından geçemedi |
| `USERNAME_ALREADY_TAKEN` | Kayıt sırasında seçilen kullanıcı adı zaten alınmış (FAZ 1 wiring) |
| `PLAYER_NOT_FOUND` | Verilen id'ye ait oyuncu bulunamadı (FAZ 1 wiring) |
| `HORSE_NOT_FOUND` | Verilen id'ye ait at bulunamadı (FAZ 1 wiring, ikinci dilim) |
| `CARE_ACTION_ON_COOLDOWN` | Bakım eylemi cooldown süresi dolmadan tekrar istendi (FAZ 1 wiring, beşinci dilim) |
| `MAX_STABLE_LEVEL_REACHED` | Ahır zaten en yüksek seviyede, daha fazla yükseltilemez (FAZ 1 wiring, altıncı dilim) |
| `DAILY_REWARD_ALREADY_CLAIMED` | Günlük ödül cooldown süresi dolmadan tekrar talep edildi (FAZ 1 wiring, yedinci dilim) |
| `INVALID_LISTING_PRICE` | Pazar ilanı fiyatı negatif veya tam sayı değil (FAZ 1 wiring, on birinci dilim) |
| `CANNOT_BUY_OWN_LISTING` | Oyuncu kendi pazar ilanını satın almaya çalıştı (FAZ 1 wiring, on birinci dilim) |
| `LISTING_NOT_ACTIVE` | Pazar ilanı aktif değil — zaten satılmış/iptal edilmiş (FAZ 1 wiring, on birinci dilim) |
| `LISTING_EXPIRED` | Pazar ilanının süresi dolmuş (FAZ 1 wiring, on birinci dilim) |
| `HORSE_ALREADY_LISTED` | Bu ata ait zaten aktif bir pazar ilanı var (FAZ 1 wiring, on birinci dilim) |
