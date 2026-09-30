# AT SEVDALISI — FİNAL PROJE DENETİMİ

**Tarih:** 29.09.2026
**Kapsam:** brief §42'nin 8 kritik sistemi + bunların zincirdeki (DATABASE ↓
BACKEND ↓ API ↓ BUSINESS LOGIC ↓ RACE ENGINE ↓ WEBSOCKET ↓ FRONTEND ↓ USER
EXPERIENCE ↓ TEST) gerçek durumu.
**Kapsam dışı (bilinçli):** 3D GLB at modelleri, gerçek jokey görselleri,
Veliefendi asset'leri, gerçek ses dosyaları. Bunlar brief'in kendisinde
"bu brief'in parçası değil" diye yazılıdır (CLAUDE.md "SAHTE ASSET YASAK").

---

## §0 — Yöntem ve dürüstlük notu

Bu belge **koddan okunarak** üretildi: her satırın arkasında ya bir dosya
yolu ya bir test dosyası ya da bir migration vardır. Hiçbir satır "olması
gerekir" diye yazılmadı.

**"Bir özelliğin dosyası var" ≠ "tamam".** Bu yüzden her özellik 12 alanda
ayrı ayrı işaretlendi ve **zincirin en zayıf halkası** o özelliğin durumunu
belirledi. Örnek: `domain/club/club.ts` saf mantığı vardır ve birim testi
geçer, ama onu çağıran hiçbir use-case ve hiçbir HTTP yolu yoktur → durum
`DOMAIN ONLY`, üretime hazır **HAYIR**.

**Ölçüm, iddia değildir.** Bu belgedeki "test var" satırları
`apps/api/test/**` ve `apps/web/test/**` altındaki dosya adlarıyla
eşleşir; "CI yeşil" satırları GitHub Actions koşum numarasıyla verilir.
CLAUDE.md'nin kuralı burada da geçerlidir: *"Asla 'çalışıyor' deme — kanıt
CI'dır."*

---

## §1 — Durum sözlüğü

| Durum | Anlamı |
|---|---|
| `IMPLEMENTED` | Zincirin tamamı gerçek: DB → backend → API → iş mantığı → (varsa) motor → (varsa) WebSocket → arayüz → test. |
| `PARTIAL` | Zincir çalışıyor ama bilinen bir parçası eksik; eksik olan **adıyla** yazılıdır. |
| `API ONLY` | Uç nokta ve iş mantığı var; istemci tüketicisi **yok**. |
| `UI ONLY` | Ekran var; arkasında gerçek uç nokta **yok**. |
| `DOMAIN ONLY` | Saf mantık + birim testi var; hiçbir katman onu **çağırmıyor**. |
| `NOT WIRED` | Parçalar var, birbirine bağlanmamış. |
| `BROKEN` | Çağrılıyor ama yanlış çalışıyor. |
| `MISSING` | Hiç yok. |
| `STALE` | Var ama gerçeği yansıtmıyor (belge/eski kural). |

---

## §2 — Özet tablo (51 özellik)

| # | Özellik | Durum | Üretime hazır |
|---:|---|---|---|
| 1 | Kayıt ve giriş (e-posta/JWT) | `PARTIAL` | Koşullu |
| 2 | Oyuncu özeti ve üst bar | `IMPLEMENTED` | Evet |
| 3 | Genel sosyal profil (`/profile/:username`) | `IMPLEMENTED` | Evet |
| 4 | Bakiye ve para birimi modeli (money/gems) | `IMPLEMENTED` | Evet |
| 5 | At listesi ve detay | `IMPLEMENTED` | Evet |
| 6 | At istatistikleri (8 stat) | `IMPLEMENTED` | Evet |
| 7 | Zemin ve mesafe istatistikleri | `IMPLEMENTED` | Evet |
| 8 | At sağlığı (6 boyut) | `PARTIAL` | Koşullu |
| 9 | Antrenman | `IMPLEMENTED` | Evet |
| 10 | Bakım (care) | `IMPLEMENTED` | Evet |
| 11 | Beslenme ve yem envanteri | `IMPLEMENTED` | Evet |
| 12 | Ekipman | `IMPLEMENTED` | Evet |
| 13 | At pazarı (market) | `IMPLEMENTED` | Evet |
| 14 | At değerleme (market-value) | `IMPLEMENTED` | Evet |
| 15 | Soy ağacı (pedigree) okuma | `IMPLEMENTED` | Evet |
| 16 | Yetiştiricilik (breeding) | `IMPLEMENTED` | Evet |
| 17 | Genetik domain | `PARTIAL` | Koşullu |
| 18 | Jokey vitrini, kiralama ve serbest bırakma | `IMPLEMENTED` | Evet |
| 19 | Jokey → motor etkisi | `IMPLEMENTED` | Evet |
| 20 | Pratik yarış | `IMPLEMENTED` | Evet |
| 21 | PvP matchmaking | `IMPLEMENTED` | Evet |
| 22 | Lobi yarışı oluşturma | `IMPLEMENTED` | Evet |
| 23 | Lobi katılma / hazır / ayrılma | `IMPLEMENTED` | Evet |
| 24 | Yarış yaşam döngüsü ve zamanlayıcı | `IMPLEMENTED` | Evet |
| 25 | Saha kompozisyonu (fieldSize + botlar) | `IMPLEMENTED` | Evet |
| 26 | Race Engine (deterministik simülasyon) | `IMPLEMENTED` | Evet |
| 27 | Taktik stili → motor | `IMPLEMENTED` | Evet |
| 28 | Kişilik/mizaç → motor | `IMPLEMENTED` | Evet |
| 29 | Kesinleştirme ve ödül dağıtımı | `IMPLEMENTED` | Evet |
| 30 | Yarış iptali ve iade | `IMPLEMENTED` | Evet |
| 31 | Yarış dengesi ölçümü | `IMPLEMENTED` | Evet |
| 32 | Ekonomi defteri (`economy_transactions`) | `IMPLEMENTED` | Evet |
| 33 | Cüzdan (yatırma / günlük ödül / geçmiş) | `IMPLEMENTED` | Evet |
| 34 | Idempotency | `IMPLEMENTED` | Evet |
| 35 | Ödül havuzu ve çarpan | `IMPLEMENTED` | Evet |
| 36 | Tribün bileti ve kontenjan | `IMPLEMENTED` | Evet |
| 37 | Tribün iadesi | `IMPLEMENTED` | Evet |
| 38 | Canlı zaman çizelgesi ve replay | `IMPLEMENTED` | Evet |
| 39 | WebSocket yayın katmanı | `IMPLEMENTED` | Evet |
| 40 | Yarış sohbeti ve izleyici sayısı | `IMPLEMENTED` | Evet |
| 41 | Bildirimler | `IMPLEMENTED` | Evet |
| 42 | Yarış daveti | `IMPLEMENTED` | Evet |
| 43 | Arkadaşlık | `IMPLEMENTED` | Evet |
| 44 | Doğrudan mesajlar | `IMPLEMENTED` | Evet |
| 45 | Hediye | `IMPLEMENTED` | Evet |
| 46 | Blok ve şikâyet | `IMPLEMENTED` | Evet |
| 47 | Yönetim uçları (7 uç) | `IMPLEMENTED` | Evet |
| 48 | Denetim günlüğü (`admin_audit_log`) | `IMPLEMENTED` | Evet |
| 49 | Sıralama (leaderboard) | `IMPLEMENTED` | Evet |
| 50 | Bağlanmamış domain modülleri (kulüp/sezon/turnuva/progression/personel) | `DOMAIN ONLY` | Hayır |
| 51 | 3D sunum ve ses | `PARTIAL` | Hayır (asset bekliyor) |

**Sayım:** `IMPLEMENTED` **46** · `PARTIAL` **4** · `API ONLY` 0 ·
`DOMAIN ONLY` 1 · `MISSING`/`BROKEN`/`UI ONLY`/`NOT WIRED` **0**.

**Üretime hazır: 46/51.**

> ⚠️ **30.09.2026 (ikinci dilim) — #21, #33, #37 `IMPLEMENTED`.** #21:
> kuyruk taraması (`MatchmakingScheduler`). #33: geçmiş sayfalama
> (`?before=` imleci). #37: bu satır "koşmuş yarışın bileti iade
> edilebiliyor" diyordu — **teşhis yanlıştı**: bilet YALNIZCA bitmiş yarışa
> satılır; asıl açık "izle + parayı geri al"dı → izlenmiş bilet iade
> edilmez (migration 0044). Sayım tablodan türetildi (46/4).

> ⚠️ **30.09.2026 — BAĞIMSIZ YENİDEN DENETİM.** Bu belgenin #22/#23/#29
> satırları "arayüz var / katılma bağlı" diyordu ve **YANLIŞTI**: web
> istemcisi `GET/POST /races`, `/join`, `/ready`, `/leave`, `/settle`
> uçlarının HİÇBİRİNİ çağırmıyordu (`api-client.ts` taraması). Ayrıca üç
> sunucu açığı bulundu ve kapatıldı: satılan at eski sahibi adına
> koşuyordu (#13/#23), READY yalnızca bilgiydi (#23), kilitlenen yarışı
> kesinleştiren iş yoktu (#29). Ayrıntı: `PROJE_DURUMU.md` §13.33.
> `#50` personeli (`domain/staff`) hiç saymıyordu — eklendi. Sayım tablodan
> türetildi: #23 `PARTIAL → IMPLEMENTED` (43/7). Geriye kalan 9 maddenin **dokuzu da** bilinçli
olarak ertelendi (asset bekleyen 1, sahibin kararını bekleyen 1, tasarım
gereği istemci tüketicisi olmayan 2, oyun dengesi kararı bekleyen 5).

> ⚠️ **29.09.2026 — SAYIM DÜZELTİLDİ (`37` → `42`).** Bu satır #18'den
> önce `IMPLEMENTED` **37** diyordu ve **yanlıştı**: §2 tablosunda
> `IMPLEMENTED` + `Evet` taşıyan satırlar zaten **41** taneydi. Sayı, tek
> tek satırlar güncellenirken **hiç** güncellenmemiş ve üç dilim boyunca
> yanlış kalmış. Doğrulama yöntemi: tablo satırları sayıldı
> (`grep '^\| [0-9]* \| .* \| \`IMPLEMENTED\` \| Evet \|$'` → 41; #18 ile
> **42**), tahmin edilmedi. Bir sayım tablosunun kendi satırlarıyla
> çelişmesi, bu belgenin en sık düştüğü hata sınıfıdır — bir sonraki
> dilimde sayıyı **tablodan türet**, elle artırma.
>
> ⚠️ **29.09.2026 — `PARTIAL` 10 → 9 → 8.** #18 (jokey) `IMPLEMENTED`
> oldu: `JockeyPanel` `/stable`a bağlandı **ve** eksik olan
> `POST /jockeys/:jockeyId/release` ucu yazıldı. (#16 yetiştiricilik de
> aynı gün `IMPLEMENTED` olmuştu.) Bu sayımı güncellememek, bu belgenin
> daha önce **iki kez** düştüğü tuzağın ta kendisidir (bkz. aşağıdaki
> `API ONLY` notu).

⚠️ **`API ONLY` SAYISI ARTIK SIFIRDIR.** Bu satır 29.09.2026'ya kadar 2
gösteriyordu (#46 ve #47) ve **bayattı**: iki dilim boyunca (#47 yönetim
paneli, #43/#49 `username`) arayüzler yazıldı ama bu tablo güncellenmedi.
Bir sayım tablosunu güncellememek, tek tek satırları güncellememekten daha
kötüdür — okuyan kişi "panel yok" diye yeni bir panel yazmaya kalkar.

---

## §3 — Kesişen bulgular (özellik değil, kurallar)

Bunlar tek bir özelliğe ait değildir; hepsini birden etkiler.

### §3.1 Sunucu otoritesi — korunuyor
`domain/race/race-engine.ts` simülasyonun **tek** çalıştığı yerdir. İstemci
hiçbir yerde sonuç/para/stat hesaplamaz. Arayüzler (`RaceHud`,
`LiveRaceViewer`, `RaceScene3D`) yalnızca sunucudan gelen telemetriyi
**gösterir**; `RaceScene3D`'in animasyonu sunucu sonucunun **yerine
geçmez**, üstüne çizilir. `LiveRaceViewer`'da yorum olarak da yazılıdır.

### §3.2 Determinizm — korunuyor
`Math.random()` motorun içinde **yoktur**; `deriveRandom(seed, horseId,
segmentIndex, purpose)` kullanılır. Seed'in **kendisi** `randomUUID()`tir ve
**kilit anında** doğar (kesinleşmede değil) — bu ikisi çelişmez: motor
determinist olmak zorunda, seed rastgele olmak zorunda. Determinizm testi
`test/domain/race/` altında CI'da kilitlidir.

### §3.3 Katman yönü — korunuyor
`domain/` altında NestJS/ORM importu yoktur. `tsc` bunu yapısal olarak
zorlar (domain `tsconfig`'i framework tiplerini görmez). Yeni bir domain
dosyası eklerken bu kendiliğinden denetlenir.

### §3.4 Config sistemi
Tüm sayısal eşikler `config/*.config.json` + `load*Config()` ile okunur.
**Ölü config tuzağı** (§13.25'te yaşandı) kapalıdır: `aiFillEnabled` artık
gerçekten okunur ve onu düşüren bir test vardır. Kural: *yeni bir config
alanı eklerken onu OKUYAN kodu ve onu DÜŞÜREN testi aynı dilimde yaz.*

### §3.5 Para yolu
Her para hareketi `SELECT ... FOR UPDATE` + aynı transaction'da
`economy_transactions` defter kaydı üretir. Bunu ihlal eden tek bir yol
bulunamadı. Denetim taramasında kontrol edilen yollar: `settle-race`,
`cancel-race`, `purchase-ticket`, `refund-ticket`, `send-gift`,
`upgrade-facility`, `buy-horse`, `hire-jockey`, `mock-deposit`,
`apply-training`, `apply-care`.

### §3.6 Migration ve şema
43 migration, 36 tablo (+ `schema_migrations`). `races.status` CHECK'i
`races_status_valid` adıyla yürürlüktedir; `race-lifecycle.spec.ts` bu
dosyayı **okuyarak** karşılaştırır, yani şema ile kod sessizce ayrışamaz.

### §3.7 Test altyapısı
`apps/api/test/` 123 dosya, `apps/web/test/` 23 dosya. CI
(`.github/workflows/`) tam paketi koşar. Yerel harness
(`.claude/verify-admin.mjs`) aynı komutları koşar ve **şemayı önce
düşürür** (CLAUDE.md'nin açık talimatı).

### §3.8 Bilinen yapısal sınırlar (hata değil, tasarım)
- `in_progress` durumu **ölüdür**: yazan kod yoktur, yarış `locking`ten
  doğrudan `finished`a geçer. Bu yüzden brief'in `STARTING/RUNNING/
  FINISHING/SETTLING/REFUNDING` durumları **eklenmedi** — hiçbir kodun
  yazmadığı durumu uydurmak yanlış olurdu.
- `Pause` **imkânsızdır**: `races.status` CHECK'inde `paused` yoktur ve
  duraklatılacak bir "koşan yarış" kavramı sunucuda mevcut değildir.
- Zamanlayıcı (`RaceLockScheduler`) `NODE_ENV=test` iken **kapalıdır**;
  e2e saati kendi sürer (`tickNow()`). Yani zamanlayıcı davranışı üretim
  yapılandırmasına bağlıdır ve e2e onu doğrudan koşmaz.

---

## §4 — Özellik bazlı detay

Aşağıdaki 51 başlık §2'deki tablonun açılımıdır. Her başlıkta 12 alan
vardır: Durum · Backend · Frontend · Database · API · WebSocket · Tests ·
Üretime hazır · Eksik · Risk · Sıradaki adım (+ Kaynak).

---

### 1. Kayıt ve giriş (e-posta/JWT)

- **Durum:** `PARTIAL`
- **Backend:** `POST /players` (token'sız demo kaydı, `startupPackage` ile),
  `POST /auth/login` (`LoginWithProviderUseCase` + `TOKEN_SERVICE`),
  `AuthGuard` `APP_GUARD` olarak global kayıtlı, `@Public()` opt-out.
- **Frontend:** `usePlayer()` + `player-context` — oyuncu kimliği
  **localStorage**'da tutulur; gerçek token akışı istemcide yoktur.
- **Database:** `players`, `player_auth_providers`.
- **API:** `/api/v1/players`, `/api/v1/auth/login`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/auth.e2e-spec.ts`, `test/api/player*.e2e-spec.ts`.
- **Üretime hazır:** Koşullu.
- **Eksik:** (1) OAuth sağlayıcı kimlik bilgileri (Google/Apple client
  id/secret) **yok** — `POST /auth/login` bu yüzden pratikte çalışmaz;
  (2) istemcide gerçek giriş ekranı yok.
- **Risk:** Düşük (demo akışı bilinçli). Ama üretimde kimlik doğrulaması
  olmadan yönetim uçları da korunamaz.
- **Sıradaki adım:** Proje sahibinden OAuth kimlik bilgileri; sonra
  `apps/web`'e gerçek giriş ekranı.
- **Kaynak:** `apps/api/src/api/auth/*`, `apps/web/src/lib/player-context.tsx`.

---

### 2. Oyuncu özeti ve üst bar

- **Durum:** `IMPLEMENTED`
- **Backend:** `GET /players/:id` (`assertSelf` ile yalnızca kendi özeti).
- **Frontend:** `TopBarNav` — avatar + ad, `/profile/:username`e bağlı;
  para/gem göstergesi `refresh()` ile tazelenir.
- **Database:** `players` (`money`, `gems`, `xp`, `level`).
- **API:** `GET /api/v1/players/:id`.
- **WebSocket:** ilgisiz.
- **Tests:** `apps/web/test/components/top-bar-nav.spec.ts` (gezinti
  listesi ile sayfaları karşılaştırır), `test/api/player*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** `PlayerSummary.username` silinirse oyuncunun **kendi**
  profiline giden tek yol kopar (dinamik rota olduğu için `nav-links.ts`'e
  giremez). CLAUDE.md'de kilitlidir.
- **Sıradaki adım:** —
- **Kaynak:** `apps/web/src/components/TopBarNav.tsx`, `packages/shared-types/src/player.ts`.

---

### 3. Genel sosyal profil (`/profile/:username`)

- **Durum:** `IMPLEMENTED`
- **Backend:** `GET /players/profile/:username` — `@Public()`,
  `GetPlayerProfileUseCase`. Yanıt tipi `PlayerProfileView` **`PlayerSummary`'den
  türetilmez**, alanlar açıkça yazılır; `money`/`gems` **yoktur**.
- **Frontend:** `apps/web/src/app/profile/[username]/page.tsx`.
- **Database:** `players`, `horses` (özet sayılar).
- **API:** `GET /api/v1/players/profile/:username`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/social-profile.e2e-spec.ts` (+ `@Public()` para
  sızdırmazlık iddiası).
- **Üretime hazır:** Evet.
- **Eksik:** Arkadaş listesi (`SocialPlayerView`) ve sıralama tablosu
  (`LeaderboardRowView`) **`username` taşımaz** — bu yüzden bugün yalnızca
  oyuncunun **kendi** profiline gidilebilir (üst bardaki avatar).
- **Risk:** Orta — profil ekranı teknik olarak hazır ama sosyal yüzeylerden
  beslenemiyor. "Başkasının profiline bak" akışı yarım.
- **Sıradaki adım:** İki görünüme `username` ekle (tek alan, düşük risk).
- **Kaynak:** `apps/api/src/application/use-cases/get-player-profile.use-case.ts`,
  `apps/web/src/app/profile/[username]/page.tsx`.

---

### 4. Bakiye ve para birimi modeli (money/gems)

- **Durum:** `IMPLEMENTED`
- **Backend:** `players.money` / `players.gems`; tüm okuma uçları
  `Number(...)` ile dönüştürür (`pg` BIGINT'i metin döner).
- **Frontend:** `lib/currency.ts` (`formatCost`, `hasEnoughFunds`) — tek
  gösterim kaynağı.
- **Database:** `players`, `economy_transactions` (`currency` kolonu).
- **API:** tüm bakiye taşıyan uçlar.
- **WebSocket:** ilgisiz.
- **Tests:** `test/database/`, `test/api/wallet*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** `Number()` unutulursa yanıt `"1250"` olur ve istemci `+`yı
  birleştirme sanır — **hiçbir yerde hata üretmez**. `postgres-admin.repository.ts`
  bunu `toNumber()`da toplar; yeni okuma ucu yazarken `typeof` iddiası şart.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/infrastructure/*/postgres-*.repository.ts`.

---

### 5. At listesi ve detay

- **Durum:** `IMPLEMENTED`
- **Backend:** `GET /horses?ownerId=` (`assertSelf`), `GET /horses/:id`
  (`@Public()`, `toPublicHorse` ile gizli stat süzülür).
- **Frontend:** `/stable` sayfası.
- **Database:** `horses`.
- **API:** `/api/v1/horses`, `/api/v1/horses/:id`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/horse.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** `toPublicHorse` mapper'ı atlanırsa gizli statlar sızar
  (AUDIT Bulgu S4 bu yüzden kapatıldı).
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/horse/horse.controller.ts`.

---

### 6. At istatistikleri (8 stat)

- **Durum:** `IMPLEMENTED`
- **Backend:** `horse_stats`; motora `pickStartingStats` ile **dondurulmuş
  snapshot**'tan girer.
- **Frontend:** `/stable` detay paneli.
- **Database:** `horse_stats`, `race_entries.horse_snapshot` (migration 0042).
- **API:** at okuma uçları.
- **WebSocket:** `race.telemetry` içinde `startingStats` (8 sayı).
- **Tests:** `test/domain/race/`, `test/api/race*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Canlı `horse_stats` okunsaydı, sonucu **açıklayan** sayılar ile
  sonucu **üreten** sayılar ayrışırdı ve bu hiçbir yerde hata üretmezdi.
  Snapshot yolu bu yüzden zorunludur.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/domain/race/*`.

---

### 7. Zemin ve mesafe istatistikleri

- **Durum:** `IMPLEMENTED`
- **Backend:** `horse_surface_stats`, `horse_distance_stats`.
- **Frontend:** `/stable`.
- **Database:** iki tablo.
- **API:** at okuma uçları.
- **WebSocket:** dolaylı (motor çarpanları).
- **Tests:** `test/domain/race/`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Düşük.
- **Sıradaki adım:** —
- **Kaynak:** `database/migrations/`.

---

### 8. At sağlığı (6 boyut)

- **Durum:** `PARTIAL`
- **Backend:** `horse_health` — `health`, `fitness`, `fatigue`, `energy`,
  `form`, `morale`.
- **Frontend:** `/stable`, `/care`.
- **Database:** `horse_health`.
- **API:** at okuma + bakım uçları.
- **WebSocket:** `race.telemetry` içinde `fatigueLevel` (migration 0029).
- **Tests:** `test/domain/care/`, `test/api/care*.e2e-spec.ts`.
- **Üretime hazır:** Koşullu.
- **Eksik:** Motorun tükettiği boyutlar ile **tümü** birebir örtüşmez;
  bazı boyutlar yalnızca bakım/antrenman girdisi olarak yaşar.
- **Risk:** Düşük — ama "sağlık 6 boyut" iddiasını motora bağlamak isteyen
  bir dilim açılırsa önce hangi boyutun okunduğu ölçülmelidir.
- **Sıradaki adım:** Motorda okunan boyutların envanterini çıkar; okunmayan
  varsa ya bağla ya "gösterim amaçlı" diye belgele.
- **Kaynak:** `database/migrations/*horse_health*`, `domain/care/`.

---

### 9. Antrenman

- **Durum:** `IMPLEMENTED`
- **Backend:** `POST /horses/:id/training` → `applyTraining` (para/mutasyon
  yolu değil; `statGain` meşru şekilde 0 olabilir).
- **Frontend:** `/training`.
- **Database:** `training_sessions`, `horse_stats`.
- **API:** `/api/v1/horses/:id/training`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/training*.e2e-spec.ts`, `test/domain/training/`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Dondurulmuş snapshot testi eğitim API'siyle yazılmaz** —
  `statGain` 0 olabilir ve iddia boş kalır. Test SQL ile stat bump eder ve
  ÖNCE artışın gerçekten olduğunu iddia eder.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/training/`.

---

### 10. Bakım (care)

- **Durum:** `IMPLEMENTED`
- **Backend:** `CareController` — tımar/yem/su/temizlik/vet/farrier/dinlenme.
- **Frontend:** `/care`.
- **Database:** `horse_care_log`, `horse_health`.
- **API:** `/api/v1/care/*`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/care*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Düşük.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/care/care.controller.ts`.

---

### 11. Beslenme ve yem envanteri

- **Durum:** `IMPLEMENTED`
- **Backend:** `FeedController`; `warehouse` tesisi yem maliyetini düşürür
  (`FarmSummaryView` üzerinden).
- **Frontend:** `/care` + `/farm`.
- **Database:** `player_feed_inventory`, `horse_feed_log`.
- **API:** `/api/v1/feed/*`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/feed*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Düşük.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/feed/`.

---

### 12. Ekipman

- **Durum:** `IMPLEMENTED`
- **Backend:** `EquipmentController`.
- **Frontend:** `/equipment`.
- **Database:** `horse_equipment`.
- **API:** `/api/v1/equipment/*`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/equipment*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** Ekipmanın **motora** etkisi ölçülmedi (brief §42 bunu
  istemiyor; PHASE 6 jokey/kişilik/taktik ile sınırlıydı).
- **Risk:** Düşük — ama "ekipman takılı ama sonuca etkisi yok" durumu
  oyuncuya görünmez. Bağlanacaksa aynı PHASE 6 disipliniyle (gizli bonus
  yok, ölçüm harness'ta) yapılmalı.
- **Sıradaki adım:** Ayrı bir dilim: ekipman → motor çarpanı + ölçüm.
- **Kaynak:** `apps/api/src/api/equipment/equipment.controller.ts`.

---

### 13. At pazarı (market)

- **Durum:** `IMPLEMENTED`
- **Backend:** `MarketController` — listeleme, satın alma, satıştan çekme;
  `horseId` gövde alanı controller'da `isUUID()` ile doğrulanır.
- **Frontend:** `/market`.
- **Database:** `market_listings` (+ para yolu).
- **API:** `/api/v1/market/*`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/market*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** `sellerId`/`horseId` gibi gövde-UUID alanları `@IsUUID()`a
  güvenemez (esbuild DTO doğrulamasını atlar) — controller'daki `isUUID()`
  kapısı şarttır. **30.09.2026:** açık (`scheduled`/`locking`) bir lobi
  yarışına kayıtlı at ilana çıkamaz ve satın alınamaz
  (`HORSE_IN_ACTIVE_RACE`); asıl kapı satın alma transaction'ıdır (at satırı
  kilitliyken). Önceden satılan at eski sahibi adına koşuyor, ödülü satıcı
  alıyordu.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/market/market.controller.ts`.

---

### 14. At değerleme (market-value)

- **Durum:** `IMPLEMENTED`
- **Backend:** `GET /horses/:id/market-value` — `@Public()`, türetilmiş
  değer; kendi at-var-mı kontrolünü kendisi yapar.
- **Frontend:** `/market`, `/stable`.
- **Database:** `horses` + `horse_stats`.
- **API:** `GET /api/v1/horses/:id/market-value`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/horse-market-value.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** `@Public()` olduğu için yanıtına giren her alan herkese açıktır.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/race/horse-market-value.controller.ts`.

---

### 15. Soy ağacı (pedigree) okuma

- **Durum:** `IMPLEMENTED`
- **Backend:** `GET /horses/:id/pedigree` — `@Public()`, gizli stat yok.
- **Frontend:** `PedigreeTree.tsx` → `apps/web/src/app/stable/page.tsx:365`
  üzerinden **GERÇEKTEN BAĞLI**.
- **Database:** `pedigrees`.
- **API:** `GET /api/v1/horses/:id/pedigree`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/pedigree*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Düşük.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/horse/horse.controller.ts`,
  `apps/web/src/app/stable/page.tsx`.

---

### 16. Yetiştiricilik (breeding)

- **Durum:** `IMPLEMENTED`
- **Backend:** `BreedingController` — `POST /players/:id/breeding`; tay
  doğumu pedigriye kaydolur. `breeding_center` tesisi risk çarpanını düşürür.
- **Frontend:** **VAR (29.09.2026).** `apps/web/src/features/breeding/
  BreedingPanel.tsx` — `/stable` sayfasında, at kartlarının üstünde.
  Kısrak + aygır + tay adı toplar; aygır listesi kendi aygırlarıdır, ayrıca
  başka bir oyuncunun aygırı için UUID girilebilir (`GET /horses/:id` zaten
  `@Public()`tir — **yeni bir "aygır pazarı" ucu İCAT EDİLMEDİ**). Sonuç
  paneli tayı, `fee`yi, `inbreedingDetected` uyarısını ve
  `birthHealthRisk`i **yanıttan** gösterir; istemci hiçbir tutar HESAPLAMAZ.
- **Database:** `breeding_pairs`, `pedigrees`, `horses`.
- **API:** `/api/v1/players/:id/breeding`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/breeding.e2e-spec.ts`, `test/domain/genetics/`,
  `apps/web/test/lib/api-client.spec.ts` (URL/gövde + `Idempotency-Key`),
  `apps/web/test/features/breeding/BreedingPanel.spec.tsx` (anahtar yaşam
  döngüsü + sunucu otoritesi).
- **Üretime hazır:** Evet.
- **Eksik:** Yok. (`inbreedingDetected` artık kullanıcıya gösteriliyor.)
- **Risk:** Düşük — para yolu sunucuda, `FOR UPDATE` + aynı transaction'da
  defter çiftiyle; arayüz yalnızca girdi toplar.
- **Sıradaki adım:** —
- **İstemcide iki kural (bozulmamalı):** (1) `Idempotency-Key`
  **başarısızlıkta YAŞAR** (`wallet/page.tsx` deseni) — burada zarar
  "ikinci bir TAY"dır, `grandstand`'ın "her basışta yeni anahtar" kararından
  bilerek ayrılır. (2) Aygır seçimi değişince **bekleyen anahtar
  bırakılır**; bırakılmazsa oyuncu yeni bir çiftleştirme yaptığını sanırken
  sunucu ilk isteğin saklanan yanıtını döner ve **hiçbir şey olmaz**.
- **Kaynak:** `apps/api/src/api/breeding/breeding.controller.ts`,
  `apps/api/src/domain/genetics/`, `apps/web/src/features/breeding/`.

---

### 17. Genetik domain

- **Durum:** `PARTIAL`
- **Backend:** `domain/genetics/` — saf TS, birim testli.
- **Frontend:** yok.
- **Database:** genler `horses`/`pedigrees` içinde.
- **API:** dolaylı (breeding).
- **WebSocket:** ilgisiz.
- **Tests:** `test/domain/genetics/` — kapsamlı.
- **Üretime hazır:** Koşullu.
- **Eksik:** `calculateJockeyHorseCompatibility` ve
  `calculateTemperamentComponent` **çağıransız**; gen ifadesi oyuncuya
  hiçbir yerde gösterilmiyor.
- **Risk:** Orta — genetik, oyunun en pahalı sistemlerinden biri olarak
  yazıldı ama oyuncuya görünen yüzeyi yok.
- **Sıradaki adım:** PHASE 6 disipliniyle: her genetik bileşen için ya bir
  çağıran ya da "gösterim amaçlı" etiketi.
- **Kaynak:** `apps/api/src/domain/genetics/`.

---

### 18. Jokey vitrini, kiralama ve serbest bırakma

- **Durum:** `IMPLEMENTED` (29.09.2026)
- **Backend:** `JockeyController` — **DÖRT** uç: liste (`GET /jockeys`),
  oyuncunun jokeyi (`GET /players/:id/jockey`), kiralama
  (`POST /jockeys/:jockeyId/hire`, PARA YOLU) ve **serbest bırakma**
  (`POST /jockeys/:jockeyId/release`).
- **Frontend:** `apps/web/src/features/jockey/JockeyPanel.tsx` →
  `apps/web/src/app/stable/page.tsx`. Vitrin + "Jokeyin" kartı + iki düğme.
- **Database:** `jockeys`, `race_entries.jockey_id`. Bırakma satırı
  **SİLMEZ**, `owner_id`yi `NULL`a çeker (geçmiş yarışların `jockey_id`si
  o satıra işaret eder).
- **API:** `/api/v1/jockeys/*`, `/api/v1/players/:id/jockey`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/jockey.e2e-spec.ts` (kiralama + **8 serbest bırakma
  testi**) · `apps/web/test/features/jockey/JockeyPanel.spec.tsx` ·
  `apps/web/test/lib/api-client.spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** Yok.
- **Risk:** Düşük. Serbest bırakma **PARA YOLU DEĞİLDİR** ve bu bilinçlidir:
  kiralama bedeli depozito değil kiralama ücretidir, iade edilmez — iade
  edilseydi `kirala → bırak` döngüsü kiralamayı bedava yapardı. Ekran bunu
  düğmenin üstünde AÇIKÇA yazar ve test bunu kilitler (iade vaat eden bir
  metin testi düşürür). `JOCKEY_NOT_OWNED` **yön sızdırmaz**: "sahipsiz" ile
  "başkasının" TEK kod ve TEK mesajla döner, yoksa kimlik deneyen biri
  "bu jokey birinin mi" sorusunu yoklayabilirdi (`PLAYER_BLOCKED` ile aynı
  gerekçe).
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/jockey/jockey.controller.ts`,
  `apps/api/src/infrastructure/jockey/postgres-jockey.repository.ts`,
  `apps/web/src/features/jockey/JockeyPanel.tsx`.

---

### 19. Jokey → motor etkisi

- **Durum:** `IMPLEMENTED` (PHASE 6.2, `7d9f814`)
- **Backend:** `calculateJockeySkillComposite` + uyum bileşeni
  `race-engine` girdisine eklenir; `RaceSettlementPlace.jockeyId` taşınır.
- **Frontend:** `RaceHud`/`RaceViewer` jokey adını gösterir.
- **Database:** `race_entries.jockey_id`.
- **API:** kesinleştirme yanıtı.
- **WebSocket:** `race.roster`.
- **Tests:** `test/domain/race/` (jokey etkisi ölçülür), CI yeşil.
- **Üretime hazır:** Evet.
- **Eksik:** `gatePosition` hâlâ **okunmuyor**.
- **Risk:** Düşük. **Gizli bonus yoktur**: etki ölçülür ve testle
  kilitlenir (brief'in "AI'ye gizli performans bonusu verme" kuralı).
- **Sıradaki adım:** `gatePosition`ı motora bağla ya da alanı kaldır.
- **Kaynak:** `apps/api/src/domain/race/race-engine.ts`,
  `apps/api/src/domain/jockey/`.

---

### 20. Pratik yarış

- **Durum:** `IMPLEMENTED`
- **Backend:** `POST /races/practice` → `insertRaceRow` + motor.
- **Frontend:** `/races/demo`.
- **Database:** `races`, `race_entries`, `race_entry_segments`.
- **API:** `/api/v1/races/practice`.
- **WebSocket:** `race.*` olayları.
- **Tests:** `test/api/race.e2e-spec.ts` (24 test).
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Yaşandı ve kapatıldı (29.09.2026):** `insertRaceRow`ın SQL'i
  25 sütuna 24 ifade veriyordu (`tribune_fee`/`spectator_capacity`
  eklenirken kuyruk +1 kaydırılmıştı) ve pratik/PvP yolları 500 veriyordu.
  `tsc` SQL'i görmez; tek görünürlüğü e2e'ydi. Düzeltildi ve doğrulandı
  (68 e2e testi geçti).
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/infrastructure/race/postgres-race.repository.ts`.

---

### 21. PvP matchmaking

- **Durum:** `IMPLEMENTED` (30.09.2026)
- **Backend:** `MatchmakingController` — kuyruğa girme ve **senkron**
  eşleştirme (`matchmaking_tickets`, `pvp_matches`).
- **Frontend:** `/online`.
- **Database:** `matchmaking_tickets`, `pvp_matches`.
- **API:** `/api/v1/matchmaking/*`.
- **WebSocket:** ilgisiz (eşleşme HTTP yanıtıyla döner).
- **Tests:** `test/api/matchmaking.e2e-spec.ts` (15 test).
- **Üretime hazır:** Koşullu.
- **Eksik:** — (30.09.2026: `MatchmakingScheduler` kuyruğu periyodik
  tarar — `JoinMatchmakingQueueUseCase.scanQueue`, config
  `online.matchmaking.queueScan`; atı satılmış/sakatlanmış bilet düşürülür,
  iki oyuncuya da `lobby.update`. Test: `matchmaking-scan.e2e-spec.ts`,
  `matchmaking-scheduler.spec.ts`.)
- **Risk:** Gerçek oyuncu sayısı azken PvP yine boş dönebilir — ama artık
  sebebi eksik kod değil, rakip yokluğudur.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/matchmaking/`.

---

### 22. Lobi yarışı oluşturma

- **Durum:** `IMPLEMENTED`
- **Backend:** `RaceLobbyController` — oluşturma + listeleme
  (`createLobbyRace`, `ListLobbyRacesUseCase`).
- **Frontend:** **30.09.2026'dan beri gerçekten** `/races` →
  `LobbyPanel` ("Yarış Aç" formu, seçenekler `race-lobby.config.json`dan).
  Bu satır daha önce de `/races` diyordu ama o sayfa yalnızca pratik yarış
  koşuyordu — **yanlıştı**.
- **Database:** `races` (`race_type='paid'`, `start_time`, `tribune_fee`,
  `spectator_capacity`).
- **API:** `/api/v1/races` (lobi).
- **WebSocket:** `lobby.update`.
- **Tests:** `test/api/race-lobby*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** Yarış takvimi (önceden planlanmış seri) yok.
- **Risk:** Düşük.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/race/race-lobby.controller.ts`.

---

### 23. Lobi katılma / hazır / ayrılma

- **Durum:** `IMPLEMENTED` (30.09.2026)
- **Backend:** katılma (`POST /races/:id/join`), hazır (`/ready`), ayrılma
  (`/leave`). Katılımda at satırı `FOR UPDATE`; pazardaki ya da başka açık
  yarıştaki at katılamaz. **READY ŞARTI:** başlangıçta `ready` demeyen
  katılım iptal edilir ve ücreti İADE edilir (`dropUnreadyLobbyEntries`);
  kimse hazır değilse yarış iptal olur.
- **Frontend:** `LobbyPanel` — "Katıl" / "Hazırım" / "Hazır değilim" /
  "Ayrıl (ücret iade)". Düğmeler yalnızca `GET /races` satırındaki
  `myEntry`den türer. (Bu satır eskiden "katılma bağlı" diyordu —
  **yanlıştı**, hiçbir istemci `/join`u çağırmıyordu.)
- **Database:** `race_entries` (ayrılan/düşürülen satır `cancelled`
  işaretlenir, **silinmez**).
- **API:** `/api/v1/races/:id/join`, `/ready`, `/leave`; `GET /races` →
  `RaceLobbyListItem.myEntry`.
- **WebSocket:** `race.roster`, `lobby.update`.
- **Tests:** `race-join`, `race-ready`, `race-leave`, `race-ready-gate`,
  `race-horse-lock`, `race-lobby-list` e2e; web `LobbyPanel.spec.tsx`,
  `lobby-logic.spec.ts`, `api-client.spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Lobi yarışını koşturan her yeni e2e katılımdan sonra `ready`
  DEMELİDİR, yoksa katılım kilitte düşer (7 dosya bu yüzden uyarlandı).
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/infrastructure/race/postgres-race.repository.ts`,
  `apps/web/src/features/race-lobby/`.

---

### 24. Yarış yaşam döngüsü ve zamanlayıcı

- **Durum:** `IMPLEMENTED` (PHASE 1 + §13.24)
- **Backend:** `domain/race/race-lifecycle.ts` (`Record<RaceStatus, ...>`
  tam kapsamlı) + `RaceLockScheduler` — projenin **ilk** zamanlayıcısı.
- **Frontend:** durum etiketleri `/races`, `/grandstand`.
- **Database:** `races.status` CHECK `races_status_valid`; migration 0042.
- **API:** kesinleştirme/iptal uçları.
- **WebSocket:** `lobby.update`, `race.*`.
- **Tests:** `test/domain/race/race-lifecycle.spec.ts` (migration dosyasını
  **okuyarak** karşılaştırır), `test/api/race-lock*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** `in_progress` ölüdür (yazan kod yok).
- **Risk:** `locking` durumunda **üç kapı aynı anda açık olmalı**
  (kesinleştir / iptal et / kilitlen). Biri kapanırsa **kalıcı para kilidi**
  doğar ve hiçbir yerde hata üretmez. Zamanlayıcı `NODE_ENV=test` ve
  `lockScheduler.enabled=false` iken kapalıdır.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/domain/race/race-lifecycle.ts`,
  `apps/api/src/application/use-cases/lock-race*.ts`.

---

### 25. Saha kompozisyonu (fieldSize + botlar)

- **Durum:** `IMPLEMENTED` (§13.25)
- **Backend:** `domain/race/field-composition.ts` →
  `resolveFieldComposition`; `settle-race.use-case.ts` bot sayısını **kendi
  hesaplamaz**, bu saf fonksiyonu tüketir. `fieldSizes`
  `config/race-lobby.config.json`dan gelir.
- **Frontend:** katılımcı listesi `RaceRosterEntrant` üzerinden.
- **Database:** `race_entries`, `horse_snapshot`.
- **API:** kesinleştirme yanıtı (`RaceSettlementPlace` — `isBot` **yok**,
  `participantType: 'human' | 'ai'` **var**).
- **WebSocket:** `race.roster`.
- **Tests:** `test/domain/race/field-composition.spec.ts` — veritabanısız
  tam matris.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Bot payı yanar** (bilinçli): botların `player_id`'si yoktur,
  bota düşen ödül kimseye ödenmez ve havuzda kalır. Sonuç: gerçek oyuncu
  azken yarış oyuncu için **kayıptır**. `aiFillEnabled=false` üretimde
  oyuncu aleyhinedir.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/domain/race/field-composition.ts`.

---

### 26. Race Engine (deterministik simülasyon)

- **Durum:** `IMPLEMENTED`
- **Backend:** `domain/race/race-engine.ts` — 8 segment, `deriveRandom`,
  framework'süz.
- **Frontend:** sonuç/telemetri gösterimi (`RaceHud`, `RaceScene3D`).
- **Database:** `race_entry_segments`.
- **API:** kesinleştirme yanıtı.
- **WebSocket:** `race.telemetry` (10 Hz HUD throttle).
- **Tests:** `test/domain/race/` — determinizm + denge + sıra bütünlüğü.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Denetim "KEEP" işaretledi.** Değiştirilecekse determinizm
  testinin kırılmadığı **kanıtlanmalı**. Ölçülen risk: sürpriz payı dardır
  (bkz. §5 ve `RACE_BALANCE_REPORT.md`).
- **Sıradaki adım:** Denge düzeltmesi **bilerek yapılmadı** — config
  değişikliği dondurulmuş snapshot replay'ini bozar.
- **Kaynak:** `apps/api/src/domain/race/race-engine.ts`.

---

### 27. Taktik stili → motor

- **Durum:** `IMPLEMENTED` (PHASE 6.1, `1b12a86`)
- **Backend:** taktik stili motorda tempo dağılımını değiştirir.
- **Frontend:** stil seçimi yarış katılım yüzeyinde.
- **Database:** `race_entries` (stil alanı).
- **API:** katılım DTO'su.
- **WebSocket:** `race.telemetry` içinde `paceScore`.
- **Tests:** `test/domain/race/` — hiçbir stil ölü/baskın değil iddiası.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Düşük — gizli bonus yok, ölçüm CI'da kilitli.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/domain/race/`.

---

### 28. Kişilik/mizaç → motor

- **Durum:** `IMPLEMENTED` (PHASE 6.3, `7703b5e`; CI run #226 yeşil)
- **Backend:** mizaç bileşeni motor girdisine eklenir.
- **Frontend:** at detayında gösterim.
- **Database:** `horse_stats` / at kaydı.
- **API:** at okuma + kesinleştirme.
- **WebSocket:** `race.telemetry`.
- **Tests:** `test/domain/race/`.
- **Üretime hazır:** Evet.
- **Eksik:** `calculateTemperamentComponent`'ın üretimdeki çağıranı
  doğrulandı; ancak jokey uyum bileşeni hâlâ çağıransız.
- **Risk:** Düşük.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/domain/race/`.

---

### 29. Kesinleştirme ve ödül dağıtımı

- **Durum:** `IMPLEMENTED` (§13.14)
- **Backend:** `POST /races/:id/settle` — yarışı koşar, `top5` paylarıyla
  ödül dağıtır, `races.status='finished'` yazar. Uç bir "crank"tir;
  **30.09.2026'dan beri zamanlayıcı da** kilidin ardından `locking`
  yarışları aynı use-case'le kesinleştirir (`SettleDueRacesUseCase`).
  Önceden kilitlenen yarışı kesinleştiren hiçbir iş yoktu.
- **Frontend:** kesinleşmeyi istemci TETİKLEMEZ (zamanlayıcı yapar); sonuç
  `race_finished`/`prize_won` bildirimi ve `/replays/[raceId]` ile görülür.
  (Bu satır eskiden "`/grandstand` + `/races`" diyordu — hiçbiri
  `/settle`u çağırmıyordu.)
- **Database:** `races`, `race_entries`, `economy_transactions`
  (`race_prize`), `notifications` (`race_finished`, `prize_won`).
- **API:** `POST /api/v1/races/:id/settle`.
- **WebSocket:** `race.finished`.
- **Tests:** `test/api/race-settlement.e2e-spec.ts`,
  `test/api/race-auto-settle.e2e-spec.ts` (zamanlayıcı + çift ödeme yok).
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Tekrar koruması `Idempotency-Key` **değil**, `scheduled →
  finished` geçişinin kendisidir (ikinci çağrı 409 `RACE_NOT_SETTLEABLE`).
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/application/use-cases/settle-race.use-case.ts`.

---

### 30. Yarış iptali ve iade

- **Durum:** `IMPLEMENTED` (§13.19)
- **Backend:** `POST /admin/races/:raceId/cancel` — iade + aynı
  transaction'da defter + denetim kaydı.
- **Frontend:** `/admin` → yarışlar sekmesi → "İptal" (bkz. #47).
- **Database:** `races.status='cancelled'`, `economy_transactions`,
  `admin_audit_log`.
- **API:** `POST /api/v1/admin/races/:raceId/cancel`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/race-cancel.spec.ts` (migration'ı okuyarak `paused`
  yokluğunu da kanıtlar).
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Üç kural bozulmamalı:** (1) iade tutarı **defterden** okunur
  (`races.entry_fee` sabitinden değil — indirimli giren oyuncuya yanlış
  tutar ödenmesin); (2) durum kuralı `FOR UPDATE` **altında** koşar (yoksa
  çift iade mümkün olur ve hata üretmez); (3) katılım satırı **silinmez**,
  `cancelled` işaretlenir. Ayrıca `finished → cancelled` **yasaktır**:
  koşmuş yarışta iade, kazanana ödenen `race_prize` değil ödenen giriş
  ücreti olurdu = makul görünen **yanlış tutar**.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/application/use-cases/cancel-race.use-case.ts`.

---

### 31. Yarış dengesi ölçümü

- **Durum:** `IMPLEMENTED` (§13.28, PHASE 5)
- **Backend:** `test/domain/race/race-balance-harness.ts` — ölçüm mantığı
  **tek yerde** durur, iki tüketicisi vardır: `race-balance.spec.ts` (CI
  eşikleri) ve `tools/race-balance-report.ts` (rapor).
- **Frontend:** ilgisiz.
- **Database:** ilgisiz (saf motor ölçümü).
- **API:** ilgisiz.
- **WebSocket:** ilgisiz.
- **Tests:** 265.125 simülasyon (5 saha boyutu × 5 koşum × 10.000), CI'da
  kilitli.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Ölçülen kötü değer eşik yapılmaz.** `race-balance.spec.ts`
  "favori %99.8 kazanıyor" gibi değerleri **kilitlemez** — bunlar iyi durum
  değildir ve düzeltilince CI kırmızıya dönmemelidir. Kilitlenen şey
  kırılmaması gerekenlerdir.
- **Sıradaki adım:** Yeni bir denge sorusu sorulacaksa **harness'a ekle**;
  ayrı ölçüm kodu yazmak rapor ile CI'ı ayrıştırır.
- **Kaynak:** `apps/api/test/domain/race/race-balance-harness.ts`,
  `docs/RACE_BALANCE_REPORT.md`.

---

### 32. Ekonomi defteri (`economy_transactions`)

- **Durum:** `IMPLEMENTED`
- **Backend:** Tüm para yolları aynı transaction'da defter satırı yazar.
- **Frontend:** `/wallet` geçmiş listesi (`LEDGER_TYPE_LABELS`).
- **Database:** `economy_transactions` (`type` **serbest TEXT** — yeni tür
  migration gerektirmez; yalnızca TS union + etiket haritası).
- **API:** cüzdan geçmişi.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/wallet*.e2e-spec.ts`, `ledger-labels.spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** **Platform payı ve bot artığı için hesap satırı yoktur** —
  `raceRake` ve bota düşen ödül oyuncu ekonomisinden çıkar, başka bir
  hesaba girmez; mutabakatta `−(platformPayı + botArtığı)` olarak görünür.
- **Risk:** **Yön metne gömülmez** — etiketler yönsüzdür ve içlerinde
  `+`/`−` geçmez; yönün tek kaynağı sunucunun işaretli `amount`'udur.
  İkinci bir yön kaynağı çelişki üretir.
- **Sıradaki adım:** "Kesilen para nerede" sorusu için uydurma bir "ev
  hesabı" **açma** — bakiyesi olmayan bir satır uydurmak olurdu.
- **Kaynak:** `packages/shared-types/src/ledger.ts`,
  `apps/web/src/features/wallet/`.

---

### 33. Cüzdan (yatırma / günlük ödül / geçmiş)

- **Durum:** `IMPLEMENTED` (§13.23, PHASE 4; sayfalama 30.09.2026)
- **Backend:** `mock_deposit` (kill switch'li), günlük ödül, geçmiş.
- **Frontend:** `/wallet` — sınırlar `loadEconomyConfig()`ten okunur,
  koda gömülmez; `mockDeposit.enabled === false` ise form **gösterilmez**.
- **Database:** `economy_transactions`, `idempotency_keys`.
- **API:** `/api/v1/economy/*`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/wallet*.e2e-spec.ts`, `ledger-labels.spec.ts`.
- **Üretime hazır:** Koşullu.
- **Eksik:** — (30.09.2026: `?before=` imleci + `nextCursor`, `/wallet`ta
  "Daha fazla göster"; bozuk imleç 400, başkasının satırı boş sayfa.)
- **Risk:** **Idempotency-Key para yolunda başarısızlıkta ATILMAZ** —
  `/wallet` anahtarı `useRef`'te tutar (zarar: ikinci bir *para girişi*),
  `grandstand` ise her basışta yeni anahtar üretir (zarar: ikinci bir
  *bilet*). İkisi bilerek farklıdır.
- **Sıradaki adım:** —
- **Kaynak:** `apps/web/src/app/wallet/page.tsx`,
  `apps/api/src/api/economy/`.

---

### 34. Idempotency

- **Durum:** `IMPLEMENTED`
- **Backend:** `IdempotencyInterceptor` + `@IdempotencyScope(...)`;
  `idempotency_keys` tablosu.
- **Frontend:** her para yolu `Idempotency-Key` üretir.
- **Database:** `idempotency_keys` (`scope_id`, `idempotency_key`).
- **API:** tüm para/mutasyon yolları.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/idempotency*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Kapsam çakışması yaşandı ve kapatıldı (PHASE 7):** iki rota
  `(scope_id, idempotency_key)` çiftini paylaşıyordu; `scope_id` artık
  `ControllerClass.handlerMethod:` ön ekiyle yazılır. Yeni bir para yolu
  eklerken soru: *"bu isteğin tekrarı neyi iki kez yapar?"*
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/idempotency/`.

---

### 35. Ödül havuzu ve çarpan

- **Durum:** `IMPLEMENTED` (§13.10, PHASE 5)
- **Backend:** `computeRacePool(tier)` — **pratik** model: `entryFee ×
  fieldSize`, botlar ödemiş **sayılır**.
- **Frontend:** ödül havuzu göstergesi.
- **Database:** `races.prize_pool`.
- **API:** yarış okuma uçları.
- **WebSocket:** `lobby.update`.
- **Tests:** `test/domain/race/`, `docs/ECONOMY.md` §4.1.1.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **İki ayrı havuz modeli yan yana yaşar — karıştırma.** Pratik
  yarış yukarıdaki modeldir; **lobi** yarışında havuz = `entryFee × GERÇEK
  oyuncu sayısı` (botlar hiçbir şey ödemez). `docs/ECONOMY.md` §4.1.1'in
  tablosu **pratik** modeli anlatır; lobi için ona bakmak yanıltıcıdır.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/domain/economy/`.

---

### 36. Tribün bileti ve kontenjan

- **Durum:** `IMPLEMENTED` (§13.32, PHASE 7)
- **Backend:** `POST /races/:id/tickets` — fiyat **`races.tribune_fee`**tir
  (tek kaynak; `PurchaseTicketInput` fiyat **taşımaz**, kilitli satırdan
  okunur). Kontenjan `purchaseTicket` transaction'ının **içinde** zorlanır:
  önce `races` FOR UPDATE, sonra bilet sayımı, sonra
  `assertTribuneHasRoom` → 409 `RACE_TRIBUNE_FULL`.
- **Frontend:** `/grandstand` — ücretsiz tribünde "koltuk kaldı"
  **gösterilmez**, düğme gerekçesiyle kapatılır.
- **Database:** `race_tickets` (migration 0032,
  `UNIQUE (race_id, player_id)`), `races.tribune_fee`/`spectator_capacity`
  (migration 0036).
- **API:** `/api/v1/races/:id/tickets`, `/api/v1/players/:id/tickets`.
- **WebSocket:** `race.spectators`.
- **Tests:** `test/api/grandstand.e2e-spec.ts` (23 test).
- **Üretime hazır:** Evet.
- **Eksik:** Koltuk seçimi yok; yarış başına elle fiyatlandırma ucu yok.
- **Risk:** `tribune_fee = 0` ⇒ **ücretsiz tribün**: bilet gerekmez,
  `POST /tickets` 409 `RACE_TRIBUNE_FREE`, kontenjan **zorlanmaz**.
  `grandstand.config.json → defaultTribuneFee` yalnızca **oluşturma anındaki
  varsayılandır**, satın alma fiyatı değildir.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/application/use-cases/purchase-ticket.use-case.ts`.

---

### 37. Tribün iadesi

- **Durum:** `IMPLEMENTED` (30.09.2026)
- **Backend:** `refundRaceTicket` — bilet satırı `FOR UPDATE`, **izlenmişse
  409 `TICKET_ALREADY_USED`**; değilse `DELETE ... RETURNING` + pozitif
  `grandstand_ticket_refund` defter satırı, tek transaction.
- **Frontend:** `/grandstand` — izlenmemiş bilette "İade Et", izlenmişte
  "İzlendi · iade yok" (`RaceTicketView.usedAt`).
- **Database:** `race_tickets.first_viewed_at` (migration 0044).
- **API:** `DELETE /api/v1/races/:id/tickets`, `GET /players/:id/tickets`.
- **WebSocket:** `race.subscribe` aynı kapıdan (`GetRaceTimelineUseCase`)
  geçer — canlı izleme de bileti "kullanılmış" yapar.
- **Tests:** `test/api/grandstand.e2e-spec.ts` (25).
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Bu satır eskiden "koşmuş yarışın bileti iade edilebiliyor, iade
  penceresi config'e yazılmalı" diyordu — **teşhis yanlıştı**: bilet
  YALNIZCA bitmiş yarışa satılır (`assertRaceWatchable`), yani zaman
  penceresi bütün iadeleri kapatırdı. Asıl açık "izle + parayı geri al"dı.
  Katılımcının ya da ücretsiz tribünün izlemesi bileti işaretlemez.
  Migration'dan önce satılmış biletler `NULL` kalır (iade edilebilir) —
  geriye dönük "izlendi" bilgisi uydurulmadı.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/infrastructure/grandstand/postgres-grandstand.repository.ts`,
  `database/migrations/0044_add_race_ticket_first_viewed_at.up.sql`.

---

### 38. Canlı zaman çizelgesi ve replay

- **Durum:** `IMPLEMENTED`
- **Backend:** `GET /races/:id/timeline` — `GetRaceTimelineUseCase`
  **tek yetki kaynağıdır** (hem HTTP hem `race.subscribe` bunu kullanır).
- **Frontend:** `/races/[raceId]/watch` (canlı, socket), `/replays/[raceId]`
  (statik replay, socket yok).
- **Database:** `race_entry_segments`.
- **API:** `GET /api/v1/races/:id/timeline`.
- **WebSocket:** `race.telemetry`, `race.finished`.
- **Tests:** `test/api/race-timeline*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** `GET /races/:id` **yoktur ve uydurulmamalıdır**.
- **Risk:** Replay ekranı socket **açmaz** — oradan izleyen oyuncu
  `race:${raceId}` odasına **girmez**, yani izleyici sayılmaz. Canlı izleme
  için `/watch` sayfası bu yüzden ayrıca yazıldı.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/race/race-timeline.controller.ts`.

---

### 39. WebSocket yayın katmanı

- **Durum:** `IMPLEMENTED`
- **Backend:** `apps/api/src/api/realtime/race.gateway.ts`, namespace
  `/races`; odalar `race:${raceId}` ve `player:${playerId}`.
- **Frontend:** `LiveRaceViewer` (`race.subscribe`, `chat.message`).
- **Database:** ilgisiz.
- **API:** ilgisiz (gateway).
- **WebSocket:** 2 istemci→sunucu olay (`race.subscribe`, `chat.message`),
  12 sunucu→istemci olay (`race.error`, `chat.error`, `chat.history`,
  `race.roster`, `race.telemetry`, `race.finished`, `race.spectators`,
  `chat.message.received`, `lobby.update`, `notification.created`,
  `race.invite`, `race.invite.responded`).
- **Tests:** `test/api/race-chat.e2e-spec.ts` (gerçek `socket.io-client`).
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **`@WebSocketServer()` tuzağı** — `namespace` verilen bir
  gateway'de Nest bu alana io `Server`'ı değil **namespace'i** atar.
  `.to(oda).emit()` ikisinde de çalışır ama **oda sayımı çalışmaz**:
  doğrusu `server.adapter.rooms`'tur (yaşandı, §13.5). Ayrıca
  **`handleDisconnect` veritabanına DOKUNMAZ** — "kopan oyuncuyu temizle"
  mantığı eklemek, ödeme yapılmış bir yarıştan atı sessizce siler ve
  hiçbir yerde hata üretmez.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/realtime/race.gateway.ts`.

---

### 40. Yarış sohbeti ve izleyici sayısı

- **Durum:** `IMPLEMENTED` (§13.5)
- **Backend:** `chat.message` / `chat.history`; mesajlar `race_messages`e
  yazılır; `broadcastSpectatorCount` `server.adapter.rooms`ten sayar ve
  `await client.join(room)` **sonrasında** çağrılır.
- **Frontend:** `RaceChatPanel` — `RaceHud`'ın **kardeşi** (HUD `memo()`
  + 10 Hz throttle olduğu için sohbet durumu ona geçirilemez).
- **Database:** `race_messages`.
- **API:** ilgisiz (yalnızca WebSocket).
- **WebSocket:** `chat.message`, `chat.history`, `chat.message.received`,
  `chat.error`, `race.spectators`.
- **Tests:** `test/api/race-chat.e2e-spec.ts`,
  `apps/web/test/features/race-viewer/chat-history-merge.spec.ts` (7 test).
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** `chat.history` **her** `race.subscribe`ta aboneye özel
  yayınlanır (socket.io otomatik yeniden bağlanmaları dahil) → istemci
  `messageId` ile **tekilleştirmek zorundadır**. `mergeChatMessages` saf
  fonksiyonu bunu yapar ve geç gelen canlı mesajı **sona eklemez**,
  kronolojik yerine koyar.
- **Sıradaki adım:** —
- **Kaynak:** `apps/web/src/features/race-viewer/chat-history-merge.ts`,
  `config/chat.config.json`.

---

### 41. Bildirimler

- **Durum:** `IMPLEMENTED` (§13.21)
- **Backend:** 5 uç + 8 üretici türü — **sekizi de üretiliyor**:
  `race_invite`, `friend_request`, `friend_accepted`, `message_received`,
  `gift_received`, `race_finished`, `prize_won`, `race_starting`.
- **Frontend:** `/notifications` + gezinti şeridi.
- **Database:** `notifications`.
- **API:** `/api/v1/notifications/*`.
- **WebSocket:** `notification.created`.
- **Tests:** `test/api/notification*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **Bildirim, yazıldığı şeyle AYNI transaction'da yazılır.**
  Para yolunda bu pazarlık konusu değildir: ayrı bir `INSERT` olsaydı geri
  alınmış bir transferin haberi alıcıda kalırdı ve hiçbir yerde hata
  üretmezdi. Ayrıca **yeni bir üretici eklerken sayan mevcut e2e'leri
  kırarsın** — sayımı `type`e daralt.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/notification/`.

---

### 42. Yarış daveti

- **Durum:** `IMPLEMENTED` (§13.11)
- **Backend:** davet gönder/kabul et; `race_invite` bildirimi üretir.
- **Frontend:** `/notifications`, `/friends`.
- **Database:** `race_invites`, `notifications`.
- **API:** `/api/v1/social/*`.
- **WebSocket:** `race.invite`, `race.invite.responded`.
- **Tests:** `test/api/race-invite.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Düşük.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/social/social.controller.ts`.

---

### 43. Arkadaşlık

- **Durum:** `IMPLEMENTED` (29.09.2026 — `username` alanı eklendi)
- **Backend:** istek gönder/yanıtla/kaldır; mesaj ve hediye akışı bunun
  üstünde çalışır. `@RateLimit` kapsamı `phase16-hardening.spec.ts` ile
  kapalı küme olarak iddia edilir.
- **Frontend:** `/friends` (gelen kutusu + konuşma da burada). Her satırın
  adı artık `/profile/:username`e bağlıdır — `SocialPlayerView` **`username`
  taşır** ve `RowLabel` adresi TEK bir yerde kurar.
- **Database:** `friendships`.
- **API:** `/api/v1/players/:id/social`, `/api/v1/players/:id/friend-requests`,
  `/api/v1/players/:id/friends/:friendId`.
- **WebSocket:** ilgisiz (bildirim üzerinden).
- **Tests:** `test/api/social*.e2e-spec.ts`, `test/api/gift.e2e-spec.ts`,
  `test/security/phase16-hardening.spec.ts`.
- **Üretime hazır:** **Evet.**
- **Eksik:** Yok.
- **Risk:** `SocialPlayerView`i genişleten HER tip `username`i otomatik alır
  (arkadaş, istek, engel, hediye karşı tarafı) — bu bilinçlidir, ama
  `money`/`gems`in o tipe **girmemesi** kuralı aynen sürer; tam küme
  karşılaştırması `gift.e2e-spec.ts`te kilitlidir.
- **Kaynak:** `apps/api/src/api/social/social.controller.ts`.

---

### 44. Doğrudan mesajlar

- **Durum:** `IMPLEMENTED` (§13.13)
- **Backend:** mesaj gönder + geçmiş; `message_received` bildirimi.
- **Frontend:** `/friends` konuşma paneli.
- **Database:** `direct_messages`.
- **API:** `/api/v1/social/messages/*`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/social*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** `/messages` diye **ayrı bir sayfa bilerek yazılmadı** — aynı
  yüzeyi ikinci kez yapmak olurdu.
- **Risk:** `recipientId` gövde alanıdır; controller'daki `isUUID()` kapısı
  şarttır.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/social/`.

---

### 45. Hediye

- **Durum:** `IMPLEMENTED` (§13.13.1, para yolu)
- **Backend:** hediye gönder — `withTransaction` içinde `assertNoBlock`
  **tekrarlanır** (engelleme arkadaşlık satırını silmediği için dıştaki
  `areFriends` kapısı geçer).
- **Frontend:** `/friends`.
- **Database:** `gift_sends`, `economy_transactions`, `notifications`.
- **API:** `/api/v1/gifts/*`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/gift*.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** Engel kontrolü transaction **içinde** tekrarlanmazsa engellenen
  oyuncuya para gönderilebilir ve bu hiçbir yerde hata üretmez.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/application/use-cases/send-gift.use-case.ts`.

---

### 46. Blok ve şikâyet

- **Durum:** `IMPLEMENTED` (§13.16 backend + 29.09.2026 istemci)
- **Backend:** 4 uç — blokla, engeli kaldır, engel listesi, şikâyet.
- **Frontend:** **VAR (29.09.2026).** `/profile/:username` → "Güvenlik"
  paneli (Engelle / Engeli Kaldır + kategori seçimli şikâyet formu).
  `/friends` → "Engellenenler" bölümü (Engeli Kaldır). `apiClient`'a dört
  metot eklendi (`listBlockedPlayers`, `blockPlayer`, `unblockPlayer`,
  `reportPlayer`).
- **Database:** `player_blocks`, `player_reports`.
- **API:** `/api/v1/players/:id/blocks` (GET/POST),
  `/api/v1/players/:id/blocks/:blockedId` (DELETE),
  `/api/v1/players/:id/reports` (POST). **Controller prefix'i BOŞTUR** —
  yollar `players/:id/...` eksenindedir (bu satır eskiden
  `/api/v1/social/blocks` diyordu ve **yanlıştı**).
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/moderation.spec.ts` (sunucu),
  `test/api/body-uuid-shape.e2e-spec.ts` (gövde UUID kapısı),
  `apps/web/test/lib/api-client.spec.ts` (istemci sözleşmesi).
- **Üretime hazır:** **Evet.**
- **Eksik:** Yok.
- **Risk:** **Engelleme yönlüdür** — `(blocker_id, blocked_id)` sıralı
  çifttir; doğru soru "aralarında **herhangi bir yönde** engel var mı"dır
  (`isBlockedBetween`). Normalize etmeye kalkışmak engeli tek yönde delik
  bırakır. Ayrıca **`PLAYER_BLOCKED` yön sızdırmaz** — engelleyen de
  engellenen de aynı kodu alır; ikinci bir kod eklemek engellenene "seni
  engelledi" bilgisini verir.
- **⚠️ İSTEMCİDE İKİ TUZAK:** (1) **"Engelli mi" bilgisi profilden
  OKUNAMAZ** — `GET /players/profile/:username` `@Public()`'tir ve orada
  engel durumu yoktur; olsaydı "seni engelledi mi" sorusu herkese açık bir
  uçtan cevaplanırdı. Tek meşru kaynak kendi engel listesidir. (2)
  **Şikâyet kategorisi istemcide LİSTELENMEZ**, yalnızca etiketleri
  tutulur — kümenin tek kaynağı `domain/social/moderation.ts`tir.
- **Kaynak:** `apps/api/src/api/social/social.controller.ts`,
  `apps/web/src/app/profile/[username]/page.tsx`,
  `apps/web/src/app/friends/page.tsx`.

---

### 47. Yönetim uçları (7 uç)

- **Durum:** `IMPLEMENTED` (§13.17 + §13.18 + §13.19 backend; panel
  29.09.2026)
- **Backend:** `GET /admin/reports`, `PATCH /admin/reports/:reportId`,
  `GET /admin/audit-log`, `GET /admin/players`, `GET /admin/races`,
  `GET /admin/transactions`, `POST /admin/races/:raceId/cancel`.
- **Frontend:** **VAR** — `/admin`. Beş okuma sekmesi (şikâyet kuyruğu,
  oyuncular, yarışlar, işlemler, denetim günlüğü) + şikâyet durum
  güncelleme + yarış iptali. Yedi ucun YEDİSİ de tüketilir.
- **Database:** `player_reports`, `admin_audit_log`, `players.is_admin`.
- **API:** `/api/v1/admin/*` — **hiçbiri `@Public()` değildir ve
  olmayacaktır.**
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/admin.e2e-spec.ts`.
- **Üretime hazır:** **Evet.**
- **Eksik:** Yok. `Pause` **imkânsız** (`races.status`ta `paused`
  yok, `in_progress`u yazan kod yok); `Finish` başka uçta (§13.14);
  **`Chat Reports` yok ve uydurulmamalı** — sohbete bağlı şikâyet diye bir
  olgu projede yoktur (`player_reports` bir oyuncuya bağlıdır, mesaja değil).
  Bunların hiçbiri "eksik" DEĞİLDİR; sunucuda karşılığı olmayan bir şeyi
  uydurmamak bilinçli bir karardır.
- **Risk:** (1) **Yönetici rolü token'a gömülmez** — `players.is_admin`
  her istekte okunur, önbelleğe alınmaz; (2) **403 önce, 404 sonra** —
  yönetici olmayana `REPORT_NOT_FOUND` döndürmek kimlik denemeye izin verir;
  (3) **şikâyet durum geçişi kilidin içinde doğrulanır**; (4) **yönetim
  okuma uçları bakiye taşır** — `@Public()` eklemek bu ayrımı tek satırda
  yok eder; (5) `config/admin.config.json` bir **yetki kapısı değildir**,
  yalnızca liste boyutudur.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/admin/admin.controller.ts`.

---

### 48. Denetim günlüğü (`admin_audit_log`)

- **Durum:** `IMPLEMENTED` (backend)
- **Backend:** Satırı **use-case değil, repository** yazar (aynı `client`
  üzerinde) — geri alınmış bir güncellemenin kaydı ortada kalmasın diye.
- **Frontend:** `/admin` → "Denetim günlüğü" sekmesi (bkz. #47).
- **Database:** `admin_audit_log`.
- **API:** `GET /api/v1/admin/audit-log`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/admin.e2e-spec.ts`.
- **Üretime hazır:** Evet.
- **Eksik:** —
- **Risk:** **`admin_audit_log` ≠ `economy_transactions`.** Biri yetki
  kaydı, diğeri muhasebe defteri. Bir yönetim işlemini "denetlensin" diye
  deftere yazmak, defterin tek işini bozar.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/infrastructure/admin/postgres-admin.repository.ts`.

---

### 49. Sıralama (leaderboard)

- **Durum:** `IMPLEMENTED` (29.09.2026 — `username` alanı eklendi)
- **Backend:** `GET /leaderboard` — `@Public()`, `GetLeaderboardUseCase`;
  puanlama `domain/ranking/leaderboard.ts`te saf fonksiyondur.
- **Frontend:** `/leaderboard` — tablo **GERÇEKTEN BAĞLI**; satır adı artık
  `/profile/:username`e gider (`LeaderboardRowView.username`). Ayrıca her
  satırda "Arkadaş Ekle" düğmesi vardır (sıralama, başka oyuncunun
  `playerId`'sini gören tek yüzeydir; ayrı bir "oyuncu ara" ucu
  **uydurulmadı** — enumerasyon yüzeyi olurdu).
- **Database:** bitirilmiş yarışlardan türetilir (`race_entries`).
- **API:** `GET /api/v1/leaderboard`.
- **WebSocket:** ilgisiz.
- **Tests:** `test/api/leaderboard.e2e-spec.ts` (sunucu; her satırın
  `username`i `players` tablosundaki gerçek değerle karşılaştırılır ve o
  adın gerçekten 200 dönen bir profile çözüldüğü kanıtlanır),
  `apps/web/test/lib/api-client.spec.ts`.
- **Üretime hazır:** **Evet.**
- **Eksik:** Yok. Sayfalama YOKTUR ama bu bir eksik değil, bilinçli bir
  üst sınırdır (`LEADERBOARD_TOP_N = 50` — sunucu kırpar, istemci kırpmaz).
- **Risk:** İstemci puanı **yeniden hesaplamamalı**; sunucudan gelen
  `rank`/`score`/`raceCount` yalnızca gösterilir.
- **Sıradaki adım:** —
- **Kaynak:** `apps/api/src/api/leaderboard/leaderboard.controller.ts`,
  `apps/web/src/app/leaderboard/page.tsx`.

---

### 50. Bağlanmamış domain modülleri (kulüp/sezon/turnuva/progression/personel)

- **Durum:** `DOMAIN ONLY`
- **Backend:** `domain/club/club.ts`, `domain/career/`,
  `domain/progression/`, `domain/season/`, `domain/tournament/`,
  **`domain/staff/` (+ `config/staff.config.json`)** — saf TS + birim
  testleri. **30.09.2026:** personel bu listede hiç yoktu; `domain/staff`i
  `domain/` dışından içe aktaran tek dosya yoktur (API/ekran yok).
- **Frontend:** `/club` bir `ComingSoon` **yer tutucusudur** ve dosya
  başındaki not bunu dürüstçe yazar. (Diğer tüm sayfalar gerçek veriye
  bağlıdır — `ComingSoon` yalnızca 1 sayfada kullanılır.)
- **Database:** ilgili tablolar yok.
- **API:** **yok.**
- **WebSocket:** ilgisiz.
- **Tests:** `test/domain/` altında birim testleri.
- **Üretime hazır:** Hayır.
- **Eksik:** Uç nokta, tablo, ekran.
- **Risk:** Düşük (kullanıcıya görünmez), ama "yazılmış ama bağlanmamış"
  kod zamanla bakım borcuna dönüşür.
- **Sıradaki adım:** Bir sonraki büyük dilim: sezon + turnuva (kulüpten
  önce, çünkü ödül dağıtımı ve takvim altyapısını paylaşırlar).
- **Kaynak:** `apps/api/src/domain/club/`, `apps/web/src/app/club/page.tsx`.

---

### 51. 3D sunum ve ses

- **Durum:** `PARTIAL` (asset bekliyor — **bilinçli**)
- **Backend:** ilgisiz.
- **Frontend:** `RaceScene3D` + `DustParticles` **BAĞLI**; `GltfAssetLoader`
  ve `createHtmlAudioBackend()` bağlı **değil** ve bağlanmamalı.
- **Database:** ilgisiz.
- **API:** ilgisiz.
- **WebSocket:** `race.telemetry` → sahne.
- **Tests:** yok (görsel katman; tarayıcı/GPU bu ortamda yok).
- **Üretime hazır:** Hayır.
- **Eksik:** `.glb` at modelleri, `.mp3` sesler, lisanslı Veliefendi
  asset'leri. **Motor ses olaylarını (GATES_OPEN/OVERTAKE/WINNER) hiç
  yaymıyor.**
- **Risk:** **Sahte asset yasak** — placeholder `.glb`/ses uydurmak,
  lisanssız varlık kullanmak yok. `apps/web/public/` **boştur ve bu
  bilinçli bir karardır**; kod "dosya yoksa yedeğe düş" diye tasarlandı.
  `GltfAssetLoader`'ı bugün bağlamak **sıfır görsel etki** üretir (yedek
  görünümün tıpatıp aynısı). Mixamo da yasak.
- **Sıradaki adım:** **Proje sahibinin cevabını bekleyen tek kritik soru:**
  3D/ses varlıkları nereden geliyor?
- **Kaynak:** `apps/web/src/features/race-viewer/RaceScene3D.tsx`,
  `docs/ASSET_MANIFEST.md`.

---

## §5 — Üretime hazır DEĞİL (öncelik sırasıyla)

| Öncelik | Madde | Neden şimdi |
|---:|---|---|
| 1 | **3D/ses varlıkları** | Tek karar bekleyen konu; çözülene kadar brief'in kendi kapsamı dışında. |
| 2 | **OAuth kimlik bilgileri** | `POST /auth/login` pratikte çalışmıyor; gerçek giriş olmadan üretim yok. |
| 3 | **Kulüp/sezon/turnuva/personel (#50)** | En büyük eksik özellik kümesi; yeni bir faz gerektirir. |

> ⚠️ **29.09.2026:** **Jokey yüzeyi + serbest bırakma (#18)** bu tablodan
> **çıkarıldı** — `JockeyPanel` yazıldı, `/stable`a bağlandı **ve** eksik
> olan `POST /jockeys/:jockeyId/release` ucu eklendi. Satır silinip kalanlar
> yeniden numaralandırılmazsa, sıradaki dilimi seçen kişi **bitmiş** bir işi
> yeniden yapar (bu tablo iki kez bayatladı; bkz. yukarıdaki not).
>
> ⚠️ **29.09.2026:** **Yetiştirme yüzeyi (#16)** bu tablodan **çıkarıldı** —
> `BreedingPanel` yazıldı ve `/stable`a bağlandı.

**Bu tablodan ÇIKARILANLAR (29.09.2026):** ~~Yönetim paneli (#47)~~,
~~Blok/şikâyet arayüzü (#46)~~, ~~`username` alanı (#3, #43, #49)~~,
~~Yetiştirme yüzeyi (#16)~~, ~~Jokey yüzeyi + serbest bırakma (#18)~~ —
beşi de yazıldı. Tabloyu güncellememek, sıradaki dilimi seçen kişiye
**bitmiş bir işi yeniden yaptırır**; bu yüzden tamamlanan satır burada
tutulmaz, §2 tablosunda `IMPLEMENTED` olarak durur.

---

## §6 — Ölçülen riskler (eşik değil, rapor)

Bunlar **iyi durum değildir** ve bu yüzden CI eşiği yapılmadı; düzeltilince
CI kırmızıya dönmemelidir. Ayrıntı: `docs/RACE_BALANCE_REPORT.md`.

1. **Motorun sürpriz payı dardır.** Üretim lobilerinde favori ortalama
   `1/N`in **4.9–8.0 katı** kazanıyor; en kötü lobide **%99.8**; 500 yarışta
   hiç kazanmayan botlar var. Kök neden: `randomFactorRange: [-6,6]`nın 8
   segment boyunca ortalanıp ~**1.2 puana** inmesi.
2. **BİLEREK DÜZELTİLMEDİ.** Config değişikliği **dondurulmuş snapshot
   replay'ini** bozar (aynı seed + snapshot + config = bit bit aynı sonuç).
3. **Bot payı yanar** (#25) — gerçek oyuncu azken yarış oyuncu için
   kayıptır. Bilinçli: aksi hâlde bir oyuncu kendi yarışını açıp tek gerçek
   katılımcı olarak havuzun çoğunu geri alabilirdi.
4. **Platform payı ve bot artığı için hesap satırı yok** (#32) — kesilen
   para oyuncu ekonomisinden çıkar, başka bir hesaba girmez.

---

## §7 — Kanıt ve sınırlar

- **CI:** her fazın commit'i GitHub Actions'ta koştu; PHASE 6.3
  (`7703b5e`) koşum #226 **success**.
- **Yerel doğrulama:** `.claude/verify-admin.mjs` — şema sıfırlama → 43
  migration → 4 `tsc` geçişi → tam api vitest paketi → tam web vitest
  paketi → eslint → commit + push.
- **Hızlı DB kontrolü:** `.claude/phase7-db-check.mjs` — 53 saniyede
  `insertRaceRow`u gerçekten çalıştıran 68 e2e testi.
- **Bu ortamın sınırları:** tarayıcı/GPU yok → 3D/görsel değişiklik "kod
  doğru ama gözle görülmedi". Docker yok (PostgreSQL 18 kurulu).
  `git` PATH'te değil.

**Bu belgedeki hiçbir satır "çalışıyor" iddiası değildir** — her satır ya
bir dosyaya ya bir test dosyasına ya bir migration'a işaret eder. Kanıt
CI'dır.
