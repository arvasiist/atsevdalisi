# CLAUDE.md — At Sevdalısı

Bu dosya her oturum başında otomatik yüklenir. **Tam analiz için:
[`PROJE_DURUMU.md`](PROJE_DURUMU.md)** — projenin ne olduğu, gerçek faz durumu,
belge haritası, dürüst boşluk listesi orada. Buradaki liste yalnızca
**zarar vermemek için bilinmesi zorunlu** olanlardır.

---

## Proje

**AT SEVDALISI** — tarayıcıda çalışan **3D at yarışı + at sahipliği/yetiştiricilik
simülasyonu + ekonomi yönetimi** oyunu. Monorepo: Next.js 14 (`apps/web`) +
NestJS 10 (`apps/api`) + PostgreSQL + Redis + Socket.IO + Three.js.
Kullanıcı Türkçe konuşur, Türkçe yanıt veririm. Kod yorumları ve hata mesajları Türkçedir.

## Dokunulmaz kurallar

1. **SUNUCU OTORİTESİ.** İstemci asla yarış sonucunu, parayı, istatistiği, ödülü
   veya envanteri belirlemez. Simülasyon yalnızca `domain/race/race-engine.ts`'te koşar.
2. **RACE ENGINE'E DOKUNMA.** Denetim onu "KEEP" diye işaretledi. Değişiklik şartsa
   determinizm testini kırmadığını kanıtla.
3. **DETERMİNİZM.** Aynı seed + snapshot + config = bit bit aynı sonuç.
   `Math.random()` **yasak**; seed'li PRNG + `deriveRandom(seed, horseId, segmentIndex, purpose)`.
4. **KATMAN YÖNÜ TEK YÖNLÜ.** `Domain → Application → Infrastructure → API`.
   `domain/` içine NestJS/ORM importu **sokulmaz** — orası framework'süz saf TS.
5. **`@Inject()` HER ZAMAN AÇIK.** Vitest/esbuild `design:paramtypes` üretmez; tipe
   dayalı örtük DI sessizce `undefined` çözer ve yalnızca CI'da patlar.
   (Kardeş tuzak: esbuild altında DTO `@IsIn`/`@IsUUID` atlanır → domain katmanında
   bağımsız doğrulama şart.)
   **İKİNCİ KARDEŞ TUZAK — `@WebSocketServer()`:** `namespace` verilen bir
   gateway'de Nest bu alana io `Server`'ı DEĞİL, **namespace'i** atar. `.to(oda)
   .emit()` ikisinde de çalışır ama **oda sayımı çalışmaz**: io `Server`'da
   `server.sockets` bir namespace'tir (`.adapter` var), namespace'te ise
   `server.sockets` bir `Map`'tir (`.adapter` YOK). Doğrusu
   `server.adapter.rooms`'tur. Alanı `Server` diye tiplamak derleyiciyi
   susturur, hatayı gizlemez (yaşandı: 27.09.2026, §13.5).
6. **SİHİRLİ SAYI YOK.** Önce `config/*.config.json`, `load*Config()` ile oku.
7. **PARA/MUTASYON YOLU.** `SELECT ... FOR UPDATE` + aynı transaction'da
   `economy_transactions` defter kaydı olmadan kod yazılmaz.
8. **SAHTE ASSET YASAK.** Placeholder `.glb`/ses dosyası **uydurma**, lisanssız
   varlık kullanma. `apps/web/public/` boştur — bu bilinçli bir karardır, kod
   "dosya yoksa fallback'e düş" diye tasarlandı. Mixamo da yasak.
9. **`README.md` / `ROADMAP.md` faz tablosuna GÜVENME** — bayat. Gerçek durum
   `PROJE_DURUMU.md` §5'te.

## Bu ortamda yapamadıklarım

- **`npm install` ÇALIŞIYOR** (27.09.2026'da doğrulandı: `npm ping` → PONG,
  `npm install` → 733 paket). `ARCHITECTURE.md` §9'un "registry erişimi yok"
  varsayımı **artık geçersiz** — `npm install`, `tsc` ve `vitest` yerelde
  gerçekten koşuyor. Doğrulama artık CI'ya bırakılmak zorunda değil.
- **`git` PATH'te yok** → tam yol:
  `C:\Users\adema\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe`
- **Tarayıcı/GPU yok** → 3D/görsel değişiklik "kod doğru ama gözle görülmedi".
- **E2E ARTIK YERELDE KOŞAR** (27.09.2026'da doğrulandı; bu madde eskiden
  "E2E çalışmaz — Docker yok, Postgres 5432 kapalı" diyordu, **artık
  geçersiz**). Docker hâlâ yok ama makinede **PostgreSQL 18** kurulu
  (`C:\Program Files\PostgreSQL\18`). Tek kullanımlık küme:
  `initdb -D <veri> -U at_sevdalisi -A trust -E UTF8 --locale=C` →
  `postgres.exe -D <veri> -p 5432 -c listen_addresses=127.0.0.1` (detached) →
  `createdb` → `npm run migrate`. Redis zaten 6379'da.
  ⚠️ **TAM PAKETİ KOŞMADAN ÖNCE ŞEMAYI DÜŞÜR**
  (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` + `npm run migrate`).
  Birikmiş veriyle dosyalar birbirini bozar ve **yanlış** hata verir —
  yaşandı: `race.e2e-spec.ts` kirli DB'de 7 hata, temiz DB'de 24/24.
  Tek dosya koşarken buna gerek yoktur.
- **Asla "çalışıyor" deme** — kanıt CI'dır, ben değilim.

## Teslimat mekanizması

```
küçük dilim → yerel doğrula (kök `npm run typecheck` + hedefli vitest + lint)
  → commit → git fetch + origin/main atalık kontrolü → git push origin main
  → GitHub Actions CI
```

- **DEĞİŞTİ (27.09.2026, proje sahibinin açık talebi).** Eskiden commit yerelde
  kalır, kökte bir `apply-<özellik>-push.bat` üretilir ve proje sahibi ona çift
  tıklardı. Bu artık **geçersiz**: sahibi "sen direkt olarak geri planda
  çalıştırıp atabilirsin" dedi. Bundan sonra commit'i ben atar ve **doğrudan
  push ederim**; `.bat` üretmem. `git` PATH'te yok, tam yolu yukarıda.
- Push'tan ÖNCE `git fetch` + `git merge-base --is-ancestor origin/main HEAD`
  **şart** (yerel kopya geride kalmış olabilir — yaşanmış bir ders). Atalık
  sağlanmazsa push ETMEM, sahibine bildiririm.
- Kökteki eski `*.bundle`, `apply-*.bat`, `check-dirty*.bat`, `outputs/`,
  `*-log.txt` dosyaları gitignore'lu **scratch**'tir; artık üretilmez ama
  silinmeleri de gerekmez (~200 tanesi birikmiş durumda).
- "Her şeyi üzerine yaz" yerine **yalnızca değişen dosyaları** yazarım.
- Sohbette uzun rapor YAZMAM — sahibi token harcanmasını istemiyor; sonucu
  kısa bildiririm (ne değişti, hangi kanıt, sıradaki adım).
- **Kök `npm run typecheck`** kullanılır, `--workspace` DEĞİL: kök sürüm önce
  `build:packages` çalıştırır. `dist/` gitignore'lu olduğu için workspace'i
  doğrudan çağırmak bayat `dist` yüzünden sahte tip hatası verir.

## Bilinen açık uçlar (kısa)

**30.09.2026'da yeniden doğrulandı (bu liste iki kez bayatlamıştı):**
Gerçek 3D/ses varlığı yok · OAuth kimlik bilgileri yok (Google kodu + düğmesi
+ hesap bağlama VAR, `GOOGLE_OAUTH_CLIENT_ID` boşken düğme gizli — migration
0048; Apple istemcisi yok; e-posta + şifre girişi + şifre sıfırlama VAR —
`/account`, migration 0046/0047; sıfırlama e-postası üretimde
`RESEND_API_KEY` ister) · **yarış takvimi VAR** (01.10.2026, (27)) ·
**DOMAIN ONLY modül KALMADI** (progression, kulüp, personel ve sezon
01.10.2026'da BAĞLANDI; yer tutucu sayfa YOK) · `PlayerDemoWidget` bağlı
değil (bilinçli). `GltfAssetLoader` ve ses yöneticisi 01.10.2026'dan beri
BAĞLI (3D adım 4/9) — dosya yokken prosedürel/sessiz yedeğe düşerler. Jokey, mizaç, taktik motora BAĞLI;
`PedigreeTree`, `BreedingPanel`, `JockeyPanel`, `/admin`, `/leaderboard`,
`/farm`, **lobi yarışı (`LobbyPanel`, 30.09.2026)** bağlı.

**✅ 30.09.2026 — ÜÇ SUNUCU KURALI + LOBİ ARAYÜZÜ (§13.33):**
(1) **Açık yarıştaki at kilidi** — `scheduled`/`locking` bir lobi yarışına
kayıtlı at satılamaz, pazara çıkamaz, ikinci açık yarışa yazılamaz
(`HORSE_IN_ACTIVE_RACE`; tek tanım `infrastructure/horse/active-race-entry.ts`).
Önceden satılan at eski sahibi adına koşuyor ve ödülü satıcı alıyordu.
(2) **READY ŞARTI** — başlangıçta `ready` demeyen katılım iptal edilir ve
ücreti defterden okunan tutarla İADE edilir (yakılmaz); kimse hazır değilse
yarış iptal olur (`dropUnreadyLobbyEntries`). Lobi yarışını koşturan her
yeni e2e, katılımdan sonra `ready` DEMELİDİR — yoksa katılım düşer.
(3) **OTOMATİK KESİNLEŞME** — zamanlayıcı kilidin ardından `locking`
yarışları kesinleştirir (`SettleDueRacesUseCase`); crank uç yaşamaya devam
eder, çift ödeme imkânsız. (4) `GET /races` satırı çağıranın kendi
katılımını taşır (`myEntry`) ve `/races` sayfasında `LobbyPanel` vardır.
(5) **İzlenmiş tribün bileti iade edilmez** (`TICKET_ALREADY_USED`,
migration 0044 `race_tickets.first_viewed_at`) — bilet YALNIZCA bitmiş
yarışa satılır, "zaman penceresi" bütün iadeleri kapatırdı; açık "izle +
parayı geri al"dı. (6) **Eşleştirme kuyruğu taranır** (`MatchmakingScheduler`,
`online.matchmaking.queueScan`). (7) **Cüzdan geçmişi sayfalanır**
(`?before=` imleci; bozuk imleç 400, varsayılana düşmez).
(8) **Hazırlık kapısı her yarış yolunda** — `checkRaceReadiness` eskiden
yalnızca pratik yarışta uygulanıyordu; lobi katılımı ve eşleştirme de
artık aynı kapıdan geçer (enerjisi bitmiş at ücretli yarışa giremez).
(9) **TURNUVA (migration 0045)** — lobi yarışının ÜSTÜNE kurulu:
`tournaments` (race_id, tier, min_player_level; durum sütunu YOK, yarıştan
türetilir). `TournamentScheduler` her kademe için otomatik açar; final
BOTSUZ, ödül `online.tournament.prizeDistributionByPlacement` (rake yok);
`minParticipants` altında iptal + iade. Ayrı turnuva ucu YOK — `GET /races`
listeler (`RaceLobbyListItem.tournament`).
(10) **E-POSTA + ŞİFRE GİRİŞİ (migration 0046)** — `POST /auth/credentials`
(misafiri kaydet), `POST /auth/login/password` (`@Public`), `GET
/auth/credentials`. Şifre `scrypt` (yerleşik; parametre + tuz özette).
⚠️ Yanlış şifre ile kayıtsız e-posta AYNI 401 + aynı mesaj — ayırmak
enumerasyon açar; kayıtsız e-postada da sahte özet doğrulanır.
(11) **ŞİFRE SIFIRLAMA (migration 0047)** — bağlantı tek kullanımlık, 30 dk,
DB'de yalnızca SHA-256 özeti. İstek yanıtı HER ZAMAN 202. `EMAIL_SENDER`:
`RESEND_API_KEY` varsa Resend, yoksa `OutboxEmailSender` (testler oradan
okur). ⚠️ Üretimde sıfırlama bağlantısını LOGLAMA — parola eşdeğeridir.
(12) **GOOGLE BAĞLAMA (migration 0048)** — `POST /auth/link`, `GET
/auth/providers` (`@Public`). ⚠️ Başkasına bağlı Google kimliği 409 —
hesaplar BİRLEŞTİRİLMEZ (para/at taşımak ayrı karar). Misafir = e-posta YOK
VE `linkedProviders` boş. E2e Google belgesini sahte doğrulayıcıyla taklit
eder (`bootstrapTestApp(builder => builder.overrideProvider(...))`).
(13) **TASARIM YENİLEMESİ (01.10.2026, §13.39)** — altın-lacivert tema
(`globals.css` token'ları), simgeli üst bar + mobil alt sekme çubuğu
(`nav-links.ts` artık nesne listesi), yayın tarzı yarış HUD'u, prosedürel
at+jokey (`HorseModel.tsx`) ve hipodrom (`TrackScenery.tsx`). ⚠️ 3D sahne
HİÇBİR dosya indirmez — eski drei `<Environment preset>` CDN'den HDR
indiriyordu ve indirme düşünce yarış ekranı TAMAMEN çöküyordu; `preset`/
`files` ile ortam haritası GERİ EKLEME. Kamera yumuşatması kare hızından
bağımsızdır (düşük fps'te kamera takılmasın).
(14) **XP / SEVİYE ARTIK İŞLİYOR (01.10.2026)** — `domain/progression`
önceden HİÇBİR yerden çağrılmıyordu: herkes Sv. 1'de kalıyor, Gümüş/Altın
turnuvalar açılamıyordu. Ödül tablosu `progression.xpRewards` (oyuncu + at
ayrı). Pratik yarış ve lobi kesinleşmesi XP'yi PARA İLE AYNI transaction'da
yazar (`infrastructure/progression/award-xp.ts`, satır `FOR UPDATE`);
antrenman ata kilit içinde, oyuncuya kendi kilidiyle verir. ⚠️ Yarış sonrası
XP'yi 0 sanan test yazma — beklenen değeri `applyXpGain` + `computeRaceXp`
ile hesapla (`progression.e2e-spec.ts`).
(15) **KULÜP (01.10.2026, migration 0049, §13.41)** — `/clubs` uçları +
`/club` ekranı. Tek kulüp kuralı `club_members.player_id` BİRİNCİL
ANAHTARIDIR (eşzamanlı iki katılımı kısıt keser). Kilit sırası önce
`clubs`, sonra `club_members`. Liderlik devri tek transaction'da (eski lider
`officer`). Yarış XP'si kulüp puanına AYNI transaction'da yazılır
(`addClubPointsInTransaction`). ⚠️ Ad tekilliği `lower(name)` DEĞİL
`name_key`tir: `--locale=C` kümesinde `lower()` "Ü"/"İ"yi küçültmez —
anahtar `clubNameKey` (tr-TR) ile uygulamada üretilir.
(16) **PERSONEL (01.10.2026, §13.42)** — `/staff` uçları + ekranı;
`staff` tablosu (0012) artık yaşıyor. Sözleşme PEŞİN (`staff.contractMonths`)
→ PARA YOLU: `staff` → `players` `FOR UPDATE` + `staff_contract` defter
satırı aynı transaction'da. Çift ödeme DURUMLA engellenir (sahipli aday
409, yenileme yalnızca bitime `renewWindowDays` kala) — Idempotency-Key
YOK. Bırakma iade ETMEZ. Etkiler: antrenör → `trainerFactor`, seyis/
veteriner/nalbant → `applyCareAction` `effectMultiplier`
(`staff.careActionRoles`); aynı rolden yalnızca EN İYİ etkin personel
sayılır; süresi dolan etki vermez. ⚠️ `hireableRoles`a etkisi BAĞLANMAMIŞ
bir rol ekleme — oyuncuya işe yaramayan personel satmak olur.
(17) **SEZON (01.10.2026, migration 0050, §13.43)** — `GET /seasons/current`
+ `/leaderboard` "Sezon" sekmesi. Sezon SKORU TUTULMAZ: genel sıralamanın
formülüyle, yalnızca `races.start_time` sezon penceresindeki kayıtlardan
TÜRETİLİR (ikinci puan defteri yok → ayrışamaz; "sezon reseti ilerlemeyi
silmez" kendiliğinden). Sezonlar ardışık açılır (advisory lock). Ödülü
`SeasonScheduler` öder (`season.rewardsByRank`, `season_reward` defter
satırı); tek sefer kapısı `seasons.rewards_paid_at` KİLİT ALTINDA.
Zamanlayıcı `NODE_ENV=test`te kapalı — e2e `tickNow(gelecekTarih)` ile
sezon bitişini simüle eder. ⚠️ Ödül sırası ile ekrandaki sıra AYNI
fonksiyondan (`SeasonUseCase.rankSeason`) çıkar; ayrı hesap yazma.
(18) **3D VARLIK HATTI + OYUNCUNUN ATI (01.10.2026, migration 0051, §13.44)**
— ⚠️ drei `useGLTF` Draco çözücüsünü VARSAYILAN olarak gstatic CDN'inden
indirir; `GltfAssetLoader` artık yerel `/decoders/draco/` (+ KTX2 `/decoders/
basis/`) kullanır. Çözücüler `apps/web/scripts/copy-3d-decoders.mjs` ile
`three` paketinden kopyalanır (`predev`/`prebuild`, çıktı gitignore'lu).
`useGLTF(path)` ÇIPLAK ÇAĞIRMA. Dosya yoksa yükleme denenmez (HEAD
yoklaması) ve `PlaceholderBadge` "PLACEHOLDER" yazar — prosedürel görüntü
asla "gerçekçi" diye sunulmaz. Animasyon klipleri ADA değil ROLE bağlanır
(`resolveAnimationClips`). At görünüşü (`horses.coat_color/face_marking/
leg_marking`) DB'dedir: başlangıç atı `deriveAppearance(id)`, tay
`inheritAppearance` (config `horse-appearance.config.json`); sütun
varsayılanı yalnızca eski satırlar/SQL fikstürleri içindir. Durum →
davranış `horse-presence.config.json` (salt görsel); "stres" alanı yok,
uydurulmadı. 3D önizleme `/stable` kartında DÜĞMEYLE açılır (her kartta
Canvas = WebGL bağlam sınırı).
(19) **ANA SAYFA 3D VİTRİN (01.10.2026, §13.45)** — `features/home-scene`.
Eski CSS/SVG hero KALDIRILDI; ekranın üstü 3D hipodrom + OYUNCUNUN atı
(`pickFeaturedHorse`, kartla aynı kural) + jokey + PLACEHOLDER ahır. 6
sinematik çekim `config/camera.config.json` → `homeShowcase` (ata göre
konum, `from→to` dolly, `blendSeconds` yumuşak geçiş; saf
`evaluateShowcaseCamera`, sınırda sıçrama testle kilitli). Dar ekranda
`fitFovToAspect` yatay kapsamı korur. Ekran dışında render durur,
`prefers-reduced-motion` otomatik dolaşımı kapatır. ⚠️ `asset-pipeline.ts`
three.js İÇE AKTARMAZ (KTX2 `ktx2-loader.ts`te) — rozet ana pakete three
çekiyordu (ana sayfa 216 kB → 15 kB). ⚠️ `HorseModel` baş açısı düzeltildi
(baş eskiden geriye-yukarı bakıyordu; yarış ekranını da etkiler).
(20) **GLB BAĞLAMA (3D adım 4, §13.46)** — sahnelerin TEK at bileşeni
`HorseAvatar3D` (yarış, ana sayfa, ahır önizlemesi): GLB varsa
`SkeletonUtils.clone` (örnek başına), `computeModelFit` (eksen/ölçek/taban),
`tintMaterials` (don/yele/forma), rol ile klip (`pickGaitClip`), jokey
`mountBoneNames` kemiğine; yoksa prosedürel. Model farklıysa YALNIZCA
manifest `binding` değişir. `npm run assets:check` dosyaları doğrular.
⚠️ Prosedürel jokey jokey-GLB yokken atın GÖVDE grubunda çizilir (dörtnalda
birlikte sallanır) — ayrı çizmek kopukluk yaratır.
(21) **HİPODROM + KALABALIK (3D adım 5, §13.47)** — `HippodromeSurroundings`
yarış ve ana sayfanın ortak çevresi. Ortam GLB'si (`keepOrigin`) yalnızca
tribün/kule/ağaçların YERİNİ alır; pist, korkuluk, çim HER ZAMAN oyunun
(atların yolu `track-path.ts`e bağlı). Kalabalık heyecanı
`computeCrowdExcitement` (`atmosphere.config.json`, final eşiği
`camera.config.json` ile AYNI) → tribün kalkar/dalgalanır; `animationHz`
seyreltmesi, `lodDistanceMeters` LOD, `densityByTier` kademe yoğunluğu.
Salt sunum — sonuca etkisi YOK.
(22) **3D AHIR (3D adım 6, §13.48)** — `/stable` üstünde `StableScene3D`
(TEK Canvas; kartlardaki "Ahırda Göster" sahneye at seçer — eski kart
başına `HorseShowcase` KALDIRILDI). Ortam `stable-environment.glb`
(`keepOrigin`, orijin = bölme zemini, at +X) ya da `PlaceholderStall`.
(23) **IŞIK (3D adım 7, §13.49)** — üç sahne `SceneRenderSettings` +
`SCENE_GL_OPTIONS` (ACES, `lighting.config.json` pozlama; PCSS yumuşak gölge
YALNIZCA ultra). HDRI: `HdriEnvironment` — YEREL dosya, önce yoklanır, hata
sınırlı; `preset` YASAK (`lighting.spec.ts` src'yi tarar ve kırılır).
(24) **YARIŞ ENTEGRASYONU (3D adım 8, §13.50)** — `StartGate` (GLB `open`
klibi ya da prosedürel bölmeler, kapılar `gateOpen`la açılır) + yüzeye göre
toz/pist rengi (`vfx.config.json` `dustBySurface`/`trackColorBySurface`;
hız ve kamera mesafesiyle ölçekli, `dustSpawnRate`). Yüzey `view.surface`ten
gelir; izleme sayfası yüzey geçirmez → `dirt`.
(25) **SES (3D adım 9, §13.51)** — `useRaceAudio` olayları EKRANDAKİ durumdan
türetir (`deriveRaceAudioCues`, saf; motor ses yaymaz). Kalabalık hacmi
tribünle AYNI `crowdExcitement`ten. `createProbedAudioBackend`: dosya yoksa
sessiz (yalnızca HEAD yoklaması), yollar `assetUrl` ile MUTLAK. Varsayılan
SESSİZ (`AudioToggle`, localStorage); ahırda `useStableAmbience`.
(26) **PERFORMANS (3D adım 10, §13.52)** — üç sahne kaliteyi `useQualityTier`
den alır (tercih: Otomatik/Düşük/Orta/Yüksek/Ultra, `QualitySelect`).
"Otomatik"te `SceneQualityMonitor` (drei `PerformanceMonitor`,
`performance.config.json`) kare hızı düşünce kademeyi en fazla
`maxAutoDowngrades` kez indirir; sabit seçim EZİLMEZ. `<Canvas key={tier}>`
— kademe değişince sahne yeniden kurulur (gölge haritası çalışma anında
güvenle açılıp kapanmaz). ⚠️ Yazılımsal GPU'da (CI/headless) otomatik kademe
hızla "Düşük"e iner — ekran görüntüsünde bu beklenir.
(27) **YARIŞ TAKVİMİ (01.10.2026, migration 0052, §13.53)** —
`race-lobby.config.json` → `calendar.programs`; `RaceCalendarScheduler`
her programın penceredeki yuvalarını (UTC'den hizalı `k×aralık+ofset`,
saf `computeCalendarSlotTimes`) SIRADAN lobi yarışı olarak açar
(`created_by` NULL, botlu, aynı kilit/kesinleşme). Tekrar koruması
`race_calendar_slots (program_id, start_time)` PK + yuva advisory kilidi.
⚠️ Her yuva `validateRaceCreation`dan geçer — oyuncuya yasak bir yarışı
sunucu da açamaz; program eklerken `race-calendar.spec.ts` bunu dener.
Katılımsız geçmiş yarış iptal edilir, iptal edilen yuva YENİDEN AÇILMAZ.
`GET /races` satırı `calendar: { programId } | null` taşır.
(28) **ÇİFTLİK TESİSİ ETKİLERİ BAĞLANDI (01.10.2026, §13.54)** — eskiden
yedi tesisten yalnızca personel binası işliyordu; oyuncu diğerlerine para
ödüyor, hiçbir şey almıyordu. `computeFarmEffects` (saf) +
`FarmEffectsService`: padok → `rest` bakımı, antrenman pisti × nalbant →
antrenman sakatlık olasılığı, depo → yem TOPLAMI (`discountedTotal`, yukarı
yuvarlama), üreme merkezi → doğum sağlık riski. ⚠️ **Veteriner merkezi
ETKİSİZ** (bakım ücretsiz — düşürülecek maliyet yok): `farm.config.json` →
`inactiveFacilities`, inşa 409 `FACILITY_INACTIVE`. Yeni tesis tipi
eklersen ya bağla ya `inactiveFacilities`e koy — `farm.spec.ts` kapalı küme
iddiasıyla kırılır.
(29) **OYUNCU KONTROLLÜ PRATİK YARIŞ (01.10.2026, migration 0053, §13.55)** —
`/races` → Pratik → "Atı Kendin Sür": kırbaç (Boşluk), sol/sağ (← →), sakin
(↓). ⚠️ **MOTORA DOKUNULDU** (sahibinin talebi): `RaceSimulationInput.
playerCommands` OPSİYONEL; komutsuz çıktı eski motorla BİT BİT AYNI —
`race-engine-player-control.spec.ts` 120 yarışın SHA-256 parmak izini
kilitler (değişiklik öncesi motordan alındı). Komut yalnızca kendi
segmentinden itibaren etkiler (önek değişmezliği) — canlı yarış BUNA
dayanır: komut her zaman İLK GÖSTERİLMEMİŞ segmente yazılır, gösterilen
geçmiş değişmez. Kırbaç sınırsız (sahibinin kararı), her biri dayanıklılık
yakar + KALICI yorgunluk ekler (sonraki segmentten itibaren), bonus
dayanıklılıkla orantılı ve azalan getirili; "sakin" atı yavaşlatır ama
dayanıklılık biriktirir. Değerler ÖLÇÜLEREK seçildi
(`RACE_BALANCE_REPORT.md` §9; harness `measurePlayerControlPlan`) —
değiştirirsen `race-engine-player-control.spec.ts` denge kilitlerine bak. Oturum `interactive_races`:
ücret BAŞLANGIÇTA düşer, kesinleşme pratik yarışın kayıt yolunu
(`savePracticeRaceInTransaction`) oturum kilitliyken kullanır,
`InteractiveRaceScheduler` terk edileni kesinleştirir. ⚠️ Tohum GİZLİ
(`simulation_seed`, yarış kimliği DEĞİL) — aksi hâlde oyuncu açık kaynak
motorla en iyi komutları önceden hesaplardı. Yarış saati `timeScale` (2×)
ile akar; yalnızca süre kısalır, sonuç değişmez. Süren yarıştaki at
`isHorseInActiveRace` ile kilitli.
(30) **KONTROLLÜ LOBİ/TURNUVA YARIŞI (01.10.2026, migration 0054, §13.56)** —
`races.player_control` (yarış açarken "Kontrollü yarış", turnuva finali ve
`grass-mile` takvim programı açık). Kilit `live_starts_at`ı yazar (kilit +
geri sayım); komutlar `race_entries.player_commands`a (yarış `FOR SHARE`,
katılım `FOR UPDATE`) aynı "ilk gösterilmemiş segment" kuralıyla düşer. Uçlar
YALNIZCA katılımcıya (yoksa 404): `GET races/live/current`, `GET
races/:id/live`, `POST …/live/commands` (`@RateLimit`), `POST …/live/finish`
(= kesinleşme). ⚠️ Kesinleşme (crank, zamanlayıcı, finish) canlı koşu
bitmeden `InteractiveRaceNotFinishedError` (409) verir; zamanlayıcı bunu
sessizce atlar. Kopan oyuncunun atını AI jokey sürer — DB'ye yazılmaz.
⚠️ **TOHUM SIZINTISI KAPATILDI:** `GET /races/:id/timeline` tohumu artık
YALNIZCA `finished` yarışta döner (kilitli yarışta tohum + açık motor =
sonucu önceden hesaplamak). ⚠️ `JoinRaceDto` taktik alanları
`@IsOptional()` — onsuz gerçek sunucu `LobbyPanel` katılımını 400'lüyordu
(esbuild e2e'de görünmez; `join-race-dto.spec.ts` kilitler). Lobi formunun
"1 dakika" gecikmesi sunucu alt sınırının altındaydı (en az 2 dk).
(31) **BEKLEYEN TRİBÜN (01.10.2026, §13.57)** — bitmemiş yarışa
`race.subscribe` eskiden BOŞ oynatma oturumu kuruyordu (4 sn'de sırasız
`race.finished`, 60 sn önbellek → kesinleşmeden sonra gelen bile yarışı
göremiyordu). Artık `RaceGateway` bitmemiş yarışta oturum KURMAZ: odaya alır,
`race.waiting` yollar ve `race-lobby.spectatorWaitPollSeconds` aralığıyla
yoklar (`checkWaitingRace`); kesinleşince oynatma odanın tamamına başlar,
iptalde `race.cancelled`. Boş oda yoklamayı durdurur. ⚠️ Yeni bir "yarış
sürerken izle" yolu yazarken `pollForPlayback`/oturum önbelleği ayrımını
koru — bitmemiş yarışa `createPlaybackSession` ÇAĞIRMA.
(32) **CANLI TRİBÜN (01.10.2026, §13.58)** — kontrollü yarış koşarken
`GET /races/:id/live/spectate` (yetki `GetRaceTimelineUseCase.assertCanWatch`
— zaman çizelgesiyle AYNI kapı, ikinci kural YAZMA). Görünüm `role:
'spectator'`: komut/sonuç yok, yalnızca GÖSTERİLMİŞ segmentler (tribün
oyuncunun görmediğini göremez). `/races/:id/watch` yarış kilitlenene kadar
5 sn'de bir yoklar, canlıyken `InteractiveRaceViewer`ı tribün modunda açar;
"Tekrarı izle" soket oynatmasına döner. ⚠️ İzleme sayfası token'ı oturum
yüklendikten SONRA okur (`usePlayer`) — eskiden ilk render'da okuyordu ve
doğrudan açılan/yenilenen sayfa girişli oyuncuya "hesap oluştur" diyordu.
Canlı görünümde atlar GERÇEK adıyla (sürücüde "Ad (sen)"), botlar tekrar
oynatmadaki etiketiyle (`bot-2`) görünür — `LobbySettlementEntrant.horseName`.
(33) **CANLI GÖRÜNÜM ÖNBELLEĞİ + ÇOK OYUNCULU DENGE (02.10.2026, §13.59)** —
`LobbyLiveRaceUseCase` zaman çizelgesini `BoundedCache` (LRU,
`interactive-race.liveRunCacheEntries`, 0 kapatır) ile tutar; anahtar
yarış + tohum + HER katılımın komutları — komut değişince anahtar değişir.
Tohum ya da dondurulmuş snapshot yoksa önbelleğe ALINMAZ. ⚠️ Kesinleşme
önbelleği KULLANMAZ. Yön komutu ve çok oyunculu kontrol ölçüldü
(`RACE_BALANCE_REPORT.md` §9.1); düzeltme gerekmedi, değişmezler CI'da.
(34) **MÜZAYEDE + PAZARDA SATIŞ EKRANI (02.10.2026, migration 0055, §13.60)** —
PARA YOLU. `market_bids` (leading/outbid/won/refunded; ilanda en fazla bir
leading/won — kısmi tekil indeks). Teklif EMANETTİR: teklif anında para
düşer (`auction_bid_hold`), geçilen lider AYNI transaction'da iade alır
(`auction_bid_refund`). Kilit sırası: ilan → leading teklif → at → oyuncular
(id sırası). Tekrar koruması `Idempotency-Key` DEĞİL: aynı teklifin tekrarı
`BID_TOO_LOW` ile düşer. Artış `economy.auction` (yüzde + sabit, saf
`minimumNextBid`). Kapanış `AuctionSettleScheduler` (test'te kapalı,
`tickNow`): at alıcıya + `auction_sale_credit`; at artık satıcının değilse /
alıcının ahırı doluysa / at açık yarıştaysa emanet İADE + `expired`.
⚠️ Tembel süre süpürmesi (`sweepExpiredListings`) ve satın alma yolu
müzayedeyi ASLA `expired` yapmaz (emanet askıda kalırdı) — e2e bunu kilitler.
Müzayede "hemen al" ile alınamaz (409 `LISTING_IS_AUCTION`), bitişsiz açılamaz,
teklif almışsa iptal edilemez (409 `AUCTION_HAS_BIDS`). Web'de ilan AÇMA yolu
bu tarihe kadar HİÇ YOKTU — `/market` artık "Atımı Sat" formu + teklif + at adı
(`MarketListing.horseName`, `auction` durumu) taşır.
Bildirimler (migration 0056): `auction_outbid` (kendi teklifini yükseltene
gitmez), `auction_won`, `auction_sold`, `auction_unsold`, `auction_refunded` —
para hareketiyle AYNI transaction'da. ⚠️ `notifications.type` CHECK'i artık
0056'dadır; `notification-types.spec.ts` CHECK'i yazan EN SON migration'ı okur.
Yeni tür eklerken kısıtı ADIYLA (`notifications_type_check`) düşür.
(35) **PWA (02.10.2026, §13.61)** — `app/manifest.ts` + ikonlar logo SVG
yolundan `next/og` ile üretilir (`/pwa-icon/[size]`, `app/icon.tsx`,
`app/apple-icon.tsx`) — `public/`e ikon DOSYASI koyma. Service worker YOK
(bilinçli). Chromium kurulabilirlik denetimi hatasız.
(36) **JOKEY-AT UYUMU (02.10.2026, §13.62)** — `effectiveJockeySkill` kadro
dondurulurken `jockeySkillComposite`e yazılır (lobi/pratik/eşleşme);
`jockey.compatibilityInfluence` (0.15, 0 = eski davranış). MOTOR DEĞİŞMEDİ.
⚠️ Kadrodaki jokey puanını salt `calculateJockeySkillComposite` ile
karşılaştıran test yazma — uyum dahil değerdir (`jockey.e2e-spec.ts`).
(37) **OTURUM (02.10.2026, migration 0057, §13.63)** — erişim JWT'si 1 sa
+ `sid`; refresh token döner, DB'de yalnızca özet (`auth_sessions`); eski
token tekrar sunulursa oturum kapanır. Guard + soket TEK sorguyla oturumu ve
oyuncunun VARLIĞINI denetler (yok → 401). `TokenService.sign` artık süre
ister — yeni token BASMA, `AuthSessionUseCase.issue` kullan. ⚠️ Soket
kimliği `afterInit` ara katmanındadır; `handleConnection`a async kapı
KOYMA (bağlanır bağlanmaz gelen olay `playerId`siz işlenir). ⚠️ Web oturumu
YALNIZCA 401'de siler (`isUnauthorized`); ağ hatasında silmek misafir
hesabını kaybettirir. Eski (`sid`siz) token kabul edilir, yükseltilir.
(38) **E-POSTA DOĞRULAMA (02.10.2026, migration 0058, §13.64)** — kayıt
doğrulama e-postası yollar (hata kaydı bozmaz); bağlantı özetle saklanır,
tek kullanımlık, ÜRETİLDİĞİ e-postaya bağlı. `GET /auth/credentials`
`emailVerified` taşır. ⚠️ Kayıt artık e-posta ürettiği için giden kutusunu
SAYAN testleri konuya (`subject`) daralt (yaşandı: `password-reset.e2e-spec.ts`).
Doğrulama bugün hiçbir özelliği kapatmaz.
(39) **HESAP SİLME (02.10.2026, migration 0059, §13.65)** — satır SİLİNMEZ
(değiştirilemez defter), kişisel veri silinir + anonimleşir (`deleted_at`).
⚠️ Oyuncu listeleyen YENİ bir sorgu yazarken `p.deleted_at IS NULL` ekle
(sıralama, sezon, profil, `findById` öyle). Parası emanette olan hesap 409.
⚠️ Oyuncuya bağlı YENİ bir kişisel veri tablosu eklersen
`postgres-account-deletion.repository.ts` silme listesine de ekle; yeni bir
emanet/para bekleten durum eklersen `BLOCKERS_SQL`e ekle.
(40) **ÜRETİM TEMELİ (02.10.2026, Faz 13-A, §13.66)** — üretimde eksik/zayıf
ortamla API AÇILMAZ (`production-env.ts`); yeni zorunlu bir ortam değişkeni
eklersen oraya + `docs/DEPLOYMENT.md`ye yaz. `/health/ready` DB+Redis.
Hata zarfı `error.requestId` taşır. ⚠️ CI `security` işi: yeni yüksek/kritik
bağımlılık açığı CI'ı KIRAR; izin eklemek karardır (gerekçe + son tarih,
`security/audit-allowlist.json`). İzinler **2026-11-01'de biter** (Next 16 /
Nest 12 yükseltmesi gerekir). Gitleaks tüm geçmişi tarar; yanlış pozitif
`.gitleaksignore`a parmak iziyle. Docker yerelde YOK — imajlar CI'da derlenir.
(41) **NEST 11 (02.10.2026, Faz 13-B.1)** — Express 5: rota jokeri ADLANDIRILIR
(`'{*path}'`, `'*'` DEĞİL); sorgu dizesi basit ayrıştırılır (iç içe `a[b]=`
nesneye dönmez — `@Query('x')` düz parametre kullan).
(42) **NEXT 16 + REACT 19 + R3F 9 (02.10.2026, Faz 13-B.2)** — sayfa/rota
`params` Promise'tir: istemci sayfasında `useParams()`, rota işleyicide
`await params`. ⚠️ Kök `package.json` `overrides` React'i 19'a sabitler —
KALDIRMA: aksi hâlde eski React 18 kökte kalır, iki React olur. ⚠️ Dockerfile
çalışma katmanı `apps/*/node_modules`u da kopyalar (npm çatışan sürümleri
oraya kurar). Bağımlılık izin listesi BOŞ — yeni yüksek/kritik açık CI'ı kırar.
(43) **13-C (02.10.2026)** — `docker-compose.staging.yml` + `tools/ops/smoke.mjs`
(CI'da koşar); yedek: `tools/ops/db-backup.sh`/`db-restore.sh` (boş olmayan
hedefi REDDEDER)/`backup-drill.sh` (CI'da). Hata: `reportError` (varsayılan
JSON log) — Sentry seçilince `setErrorReporter`; ⚠️ rapora sorgu dizesi,
token, girdi KOYMA. Web `app/error.tsx` + `global-error.tsx` → `POST
/client-errors`. Yeni bir kişisel veri tablosu yedeğe kendiliğinden girer
(yedek dosyası KİŞİSEL VERİDİR, depoya girmez).
(44) **ROLLER + YAPTIRIM + DUYURU (02.10.2026, Faz 10 + 11-A, migration 0060,
§13.69)** — `players.is_moderator`; izin tablosu saf `domain/admin/staff.ts`
(`STAFF_PERMISSIONS`). Moderatör: şikâyet kuyruğu, oyuncu listesi, SÜRELİ
askı (`moderation.config.json` → `moderatorMaxSuspendHours`); yasak + rol +
duyuru + diğer uçlar YALNIZCA yönetici. Rol `PUT /admin/players/:id/role`
(kendine YASAK, denetim `player.role_changed`). Yaptırım `player_sanctions`
(silinmez, `lifted_*` ile kalkar); personele yaptırım YOK. ⚠️ Askı/yasak
oturum kapısındadır (guard + soket + giriş + yenileme TEK sorgu) → 403
`ACCOUNT_SUSPENDED` — 401 DEĞİL: web oturumu yalnızca 401'de siler, askı
bitince oyuncu aynı hesapla döner. Yasak bütün oturumları kapatır. Duyuru
`GET /announcements` (`@Public`); aynı anda en fazla `maxLive` (advisory
kilit altında sayılır). Yeni bir yönetim ucu: izni `STAFF_PERMISSIONS`e
yaz, kapıyı `assertStaffPermission` ile VERİ OKUMADAN ÖNCE çağır.
(45) **GÖREVLER + ETKİNLİKLER (02.10.2026, Faz 11-B, migration 0061, §13.70)**
— `/quests` ekranı; görev listesi `config/quests.config.json` (gün/hafta
Türkiye saatiyle, `timezoneOffsetMinutes`). İlerleme SAYAÇ TUTULMAZ,
mevcut tablolardan pencere içinde TÜRETİLİR (yarış: `COALESCE(e.player_id,
h.owner_id)` + `races.start_time` — sezonla aynı; antrenman `rest` hariç;
bakım günlüğü (at, iş) başına son zamanı tuttuğu için "farklı bakım işi";
at alımı = sabit fiyatlı alım + kazanılmış müzayede, `horsePurchaseMinPrice`
altı sayılmaz). Ödül PARA YOLU: oyuncu `FOR UPDATE` + ilerleme KİLİT ALTINDA
yeniden sayılır + `quest_claims (player_id, quest_key, period_start)` TEKİL
+ `quest_reward`/`event_reward` defter satırı aynı transaction'da. Etkinlik
(`live_events`) yalnızca yönetici açar (`events.manage`, denetim kaydı aynı
tx), en fazla `maxLive`; bitince `claimGraceHours` boyunca ödül alınabilir.
⚠️ `economy_transactions.reference_id` METİNDİR (UUID değil) — UUID
sütunla join'de `::text` şart (yaşandı: 500). ⚠️ Yeni ölçüt eklerken üç yer:
`QUEST_METRICS`, `METRIC_SQL` (Record — eksikse tsc hatası) ve migration
`live_events.metric` CHECK'i.
(46) **VERİ DIŞA AKTARMA (02.10.2026, Faz 1, §13.71)** — `GET /account/export`
(KVKK md. 11 / GDPR md. 15, 20; `/account` → "Verilerimi indir"). Sütunlar
AÇIKÇA seçilir (`SELECT *` YOK) → yeni bir özet/iç sütun kendiliğinden
SIZMAZ. Diğer oyuncular yalnızca kullanıcı adıyla; hakkımdaki şikâyet ve
yaptırımı veren yönetici GİRMEZ. Bölüm sınırı `auth.dataExport.
maxRowsPerSection` (aşınca `truncated`). ⚠️ Oyuncuya bağlı YENİ bir kişisel
veri tablosu eklersen silme listesine ((39)) EK OLARAK
`postgres-account-export.repository.ts` → `SECTION_SQL` ve
`ACCOUNT_EXPORT_SECTIONS`e de ekle.
(47) **ŞÜPHELİ DESENLER (02.10.2026, Faz 7 anti-cheat, §13.72)** — `GET
/admin/anomalies` + `/admin` "Şüpheli" sekmesi (moderatör + yönetici,
`anomalies.view`). Sunucu otoriter olduğu için kalan risk ÇOKLU HESAPLA DEĞER
AKTARMAKTIR: hediye hunisi (çok sayıda YENİ hesaptan hediye), tekrarlayan
alım-satım çifti, yeni hesaptan yüksek hediye çıkışı. Eşikler
`config/anticheat.config.json` (başlangıç değeri; sahibi ayarlar). ⚠️ Uç
SALT OKUR — otomatik ceza/işaret YAZMA; karar yaptırım akışıyla (denetim
kaydıyla) verilir. "Yeni hesap" = İŞLEM ANINDA hesabın yaşı.
(48) **YÜK TESTİ (02.10.2026, Faz 7, §13.73)** — `tools/ops/load-test.mjs`
(bağımlılıksız; misafir kayıt + okumalar + pratik yarış). Bütçe
`ops.config.json` → `loadTest` (p95 + hata oranı); CI `build-and-test`
derlenmiş API'ye karşı koşar. ⚠️ Hedef hız sınırı KAPALI olmalı (yoksa
sınırlayıcı ölçülür); yerel olmayan adrese yalnızca `--allow-remote`.
ÖLÇÜLDÜ: tek süreç ~350-380 istek/sn'de doyar (CPU tek çekirdek, motor),
200 eşzamanlı oyuncuda bile 0 hata; daha fazlası YATAY ölçek ister — ama
zamanlayıcılar süreç içindedir, birden çok örnekte lider kilidi şart.
(49) **ZAMANLAYICI LİDER KİLİDİ (02.10.2026, Faz 13, §13.74)** —
`infrastructure/scheduler/scheduler-leader.ts`: ayrılmış havuz bağlantısında
OTURUM düzeyinde `pg_try_advisory_lock` (`ops.schedulerLeader.lockKey`, int4
dışı — `hashtext` kilitleriyle çakışmaz). Yalnızca lider örnek zamanlanmış
turları koşar; lider ölünce kilit düşer, izleyici `retrySeconds` içinde
devralır; lider `heartbeatSeconds`te kilidi `pg_locks`tan yoklar. ⚠️ YENİ bir
zamanlayıcı yazarken `scheduleNext` içinde `this.leader.runIfLeader(() =>
this.tickNow())` ŞART — `scheduler-leader.e2e-spec.ts` kaynağı tarar ve
çıplak `void this.tickNow()` görürse kırılır. `tickNow()` kapıdan GEÇMEZ
(testler/elle tetikleme). Birim testleri zamanlayıcıya `alwaysLeader` saplaması
verir. Socket.IO Redis köprüsü de VAR — bkz. (54).
(50) **KULÜP SOHBETİ + TRİBÜN EMOTE (02.10.2026, Faz 9, migration 0062,
§13.75)** — `GET/POST /clubs/:id/messages`: yalnızca ÜYE (403
`NOT_CLUB_MEMBER`; yazma `INSERT … WHERE EXISTS üyelik` — kontrolle yazma
arasında çıkarılan üye yazamaz); gövde yarış sohbetiyle AYNI kural
(`normalizeMessageBody`), web `chat.clubChat.pollSeconds` ile yoklar.
`club_messages` kişisel veri → hesap silme + dışa aktarma listelerinde.
Emote: soket `race.emote` → odaya `{ raceId, key }` (ANONİM, kalıcı DEĞİL);
kapılar: listedeki anahtar (`chat.emotes.list`, simge UNICODE — dosya değil),
abonelik, soket başına `cooldownMs`. Ekran kendi bastığını yerelde ÇİZMEZ,
sunucu yayınını bekler. Social Hub = avatar alanı (brief §50) → Faz 8 ile.
(51) **BAKİYE DÜZELTMESİ + AT ARAMASI (02.10.2026, Faz 10, §13.76)** —
`POST /admin/players/:id/balance-adjustments` (`economy.adjust`, YALNIZCA
yönetici): PARA YOLU — oyuncu `FOR UPDATE` → bakiye → `admin_audit_log`
(`player.balance_adjusted`, gerekçe + önce/sonra) → `admin_adjustment`
defter satırı (referansı denetim kaydı, kanonik `ADJUSTMENT`) TEK
transaction'da. `Idempotency-Key` ZORUNLU (kapsam: yönetici); web anahtarı
BAŞARIYA kadar saklar (`BalanceAdjustmentForm`, testli). ⚠️ Kendine ve
yönetim ekibine düzeltme 409 (kendini zenginleştirme/danışıklı iş); eksiye
düşürmek 409 ve hiçbir satır bırakmaz. Tavan + gerekçe
`moderation.config.json` → `economyAdjustment`. `GET /admin/horses?q=`
(moderatör + yönetici): kimlik/sahip kimliği/ad/sahip adı; `LIKE` jokerleri
kaçırılır. Kanonik `REWARD` etiketi artık "Ödül" (günlük ile sınırlı değil).
(52) **SALT OKUMA YÖNETİM EKRANLARI (02.10.2026, Faz 10)** — `GET /admin/config`
(game-config'in BÜTÜN `load*Config` yükleyicileri — liste elle tutulmaz;
kanonik JSON SHA-256 özeti, örnekler arası ayar farkı için), `GET
/admin/seasons`, `GET /admin/tournaments` — yalnızca yönetici (`admin.full`).
⚠️ Config dosyasına GİZLİ değer koyma: bu uç onları yöneticiye gösterir
(gizliler ortam değişkenindedir). Ayar çalışma anında DÜZENLENMEZ.
(53) **HAFTALIK/AYLIK SIRALAMA + ÖZEL YARIŞ (02.10.2026, Faz 11, §13.77)** —
`GET /leaderboard/period/:period` (`weekly`|`monthly`): sezonla AYNI kaynak
(`findRecordsInWindow`) ve AYNI formül; pencere oyunun TEK takvim saat
dilimi (`quests.timezoneOffsetMinutes`, hafta pazartesi) — "sıfırlama" veri
silmeden yeni pencereyle olur, ödül YOK. Takvim programı `featured` (lobide
"⭐ Özel yarış", liste sınırına takılmasın diye BAŞA sıralanır) ve
`horizonHours` (program kendi ufku; haftalık derbi 48 sa önceden açılır)
alabilir. ⚠️ `sunday-derby` ofseti UTC epoch'una (perşembe) göredir —
`sunday-derby.spec.ts` pazar 20:00 TR'yi kilitler. ⚠️ Takvim programı
eklerken tribün kapasitesi 500/1000/5000 olmalı (yaşandı: 10000 yazılmıştı,
`race-calendar.spec.ts` yakaladı).
(54) **SOCKET.IO REDIS KÖPRÜSÜ (02.10.2026, Faz 13, §13.78)** —
`infrastructure/realtime/redis-io.adapter.ts` (`ops.realtime.redisAdapter`,
`REDIS_URL`); `server.to(oda).emit` artık TÜM örneklere gider. ⚠️ Yarış
OYNATMASI (`race.telemetry`, `race.finished`, bekleyen `race.cancelled`)
`this.server.local.to(...)` ile YEREL yayılır — her örnek kendi izleyicisine
kendi oturumuyla oynatır; köprüden geçseydi her kare iki kez gelirdi. Yeni bir
oynatma olayı eklerken `local` kullan. İzleyici sayısı `fetchSockets` ile
küme genelidir (`adapter.rooms` YALNIZCA bu örneği sayar). Kapanışta
(`onModuleDestroy`) sayım yayını durur. Kanıt
`multi-instance-realtime.e2e-spec.ts` (iki uygulama örneği, ortak Redis).
(55) **FAZ 14 YOLCULUK + YARIŞ SAHİPLİĞİ (03.10.2026, migration 0063,
§13.79)** — `player-journey.e2e-spec.ts`: iki oyuncu bütün yüzeylerden geçer,
sonunda `bakiye = başlangıç + defter toplamı` — defter satırı yazmayan yeni
bir para yolu bu dosyayı KIRAR. Bulunan hata: pratik/PvP katılımı
`player_id` yazmıyordu, sıralama/sezon/görev/son yarışlar/tribün yarışı atın
ŞİMDİKİ sahibine yazıyordu (at satılınca sezon puanı + ÖDÜLÜ alıcıya
geçiyordu). Artık `insertEntryWithSegments` koşu anındaki sahibi yazar;
okuma sorguları `COALESCE(e.player_id, h.owner_id)`. ⚠️ Yarışı oyuncuya
bağlayan YENİ bir sorguda `h.owner_id` KULLANMA — koşturan oyuncu
`e.player_id`dir. 0063 eski satırları DEFTERDEN doldurur (defteri olmayan
ücretsiz eski satır NULL kalır, tahmin yazılmaz).
(56) **BAŞARIMLAR (03.10.2026, migration 0064, §13.80)** — `GET
/achievements`, `POST /achievements/:key/claim`; tanımlar
`config/achievements.config.json`, ilerleme YAŞAM BOYU türetilir — yarış/alım
ölçütleri görevlerin `countMetric`ini kullanır (ikinci sayım kodu YOK),
`player_level` oyuncu satırından. Ödül PARA YOLU: oyuncu `FOR UPDATE` +
ilerleme kilit altında yeniden sayılır + `achievement_claims` PK
`(player_id, achievement_key)` + `achievement_reward` defter satırı tek
transaction. Profil (`@Public`) yalnızca ÖDÜLÜ ALINMIŞ başarımları gösterir
(`achievements` artık dizi, `null` değil). ⚠️ Antrenman/bakım ölçütü başarım
YAPILMAZ: o tablolar oyuncuya değil ATA bağlıdır — at satın alarak
başkasının emeğiyle ödül açılırdı (`achievements.spec.ts` kilitler).
`achievement_claims` silme + dışa aktarma listelerinde.

**✅ ÜCRETLİ LOBİ YARIŞI ARTIK KOŞUYOR — ÖDÜL DAĞITIMI VAR (§13.14,
28.09.2026).** `POST /races/:id/settle` yarışı koşar, ödülleri `top5`
paylarıyla dağıtır ve `races.status = 'finished'` yazar. Uç bir
"crank"tir: kimliği doğrulanmış HERHANGİ bir oyuncu çağırabilir, katılımcı
olması gerekmez. **30.09.2026'dan beri zamanlayıcı da aynı use-case'le
kesinleştirir** (yukarıdaki (3)); ikisi yarışırsa ikincisi 409 alır. Tekrar koruması `Idempotency-Key`
DEĞİL, `scheduled → finished` geçişinin kendisidir (ikinci çağrı 409
`RACE_NOT_SETTLEABLE`).

**✅ `race_starting` BİLDİRİMİ ARTIK ÜRETİLİR (§13.24, 28.09.2026).**
`RaceLockScheduler` — projenin **İLK ZAMANLAYICISI** — `startTime`ı geçmiş
lobi yarışlarını `locking`e geçirir; bildirim AYNI transaction'da yazılır.
⚠️ Zamanlayıcı **`NODE_ENV=test` iken ve `lockScheduler.enabled=false`
iken KAPALIDIR** (e2e saati kendi sürer: `tickNow()`), yani üretim
yapılandırmasına bağlıdır.

**⚠️ BOT PAYI YANAR.** Kadro `fieldSize`a botlarla tamamlanır
(`aiFillEnabled`, bkz. §13.25) ve botların `player_id`'si yoktur — bota
düşen ödül KİMSEYE ödenmez ve havuzda kalır. Bu bilinçlidir: aksi hâlde
bir oyuncu kendi yarışını açıp tek gerçek katılımcı olarak havuzun çoğunu
geri alabilirdi. Sonucu: gerçek oyuncu sayısı azken yarış oyuncu için
KAYIPTIR.

**⚠️ `fieldSize` ≠ GERÇEK OYUNCU SAYISI — KURAL SAF FONKSİYONDADIR
(§13.25).** `domain/race/field-composition.ts` → `resolveFieldComposition`.
`settle-race.use-case.ts` bot sayısını **kendi hesaplamaz**, bu fonksiyonu
tüketir; `fieldSizes` de koda gömülmez, `config/race-lobby.config.json`dan
gelir. Yeni bir saha kuralı yazacaksan **oraya** yaz (saf = veritabanısız
tam matris test edilebilir).

**⚠️ `aiFillEnabled` ARTIK GERÇEKTEN OKUNUR — ÖLÜ CONFIG BİR TUZAKTIR
(§13.25).** 28.09.2026'ya kadar bu değer **hiçbir kod tarafından
okunmuyordu**: `false` yapmak sahada tek bir botu bile eksiltmiyordu ve
bunu **ne derleyici ne hiçbir test** söylüyordu. Bir config değerinin
hiçbir etkisi olmaması, o değerin hiç olmamasından **daha kötüdür** —
okuyan onu "kapatma düğmesi" sanar. **Yeni bir config alanı eklerken
onu OKUYAN kodu ve onu DÜŞÜREN bir testi aynı dilimde yaz**; yoksa
`game-config` tipi ile gerçek davranış sessizce ayrışır.
⚠️ `aiFillEnabled = false` üretimde **oyuncu aleyhinedir** (yarış eksik
koşar, boş koltuklar kimseye yaramaz); varsayılanı `true`dur.

**⚠️ `RaceSettlementPlace`te `isBot` YOKTUR — `participantType` VARDIR
(§13.25).** `'human' | 'ai'`. Yanıt ayrıca `jockeyId`, `startingStats`
(8 sayı) ve `finalTimeMs` taşır. `isBot`u geri eklemek **ikinci bir
doğruluk kaynağı** doğurur. `isBot` adı hâlâ
`RaceTimelineEntrantView`/`RaceRosterEntrant`ta (zaman çizelgesi/roster)
kullanılır — o ayrı bir sözleşmedir, **değişmedi**.

**⚠️ `startingStats` DONDURULMUŞ SNAPSHOT'TAN OKUNUR, canlı statlardan
DEĞİL (§13.25).** `race_entries.horse_snapshot` (migration 0042) →
`pickStartingStats`. Canlı `horse_stats` okunsaydı, sonucu **açıklayan**
sayılar ile sonucu **üreten** sayılar ayrışırdı ve bu hiçbir yerde hata
üretmezdi. `pickStartingStats` bilinçli bir **alt kümedir** ve
**kopyalar** (referans geçirmez — aynı nesne motora da gider).

**⚠️ BOT SNAPSHOT'I `?? null` İLE GEÇİŞTİRİLMEZ (§13.25).**
`RaceEntry.horseSnapshot` NULLABLE'dır (gerçek atlar için kilit anında
yazılır, eski satırlarda hiç yoktur) — ama **botlar için her zaman
vardır** (`generateBotEntrants` üretir, use-case doğrudan geçirir).
`null` bir bütünlük hatasıdır: sıfırlarla bir `startingStats` uydurmak
yanıta **yanlış** sayı koyar. `assertBotSnapshot` **patlar**.

**⚠️ "AI'YE GİZLİ BONUS" TESTLE ELE VERİLİR (§13.25).** Bot statları aynı
seed ile **yeniden üretilip** yanıttaki sayılarla **birebir**
karşılaştırılır (`generateBotEntrants(n, seed)`). Motora giren girdi ile
oyuncuya gösterilen sayı arasına bir çarpan girse test **kırılır**.

**⚠️ BRIEF'İN "8/0/8" SENARYOSU SUNUCUDA İMKÂNSIZDIR (§13.25).**
`checkRaceSettleable`/`checkRaceLockable` `joinedPlayers < 1` durumunu
`NO_PARTICIPANTS` ile keser; ödül havuzu **gerçek giriş ücretlerinden**
oluşur, boş sahanın havuzu yoktur. `resolveFieldComposition` bunu
`NO_HUMAN_PLAYERS` ile **ikinci kez** reddeder. Ulaşılabilir matris **1
gerçek oyuncudan** başlar. Bu senaryoyu "geçirmek" için kapıyı gevşetmek,
parasız/ödülsüz bir yarışa izin vermek olurdu.

**⚠️ PARA MUTABAKATI — İKİ ÖLÇÜM TUZAĞI (§13.26).** Bir para testi yazarken:
(1) **"Önce" bakiye ölçümü KATILIMDAN ÖNCE alınır.** Sonra alınırsa ödenen
giriş ücreti gizlenir ve defter (`−200`) ile bakiye farkı (`+10`) **tam
olarak ücret kadar** ayrışır — yaşandı, dört test birden düştü. (2)
**`net = 0` yalnızca İPTAL sonrası doğrudur.** **Terk edilmiş** bir yarışta
kalan oyuncunun ücreti hâlâ havuzdadır; doğru iddia `net = −kalan ücret`tir
(yaşandı: `toBe(0)` yazılmıştı, test −100 görüp düştü — **test haklıydı**).

**⚠️ İKİ AYRI HAVUZ MODELİ YAN YANA YAŞAR — KARIŞTIRMA (§13.26).**
**Pratik** yarış: `computeRacePool(tier) = entryFee × fieldSize`, botlar
ödemiş **sayılır** (havuz oyuncunun ödediğinden büyüktür). **Lobi** yarışı:
havuz = `entryFee × GERÇEK oyuncu sayısı`, botlar hiçbir şey ödemez.
`docs/ECONOMY.md` §4.1.1'in tablosu **pratik** modeli anlatır; lobi için
ona bakmak yanıltıcıdır. İkisi de bilinçli, ikisi de **korunur**.

**⚠️ PLATFORM PAYI VE BOT ARTĞI İÇİN HESAP SATIRI YOKTUR (§13.26).**
`raceRake` payı ve bota düşen ödül oyuncu ekonomisinden **çıkar**, başka bir
hesaba **girmez**; mutabakatta `−(platformPayı + botArtğı)` olarak görünür.
"Kesilen para nerede" sorusunun bugünkü cevabı budur — uydurma bir "ev
hesabı" açmak, bakiyesi olmayan bir satır uydurmak olurdu.

**⚠️ ÖDÜL SIRASI SİMÜLASYON SONUCUDUR — TESTİ KARARSIZ KURMA (§13.26).**
"En az bir oyuncu ödül aldı" gibi bir iddia **botlu** sahada kurulamaz: 2
gerçek oyuncu 8 atlık sahada ilk beşe girmeyebilir ve seed her koşuda
yenidir. O iddia yalnızca **botsuz** sahada kararlıdır (orada ödül sırasının
tamamı gerçek oyuncudur).

**⚠️ `locking` DURUMU — ÜÇ KAPI AYNI ANDA AÇIK OLMALI (migration 0042,
§13.24).** Zamanlayıcı `startTime`da yarışı `locking`e alır ve kadroyu +
seed'i + `horse_snapshot`ı **dondurur**. Bu durum **kesinleştirilebilir**
(`checkRaceSettleable`), **iptal edilebilir** (`checkRaceCancelable`) ve
**kilitlenebilir** olmak zorundadır. Birini kapatmak **kalıcı para kilidi**
doğurur: `checkRaceLeavable` `startTime` sonrası ayrılmayı kapattığı için
oyuncu parasını hiçbir yoldan geri alamaz — ve bu hiçbir yerde hata
üretmez. Yeni bir kapı yazarken `RaceStatus`e `locking` eklendi mi diye
sor.

**⚠️ YENİ BİR `RaceStatus` EKLERKEN ÜÇ YER:** (1)
`domain/race/race-lifecycle.ts` — `Record<RaceStatus, ...>` tam olmalıdır
(eksik anahtar **tsc hatası** verir, sessizce izin vermez), (2) migration
`races.status` CHECK'i — **eski kısıt ADIYLA düşürülür**
(`races_status_check` → `races_status_valid`; ikisi birlikte yürürlükte
kalsaydı yeni durum **çalışma anında** reddedilirdi ve derleyici susardı),
(3) `test/domain/race/race-lifecycle.spec.ts` migration'ı **okuyarak**
karşılaştırır.

**⚠️ `finished → cancelled` YASAKTIR ve bu bir para kuralıdır.** Koşmuş
yarışta iade, kazanana ödenen `race_prize` değil oyuncunun ödediği giriş
ücreti olurdu = **makul görünen yanlış tutar**. `cancelled`/`finished`
**çıkışsızdır**.

**⚠️ SEED KİLİT ANINDA DOĞAR, kesinleşmede DEĞİL** — ve `randomUUID()`
kullanır. CLAUDE.md'nin `Math.random()` yasağı **motorun İÇİNDEKİ**
rastgelelik içindir (motor `deriveRandom(seed, ...)` ile determinist
olmalı); seed'in KENDİSİ rastgele olmak zorundadır, yoksa sonuç önceden
hesaplanabilirdi. `raceId`yi seed yapmak bu yüzden yasaktır.

**⚠️ `RaceEntrantSnapshot` `ports/race.repository.ts`ten İTHAL EDİLEMEZ**
(`TS2459` — port onu yeniden ihraç etmez); `@at-sevdalisi/shared-types`tan
alınır.

**⚠️ DONDURULMUŞ SNAPSHOT TESTİ EĞİTİM API'SİYLE YAZILMAZ.** `applyTraining`
`statGain`i meşru şekilde **0** olabilir; o zaman iddia **boş** olur ve
test yeşil kalırken hiçbir şey kanıtlamaz. Test **SQL ile** stat bump eder
ve ÖNCE artışın gerçekten olduğunu iddia eder (§13.24).

**⚠️ KOPMA VERİTABANINA DOKUNMAZ — "CLIENT DISCONNECT ≠ HORSE REMOVED"
(§13.27).** `RaceGateway.handleDisconnect` **hiçbir satır yazmaz**: yalnızca
`client.data.raceIds`i gezip izleyici sayacını tazeler. Oyuncunun bağlantısı
kopunca **kadrodan düşürülmesi**, parasının iade edilmesi ya da atının
yarıştan çıkarılması diye bir davranış **yoktur ve eklenmemelidir**. Odalardan
çıkarma işini Socket.IO kendisi yapar. Yeni bir "kopan oyuncuyu temizle"
mantığı eklemek, ödeme yapılmış bir yarıştan atı sessizce siler ve bu
**hiçbir yerde hata üretmez**.

**⚠️ KOPMA TESTİ SOKETSİZ YAZILMAZ — VAKUM TUZAĞI (§13.27).** "Soket hiç
açma, SQL'e dokunma, sonra 'değişmedi' de" demek **yeşil ama boş** bir test
üretir: hiç tetiklenmemiş bir kod yolu hakkında hiçbir şey söylemez. Gerçek
bir `socket.io-client` bağlanıp `disconnect()` çağrılmalıdır. **Ama
`disconnect()` istemcide ANINDA döner, sunucu olayı ASENKRON işler** — bu
yüzden kopmadan sonra beklenmesi gereken şey **ikinci bir tanık soketin**
aldığı `race.spectators` yayınıdır (o yayın `handleDisconnect`'in içinden
çıkar). Bariyer olmadan test "sunucu yapmadı" ile "sunucu henüz işlemedi"yi
ayırt edemez.

**⚠️ KOPMA TESTİNDE `status`'E BAKMAK YETMEZ (§13.27).** Bir hata satırı
`cancelled` yapmadan da bozabilir: `horse_snapshot`ı temizlemek,
`gate_position`ı sıfırlamak, `player_id`yi NULL'a çekmek. Satırlar
`JSON.stringify` ile **bütün** olarak karşılaştırılır.

**⚠️ "SUNUCU YENİDEN BAŞLATMA" TESTİ İKİNCİ UYGULAMA ÖRNEĞİDİR, SÜREÇ
DEĞİL (§13.27).** `bootstrapTestApp()`i ikinci kez çağırmak, korumanın DI
konteynerine/örneğe özgü bellekte değil **veritabanı durumunda** yaşadığını
kanıtlar. İki örnek **aynı Node sürecini** paylaşır, yani `module`-scope bir
önbelleği **yakalayamaz** — bu sınır test dosyasında yazılıdır. Gerçek bir
`SIGKILL` sırasında yarıda kalan transaction'ın güvencesi uygulama kodu değil
Postgres'in atomikliğidir (`withTransaction`) ve testten taklit edilemez.

**Sahibinin cevabını bekleyen tek kritik soru:** 3D/ses varlıkları nereden geliyor?

## Sıradaki iş

**BRIEF §42 PHASE İLERLEMESİ (29.09.2026) — 8/8 BİTTİ.**
PHASE 1 (kilit + yaşam döngüsü, §13.24) · 2 (gerçek oyuncu/bot ayrımı,
§13.25) · 3 (ekonomik mutabakat, §13.26) · 4 (kopma / yeniden başlatma
güvenliği, §13.27) · **5 (denge ölçümü — 265.125 simülasyon, §13.28 +
`docs/RACE_BALANCE_REPORT.md`)** · **6 (jokey/kişilik/taktik motor etkisi —
`1b12a86` + `7d9f814` + `7703b5e`, CI #226 ✅)** · **7 (tribün/sosyal/canlı
birleştirme, §13.32)** · **8 (`docs/FINAL_PROJECT_AUDIT.md` — 51 özellik ×
12 kolon)**.

**SONUÇ BELGELERİ:** `docs/PROJECT_STATUS.md` (kısa "bugün neredeyiz") ·
`docs/FINAL_PROJECT_AUDIT.md` (özellik-özellik denetim) ·
`docs/FINAL_ACCEPTANCE.md` (27 maddelik kapanış kapısı) ·
`docs/RACE_BALANCE_REPORT.md` (ölçüm). **51 özelliğin 32'si üretime hazır;
`MISSING`/`BROKEN`/`UI ONLY`/`NOT WIRED` sayısı SIFIR.**

⚠️ **`docs/FINAL_ACCEPTANCE.md`'deki 27 maddenin HER BİRİ bir test
dosyasına dayanır.** Yeni bir kabul maddesi eklerken kanıt kolonuna
**test dosyası yaz** — "dosya var" ya da "uç nokta var" kabul değildir.
Uçtan uca akış `apps/api/test/api/final.e2e-spec.ts`tir; bu dosya
`test/api/` altındadır, yani `.claude/verify-admin.mjs`in api vitest
grubu onu **zaten koşar** (ayrı gruba eklemek gerekmez).

⚠️ **YENİ BİR E2E DOSYASI ADLANDIRIRKEN — VİTEST KALIBI NOKTA İSTER
(29.09.2026'da yaşandı).** `apps/api/vitest.config.ts` include kalıbı
`test/**/*.e2e-spec.ts`tir; `*` ile `e2e` arasında bir **nokta** vardır.
`final-e2e-spec.ts` (tire) bu kalıba **UYMAZ** → dosya hiç koşmaz. Ve
koşan komut `--passWithNoTests` taşıyorsa sonuç **YEŞİL ama BOŞ** olur:
"hiç test koşmadı" ile "hepsi geçti" ayırt edilemez. Doğru ad
`final.e2e-spec.ts`. Bir betiğin çıktısında **`No test files found`**
görürsen o koşum bir kanıt DEĞİLDİR — `Test Files 1 passed` görmelisin.
Aynı tuzak, var olmayan bir yolu `vitest <yol>` diye vermekle de kurulur.

⚠️ **Bir sonraki dilimi seçerken `docs/FINAL_PROJECT_AUDIT.md` §5'i oku** —
orada kalan 19 madde öncelik sırasıyla listelenmiştir. En büyük üçü:
yönetim paneli (7 uç hazır, arayüz yok), blok/şikâyet arayüzü (4 uç hazır),
`username` alanının üç sosyal yüzeye eklenmesi (tek alan, üç yüzey açılır).

**DİKKAT — 27.09.2026'da yapılan bir tarama, eskiden burada yazan 5'li listenin
YANILTICI olduğunu gösterdi.** Bu bölüm iki kez bayatladı; aşağısı
27.09.2026 akşamı itibarıyladır.

**⚠️ brief §35 "Gerekli ekranlar" — 29.09.2026 İTİBARIYLA KAPANDI.**
`/notifications` (§13.21), `/profile/:username` (§13.22), `/wallet`
(§13.23) ve **`/races/[raceId]/watch` (§13.32, PHASE 7.5)** **yazıldı**.
Sonuncusu brief'in "`/races/:id/spectate`" maddesinin karşılığıdır — ama
**`GET /races/:id` İCAT EDİLMEDİ**: sayfa mevcut
`GET /races/:id/timeline` ucunu kullanır ve `GetRaceTimelineUseCase`in
yetki kapısını (katılımcı VEYA ücretsiz tribün VEYA bilet) aynen yeniden
kullanır. Ayrıca **`/replays/[raceId]` bu iş için YETMEZ**: o ekran statik
HTTP replay'idir, socket **açmaz**, yani `race:${raceId}` odasına girmez ve
izleyici sayılmaz — tribün sohbeti orada ölü kalırdı.

**`/messages`** — gelen kutusu + konuşma zaten `/friends` içinde çalışıyor;
ayrı bir sayfa aynı yüzeyi İKİNCİ kez yapmak olurdu. **`/gifts`** — hediye
gönderimi kabul edilmiş arkadaşlık şartına bağlıdır, yani hediye yüzeyi
ZATEN arkadaş listesidir; ayrı sayfa kopya olurdu. **Bu ikisini "yapılacak"
sanıp yeniden açma.**

- ~~**`PedigreeTree.tsx` — ARTIK YAPILABİLİR.**~~ **BAĞLANDI.**
  `apps/web/src/app/stable/page.tsx:365` bileşeni render eder; veri kaynağı
  `GET /horses/:id/pedigree` (§13.2). Bu madde 29.09.2026'ya kadar
  "bağlanmadı" diyordu ve **bayattı**. Yetiştirme (yazma) yüzeyi de
  **BAĞLANDI** (`BreedingPanel` → `/stable`, 29.09.2026).
- ~~Sohbet/tribün arayüzü~~ **BAĞLI** — `RaceChatPanel` + izleyici sayısı
  `LiveRaceViewer`/`RaceHud` üzerinden (§13.5).
- ~~Bildirim/davet arayüzü~~ **YAPILDI (§13.21, 28.09.2026)** —
  `/notifications` sayfası §13.11'in beş ucunu ve üç olayını tüketiyor.
  `race_starting` artık kilit anında ÜRETİLİR (§13.24). Bir de `/notifications` şeride eklendi; **gezinti listesi
  `nav-links.ts`'te** ve `top-bar-nav.spec.ts` sayfası olmayan bir
  bağlantıyı CI'da kilitler.
- ~~Sosyal profil arayüzü~~ **YAPILDI (§13.22, 28.09.2026)** —
  `/profile/[username]`. Arkadaş listesi ve sıralama tablosu da artık
  `username` taşır (29.09.2026) — başkasının profiline gidilebilir.
- ~~Blok/şikâyet arayüzü~~ **YAPILDI (29.09.2026)** — profil "Güvenlik"
  paneli + `/friends` "Engellenenler".
- ~~Yönetim paneli arayüzü~~ **YAPILDI (29.09.2026)** — `/admin`, yedi ucun
  yedisi de tüketilir. **§34'ün race kontrolleri:** `Cancel`
  YAZILDI (PARA YOLU: iade + aynı transaction'da defter + denetim
  günlüğü), `Finish` başka uçta (§13.14), **`Pause` MÜMKÜN DEĞİL** —
  `races.status`'ta `paused` yoktur ve `in_progress`u yazan hiçbir kod
  yoktur (yarış `scheduled`dan doğrudan `finished`a geçer), yani
  duraklatılacak bir "koşan yarış" kavramı sunucuda MEVCUT DEĞİLDİR.
  **`Chat Reports` de YOK ve uydurulmamalıdır:** sohbete bağlı şikâyet
  diye bir olgu projede yoktur (`player_reports` bir OYUNCUYA bağlıdır,
  mesaja değil).
- **ROL ATAMA (02.10.2026, (44)).** İLK yönetici hâlâ elle açılır (`UPDATE
  players SET is_admin = true WHERE ...`); sonrakileri bir yönetici
  `/admin` → Oyuncular → Yönet ile verir (denetim günlüğüne yazılır, kendi
  rolünü değiştiremez).
- **PHASE 13 (bildirim üreticileri) — SEKİZ/SEKİZ YAPILDI (§13.13/§13.14/
  §13.24).** Sekiz türün SEKİZİ de üretiliyor: `race_invite` (§13.11) +
  `friend_request`, `friend_accepted`, `message_received` (§13.13) +
  `gift_received` (§13.13.1, para yolu) + `race_finished`, `prize_won`
  (§13.14) + **`race_starting` (§13.24 — 28.09.2026; kilit anında, aynı
  transaction'da).** `race_starting`'in üreticisiz kalmasının tek sebebi
  projede zamanlayıcı olmamasıydı; `RaceLockScheduler` o boşluğu kapattı.
- **PHASE 5 (denge ölçümü) — YAPILDI (§13.28, 29.09.2026).** 265.125
  simülasyon (5 saha boyutu × 5 koşum × 10.000) koşuldu, CI'da kilitlendi
  ve rapor üretildi. **⚠️ ÖLÇÜLEN BULGU: motorun SÜRPRİZ PAYI DARDIR** —
  üretim lobilerinde favori ortalama `1/N`in 4.9-8.0 katı kazanıyor, en
  kötü lobide %99.8, ve 500 yarışta hiç kazanmayan botlar var. Kök neden
  `randomFactorRange: [-6,6]`nın 8 segment boyunca ortalanıp ~1.2 puana
  inmesi. **BİLEREK DÜZELTİLMEDİ** (config değişikliği dondurulmuş
  snapshot replay'ini bozar). Yeni bir denge dilimi açarken önce
  `docs/RACE_BALANCE_REPORT.md` §2c/§4a/§7.6'yı oku.
- ~~`GltfAssetLoader.tsx` / `createHtmlAudioBackend()` — asset olmadan
  anlamsız~~ **BAĞLANDI (01.10.2026, 3D adım 4 ve 9)** — "dosya gelince kod
  değişmesin" diye. Ses olayları motordan değil ekrandaki durumdan türetilir
  (`deriveRaceAudioCues`). Dosya yokken davranış öncekiyle aynıdır.
- `PlayerDemoWidget.tsx` — **gereksiz.** İşlevi ana sayfa (`usePlayer`/
  `apiClient`) tarafından zaten yapılıyor; bağlamak ikinci bir base-url
  kaynağı doğurur.

**⚠️ `in_progress` HÂLÂ ÖLÜDÜR (§13.24).** Tabloda ve geçiş çizgesinde
durur (miras), ama onu **yazan hiçbir kod yoktur**: yarış `locking`ten
doğrudan `finished`a geçer. "LIVE RACE" aşaması **simülasyon anlık
görüntüsüdür, gerçek zamanlı koşu değildir** — motor tek seferde koşar.
Bu yüzden brief §42 PHASE 1'in `STARTING`/`RUNNING`/`FINISHING`/
`SETTLING`/`REFUNDING` durumları **eklenmedi**: hiçbir kodun yazmadığı
durumlar uydurmak, `Pause`un imkânsız olmasıyla aynı gerekçeyle yanlış
olurdu.

**⚠️ DENGE ÖLÇÜMÜ ARTIK KODLA KİLİTLİDİR (§13.28).** Ölçüm mantığı
`apps/api/test/domain/race/race-balance-harness.ts`'te **tek** yerde durur
ve iki tüketicisi vardır: `race-balance.spec.ts` (CI eşikleri) ve
`apps/api/tools/race-balance-report.ts` (rapor). **Yeni bir denge sorusu
soracaksan harness'a ekle** — ayrı bir ölçüm kodu yazmak, rapor ile CI'ın
ölçtüğü şeyi ayırır ve "yeşil CI"nın kanıtladığı şey raporun anlattığı şey
olmaktan çıkar. ⚠️ Harness `test/domain/race/` altındadır, yani
`verify-admin.mjs` grubu 1/3 onu **zaten koşar**.

**⚠️ ÖLÇÜLEN KÖTÜ DEĞER EŞİK YAPILMAZ.** `race-balance.spec.ts` "alt yarı
hiç kazanmıyor" ya da "en kötü lobide favori %99.8" gibi değerleri
**kilitlemez**: bunlar bir iyi durum değildir ve düzeltilince CI kırmızıya
dönmemelidir. Kilitlenen şey *kırılmaması gerekenlerdir* (determinizm, sıra
bütünlüğü, favori < 0.995, hiçbir stil ölü/baskın değil, mesafe sonuca
giriyor). Ölçülen risk raporda yaşar, eşikte değil.

**Bitmiş sayılacaklar (yeniden yapma):** telemetri zenginleştirme
(`fatigueLevel`/`paceScore`, migration 0029) · Camera Director · Photo Finish
sunumu · **toz VFX'i (`DustParticles` → `RaceScene3D`, 27.09.2026)** · **soy
ağacı okuma + yazma (§13.2/§13.4)** · **yarış sohbeti + izleyici sayısı
(§13.5, 27.09.2026)** — son üçü `LiveRaceViewer`/`RaceViewer`/`RaceHud`'a BAĞLI ·
**ödül havuzu + çarpan (§13.10, PHASE 5)** · **bildirimler + yarış daveti
(§13.11, PHASE 11)** · **arkadaşlık/mesaj/hediye bildirim üreticileri
(§13.13 + §13.13.1, PHASE 13 — yalnızca bu dördü)** · **ÖDÜL DAĞITIMI —
`POST /races/:id/settle` (§13.14, PHASE 13.14)** · **SOSYAL PROFİL —
`GET /players/profile/:username` (§13.15, PHASE 14)** · **BLOK / ŞİKÂYET —
brief §33 (§13.16, PHASE 15'İN İLK YARISI)** · **YÖNETİM — rol + denetim
günlüğü + moderasyon kuyruğu (§13.17, PHASE 15-B)** · **YÖNETİM OKUMA
EKRANLARI — Users/Races/Transactions (§13.18, PHASE 15-B)** · **YARIŞ
İPTALİ — `POST /admin/races/:raceId/cancel` (§13.19, PHASE 15-B, PARA
YOLU)** · **BİLDİRİM EKRANI — `/notifications` + gezinti şeridi (§13.21,
28.09.2026)** · **SOSYAL PROFİL EKRANI — `/profile/[username]` (§13.22,
28.09.2026)** · **CÜZDAN EKRANI — `/wallet` (§13.23, PHASE 4)** —
backend; kalanların hiçbirinin istemci tüketicisi YOK.
Ayrıntı: `PROJE_DURUMU.md` §13.

**⚠️ `PlayerSummary`'de `username` VARDIR — SİLME.** Üst barın oyuncu
blogu onu kendi profiline (`/profile/:username`) bağlamak için kullanır ve
`/profile/:username` **dinamik** bir rota olduğu için `nav-links.ts`'teki
statik listeye giremez — yani bu, oyuncunun kendi profiline giden **tek**
yoludur (§13.22). Gizli bir alan değildir (profilin URL'sidir) ve
`PlayerSummary` hiçbir zaman başka bir oyuncu için üretilmez.

**⚠️ `Idempotency-Key` PARA YOLUNDA BAŞARISIZLIKTA ATILMAZ — SAKLANIR
(§13.23).** İki istemci deseni vardır ve ikisi de BİLEREK farklıdır:
`grandstand/page.tsx` her basışta **yeni** anahtar üretir (zarar: ikinci
bir *bilet*), `wallet/page.tsx` ise anahtarı `useRef`'te **tutar
değişene ya da işlem başarıyla bitene kadar** tutar (zarar: ikinci bir
*para girişi*). Fark gerçektir: yatırma yazılıp yanıt ağda kaybolursa
kullanıcı yeniden basar; yeni anahtar üretilseydi deftere **ikinci** bir
`mock_deposit` satırı düşerdi ve bu **hiçbir yerde hata üretmezdi**.
Yeni bir para yolu eklerken soru şudur: *"bu isteğin tekrarı neyi iki kez
yapar?"* Cevap "para" ise anahtar başarısızlıkta yaşamalıdır.

**⚠️ `/wallet`'taki SINIRLAR KODA GÖMÜLMEZ (§13.23).** Yükleme
alt/üst sınırı (`mockDeposit.minAmount`/`maxAmount`) ve geçmiş sayfa
boyutu (`walletHistoryDefaultLimit`) `loadEconomyConfig()`'ten okunur.
Sunucu reddederken ekranın "geçerli" demesi, sessizce üretilen bir
yalandır. `mockDeposit.enabled === false` ise form **gösterilmez**
(kill switch'e uyulur, gizlenmez).

**⚠️ YÖN METNE GÖMÜLMEZ (§13.23).** `LEDGER_TYPE_LABELS` etiketleri
yönsüzdür ("Yem alımı", "Yem aldın" değil) ve içlerinde `+`/`−`
geçmez — `ledger-labels.spec.ts` bunu iddia eder. Yönün tek kaynağı
sunucunun **işaretli** `amount`'udur; ikinci bir yön kaynağı, ikisinin
çeliştiği bir durum üretir.

**⚠️ YEREL HARNESS'TE `test/domain/race` HİÇ KOŞMUYORDU (28.09.2026'da
düzeltildi, §13.24).** Domain grubu yalnızca `test/domain/admin`,
`test/domain/social` ve `test/security` dizinlerini çağırıyordu; bu
dizine yazılan bir test "yerelde doğrulandı" sanılırken **hiç koşmamış**
olurdu ve **yeşil harness çıktısı bunu ele vermez**. Yeni bir test
dizini yazarsan `.claude/verify-admin.mjs`teki gruba EKLE.

**⚠️ YEREL HARNESS'E ÜÇÜNCÜ VITEST GRUBU EKLENDİ (§13.21).** `.claude/
verify-admin.mjs` eskiden yalnızca `apps/api` testlerini çağırıyordu;
`apps/web/test/...` altına yazılan bir test "yerelde doğrulandı"
sanılırken **hiç koşmamış** olurdu ve **yeşil harness çıktısı bunu ele
vermez**. Yeni grup `cwd: apps/web` ile koşar (CI `--workspaces` ile her
workspace'i kendi dizininden çalıştırır — `process.cwd()`e bakan test
yerelde geçip CI'da düşerdi, §7.2 dersi).

**⚠️ §34 "Cancel Pause Finish" — ÜÇÜNÜN DURUMU (28.09.2026).**
`Cancel` = `POST /admin/races/:raceId/cancel` (§13.19) · `Finish` =
`POST /races/:id/settle` (§13.14, yönetime ÖZEL DEĞİL — ikinci uç
bilinçli olarak eklenmedi) · **`Pause` İMKÂNSIZDIR**: `races.status`
CHECK'inde `paused` yoktur ve `in_progress`u yazan hiçbir kod yoktur, yani
duraklatılacak bir durum yoktur. Bu, `race-cancel.spec.ts`te **migration
dosyası okunarak** kanıtlanır (migration'a `paused` eklenirse test kırılır).

**⚠️ İPTAL BİR PARA YOLUDUR — ÜÇ KURAL BOZULMAMALI (§13.19).**
1. **İade tutarı DEFTERDEN okunur** (son `lobby_race_entry_fee` satırının
   `-amount`u), `races.entry_fee` sabitinden DEĞİL — indirimli girmiş bir
   oyuncuya yanlış tutar ödenmesin diye.
2. **Durum kuralı `FOR UPDATE` ALTINDA koşar** (repository'ye geçirilen
   `mutate` geri çağrısının içinde): "iptal edilebilir mi" ile "iade et"
   arasında TOCTOU penceresi kalırsa **çift iade** mümkün olur ve bu
   hiçbir yerde hata üretmez.
3. **Katılım satırı SİLİNMEZ, `cancelled` işaretlenir** —
   `race_entries_race_player_uq` kısıtı `status`tan bağımsızdır; silmek
   aynı oyuncunun yarışa yeniden katılmasına kapı açardı.
Ayrıca: bot payı iade EDİLMEZ (havuz yine de sıfırlanır) · `finished`
yarış iptal EDİLEMEZ (kazanana ödenen `race_prize` değil, ödediği giriş
ücreti iade edilirdi = makul görünen YANLIŞ tutar) · zaman kuralı YOKTUR
(`startTime` geçmiş ama hâlâ `scheduled` yarış iptal edilebilir, yoksa
havuz kalıcı kilitlenirdi) · denetim kaydı AYNI transaction'da yazılır ·
`IdempotencyInterceptor` eklenmedi: çift iadeyi `scheduled → cancelled`
geçişi zaten engelliyor.

**PHASE 16 (güvenlik/hız sınırı) BÜYÜK ÖLÇÜDE KAPANDI — §13.20.**
Brief §31 (istemci otorite değildir) ve §32 (Chat/Messages/Friend
Requests/Gift/Race Join → hız sınırı) **CI'da kilitlendi**:
`apps/api/test/security/phase16-hardening.spec.ts`. Ayrıca §32'nin "spam
engelle" maddesinin açıkta bıraktığı **üç sosyal yazma rotası** kapatıldı
(`respondToFriendRequest`, `removeFriend`, `unblockPlayer`).
**Anormal davranış tespiti 02.10.2026'da EKLENDİ** ((47)): yalnızca
inceleme listesi, otomatik ceza yok; eşikler config'te, sahibi ayarlar.

**⚠️ `@RateLimit` OPT-IN'DİR — İŞARETLENMEYEN ROTA SINIRSIZDIR.**
`RateLimitGuard` yalnızca `@RateLimit(...)` konmuş rotalarda devreye girer
(bilinçli tercih, `rate-limit.decorator.ts`). Yeni bir **yazma** rotası
eklerken decorator'ı unutmak **sessiz** bir boşluk açar: ne derleyici ne
başka bir test fark eder. `SocialController` için kapalı küme iddiası
vardır (§13.20) — yeni bir yazma rotası ekleyip `@RateLimit` koymazsan
`phase16-hardening.spec.ts` **kırılır**; başka bir controller'da aynı
korumayı istiyorsan testi de genişlet.

**⚠️ `RateLimitOptions.name` SAYACI PAYLAŞIR.** Aynı `name`i iki rota
kullanırsa tek bütçeyi bölerler (kopyala-yapıştır tuzağı) — bu yüzden
`phase16-hardening.spec.ts` `name`i de sabitler.

**PHASE 15 HÂLÂ YARIMDIR.** Brief §33 (BLOCK/REPORT) bitti (§13.16) ve
**§34'ün GÖRÜNTÜLEME TARAFI neredeyse tamam** (§13.17 + §13.18): `admin`
rolü (`players.is_admin`), denetim günlüğü (`admin_audit_log`) ve **YEDİ
uç nokta** (`GET /admin/reports`, `PATCH /admin/reports/:reportId`,
`GET /admin/audit-log`, `GET /admin/players`, `GET /admin/races`,
`GET /admin/transactions`, `POST /admin/races/:raceId/cancel`) vardır —
`player_reports.status` artık `'open'`da DONMAZ, Users/Wallet/Races/
Transactions/Gifts listeleri GÖRÜLEBİLİR ve **yarış iptali (iade dahil)
ÇALIŞIR**. **KALAN:** `Pause` imkânsız, `Finish` başka uçta (§13.14);
asıl eksik **paneldir** — yedi ucun hiçbirinin istemci tüketicisi yoktur.
Yeniden yapma: §13.16 + §13.17 + §13.18 + §13.19.

**⚠️ PROFİL UCU PARA SIZDIRMAZ — BUNU BOZMA.** `GET /players/profile/:username`
`@Public()`'tir, yani yanıtına giren her alan HERKESE açıktır.
`PlayerProfileView` bu yüzden `PlayerSummary`'den `Pick`/`Omit` ile
TÜRETİLMEZ, alanları açıkça yazar (`money`/`gems` yoktur — AUDIT Bulgu S4).
`PlayerSummary`'ye bakiye türevi bir alan eklenirse profil onu
kendiliğinden ALMAZ; almamalıdır da.

**⚠️ YENİ BİR BİLDİRİM ÜRETİCİSİ EKLERKEN:** bildirim SAYAN mevcut e2e
testlerini KIRARSIN (yaşandı: `race-invite.e2e-spec.ts`, §13.13). O dosya
`makeFriends` çağırıyor ve iddiaları tüm listeyi sayıyordu. Kural: sayımı
`type`e daralt, kurulumun yan ürününü temizle.

**⚠️ BİLDİRİM, YAZILDIĞI ŞEYLE AYNI TRANSACTION'DA YAZILIR.** Para yolunda
bu pazarlık konusu değildir (§13.13.1): ayrı bir `INSERT` olsaydı, geri
alınmış bir transferin haberi alıcıda kalırdı ve bu **hiçbir yerde hata
üretmezdi**. Yeni bir üretici eklerken `withTransaction` gövdesinin içinde
kal.

**Bilinen açık hata:** YOK — 28.09.2026'da kapatıldı (§13.12). Burada eskiden
"`send-gift.use-case.ts` `recipientId`'yi yalnızca `@IsUUID()` ile doğrular"
yazıyordu; **o not BAYATTI**: `gift.controller.ts` bu alanı zaten
`isUUID()` ile koruyordu. Gerçek boşluk BAŞKA üç uç noktadaydı
(`friend-requests` → `addresseeId`, `messages` → `recipientId`,
`market/listings` → `horseId`) ve üçü de controller katmanında kapatıldı.

**Kural (yeni bir gövde-UUID alanı eklerken):** DTO'daki `@IsUUID()` YETMEZ.
Controller'da `if (!dto.x || !isUUID(dto.x)) throw new BadRequestException(...)`
yaz — altı mevcut örnek: `gift`, `breeding`, `matchmaking`, `market`
(`sellerId`), `social` (mesaj/davet), `social` (`blocks` → `blockedId`,
`reports` → `reportedId`). Gerekçe ve testler: `PROJE_DURUMU.md` §13.12.

**⚠️ ENGELLEME YÖNLÜDÜR — "kanonik çift" ARAMA.** `player_blocks`
`(blocker_id, blocked_id)` SIRALI bir çifttir; A→B ile B→A iki ayrı satırdır.
Yazma yollarının sorduğu soru "A, B'yi engelledi mi" DEĞİL, **"aralarında
herhangi bir yönde engel var mı"**dır → `isBlockedBetween` (tek sorgu, iki
yön). `friendships` gibi normalize etmeye kalkışmak engeli tek yönde
delik bırakır. Yeni bir yazma yolu eklerken `assertNoBlock` çağır; **para
yolunda** (hediye) kapı `withTransaction` İÇİNDE tekrarlanmalıdır, çünkü
engelleme arkadaşlık satırını silmez ve dıştaki `areFriends` kapısı geçer.

**⚠️ `PLAYER_BLOCKED` YÖN SIZDIRMAZ — İKİNCİ KOD EKLEME.** Engelleyen de
engellenen de 403 `PLAYER_BLOCKED` alır. Yönü ayırt eden bir kod ya da mesaj,
engellenen oyuncuya "seni engelledi" bilgisini verir; engellemenin amacı
sessiz bir mesafedir. Aynı gerekçeyle **"beni engelleyenler" listesi yoktur**
— `GET /players/:id/blocks` yalnızca tek yönü döner. `moderation.spec.ts`
hata mesajının `/engelledi|engellendi|seni/i` ile eşleşmemesini iddia eder;
mesajı "iyileştirmek" testi kırar, test haklıdır.

**⚠️ ENGEL ARKADAŞLIĞI SİLMEZ; ŞİKÂYET ENGELDEN ETKİLENMEZ.** Engel EK bir
kapıdır, `friendships` satırına dokunulmaz — aksi hâlde engeli kaldıran
oyuncu arkadaşlığını da kaybetmiş bulurdu. Şikâyet ise ne arkadaşlık arar ne
`assertNoBlock` çağırır: doğru sıra "engelle, SONRA şikâyet et"tir.

**⚠️ `blockedId`/`reportedId` GÖVDE ALANIDIR.** Yol parametresi olmadıkları
için `ParseUUIDPipe` uygulanamaz; controller'daki `isUUID()` kapısı şarttır
(yukarıdaki kural).

**⚠️ YÖNETİCİ ROLÜ TOKEN'A GÖMÜLMEZ — `players.is_admin` HER İSTEKTE
OKUNUR.** Rolü JWT'ye koymak, yetki iptalini token süresinin dolmasına
bağlardı. Yeni bir yönetim ucu yazarken `isAdmin` sorgusunu **önbelleğe
alma** ve **yetki kapısını veri okumadan ÖNCE** çağır. `assertAdmin`
use-case'in ilk satırıdır; `AdminRepository.isAdmin` önbelleksizdir.
Gerekçe: `PROJE_DURUMU.md` §13.17.

**⚠️ 403 ÖNCE, 404 SONRA — YÖNETİM UÇLARINDA IDOR KAPISI.** Yönetici
olmayan bir çağırana `REPORT_NOT_FOUND` (404) döndürmek, kimlikleri
deneyerek kuyrukta ne olduğunu yoklamasına izin verir. `ReportNotFoundError`
yetki kapısından SONRA fırlatılır; `admin.e2e-spec.ts` bunu "var olmayan
kimlik → 403, 404 değil" diye iddia eder.

**⚠️ ŞİKÂYET DURUM GEÇİŞİ KİLİDİN İÇİNDE DOĞRULANIR, DIŞARIDA DEĞİL.**
`assertReportTransitionAllowed` `updateReportStatusWithLock`un `mutate`
callback'i içinde çalışır. Dışarıda okunan bir `status` ile karar vermek
iki yönetici yarıştığında bir geçişi KAYBETTİRİR. Geçiş çizgesi kapalı bir
DAG'dır; `resolved`/`dismissed` **çıkışsızdır** ve **aynı duruma geçiş de
yasaktır** (bayat istemci göstergesi). Yeni bir durum eklersen
`REPORT_STATUSES`ı `player_reports.status` CHECK'iyle hizalı tut —
`moderation-queue.spec.ts` migration dosyasını **okuyarak** karşılaştırır.

**⚠️ DENETİM KAYDI YAZILDIĞI ŞEYLE AYNI TRANSACTION'DA YAZILIR.** Bildirim
kuralının aynısı: ayrı bir `INSERT` olsaydı geri alınmış bir güncellemenin
kaydı ortada kalırdı ve bu **hiçbir yerde hata üretmezdi**. Bu yüzden
`admin_audit_log` satırını use-case değil, **repository** (aynı `client`
üzerinde) yazar.

**⚠️ `admin_audit_log` ≠ `economy_transactions`.** Biri **yetki kaydı**
("kim hangi yönetim işlemini ne zaman yaptı"), diğeri **muhasebe defteri**
(bakiye hareketi). Bir yönetim işlemini "denetlensin" diye deftere yazmak,
defterin tek işi olan "bakiyeyi satır satır açıklama" özelliğini bozar.

**⚠️ `config/admin.config.json` BİR YETKİ KAPISI DEĞİLDİR.** Oradaki
değerler yalnızca **liste boyutudur**. Bir yetki kararını config'e koymak,
onu kaynak kodla birlikte dağıtılan ve çalışma zamanında değiştirilemeyen
bir dosyaya bağlar. **Yeni bir limit eklersen `ADMIN_LIMIT_KEYS`e de yaz**
(`moderation-queue.spec.ts`): o liste config dosyasını TAM kapsamak
zorundadır, yoksa CI kırılır — ve kırılması İSTENEN şey tam olarak budur.

**⚠️ `pg` BIGINT'İ METİN DÖNER — `Number(...)` ŞART.** `money`, `xp`,
`gems`, `amount`, `entry_fee`, `prize_pool`, `balance_before/after` ve
`COUNT(*)` `int8`dir; dönüşüm unutulursa yanıt `"money": "1250"` olur ve
**hiçbir yerde hata üretmez** — istemci `+` operatörünü birleştirme olarak
kullanır. `postgres-admin.repository.ts` bunu tek bir `toNumber()`da
toplar; `NUMERIC` (örn. `performance_score`) de aynı tuzağa sahiptir.
Yeni bir yönetim/okuma ucu yazarken yanıt alanlarının `typeof`unu
e2e'de iddia et.

**⚠️ `status IS DISTINCT FROM 'cancelled'`, `<> 'cancelled'` DEĞİL.**
`race_entries.status` **NULL olabilir** (pratik/PvP girişleri, migration
0037) ve `<>` NULL'lı satırları düşürür. Ayrılan oyuncunun satırı da
SİLİNMEZ, `cancelled` işaretlenir — sayım yapan her sorgu bu ikisini
birlikte doğru ele almak zorundadır.

**⚠️ YÖNETİM OKUMA UÇLARI BAKİYE TAŞIR — `@Public()` YAPMA.** `GET
/admin/players` ve `GET /admin/transactions` `money`/`gems` ve tüm para
hareketlerini döner. Bunlar `GET /players/profile/:username` ile AYNI
sınıf DEĞİLDİR: o uç herkese açık olduğu için bakiyeyi GİZLER, bunlar
yetki kapısı arkasında olduğu için GÖSTERİR. `@Public()` eklemek bu
ayrımı tek satırda yok eder.
