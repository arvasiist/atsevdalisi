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

Gerçek 3D/ses varlığı yok · OAuth kimlik bilgileri yok (`POST /auth/login` pratikte
çalışmaz) · frontend'de gerçek giriş yok (localStorage) · yarış takvimi yok ·
matchmaking senkron (cron/worker yok) · jokey + çiftlik/personel çarpanları
bağlanmamış · tournament/club/ranking/season/progression/breeding bağlanmamış ·
`/club` `/farm` `/leaderboard` placeholder · `PedigreeTree`/`PlayerDemoWidget`/
`GltfAssetLoader` hiçbir yere bağlı değil (`DustParticles` artık BAĞLI — §13).

**✅ ÜCRETLİ LOBİ YARIŞI ARTIK KOŞUYOR — ÖDÜL DAĞITIMI VAR (§13.14,
28.09.2026).** `POST /races/:id/settle` yarışı koşar, ödülleri `top5`
paylarıyla dağıtır ve `races.status = 'finished'` yazar. **Zamanlayıcı
YOKTUR** — uç bir "crank"tir: kimliği doğrulanmış HERHANGİ bir oyuncu
çağırabilir, katılımcı olması gerekmez. Tekrar koruması `Idempotency-Key`
DEĞİL, `scheduled → finished` geçişinin kendisidir (ikinci çağrı 409
`RACE_NOT_SETTLEABLE`).

**Bununla birlikte hâlâ eksik olan:** `race_starting` bildiriminin üreticisi
YOK — o gerçekten **zamanlayıcı** ister (başlangıç anında tetiklenen bir iş)
ve sunucuda zamanla tetiklenen hiçbir iş yoktur.

**⚠️ BOT PAYI YANAR.** Kadro `fieldSize`a botlarla tamamlanır
(`aiFillEnabled`) ve botların `player_id`'si yoktur — bota düşen ödül
KİMSEYE ödenmez ve havuzda kalır. Bu bilinçlidir: aksi hâlde bir oyuncu
kendi yarışını açıp tek gerçek katılımcı olarak havuzun çoğunu geri
alabilirdi. Sonucu: gerçek oyuncu sayısı azken yarış oyuncu için
KAYIPTIR.

**⚠️ SNAPSHOT KESİNLEŞME ANINDA ALINIR, `startTime`'DA DEĞİL.** Oyuncu
`startTime` ile kesinleşme arasında atını çalıştırıp sonucu etkileyebilir.
Kapatmak `startTime`'da tetiklenen bir zamanlayıcı gerektirir — projede
yok. `SettleRaceUseCase` doc yorumunda yazılı.

**Sahibinin cevabını bekleyen tek kritik soru:** 3D/ses varlıkları nereden geliyor?

## Sıradaki iş

**DİKKAT — 27.09.2026'da yapılan bir tarama, eskiden burada yazan 5'li listenin
YANILTICI olduğunu gösterdi.** Bu bölüm iki kez bayatladı; aşağısı
27.09.2026 akşamı itibarıyladır.

- **`PedigreeTree.tsx` — ARTIK YAPILABİLİR (veri zinciri BİTTİ).**
  `GET /horses/:id/pedigree` (okuma, §13.2) ve `POST /players/:id/breeding`
  (yazma — tay doğumu pedigriye kaydolur, §13.4) ikisi de mevcut. Kalan iş
  **yalnızca UI**: bileşeni bir sayfaya bağlamak. Asset gerekmez.
- **Sohbet/tribün arayüzü (brief §35) — YAPILABİLİR.** Backend + e2e hazır
  (§13.5): `chat.message`/`chat.message.received`/`chat.history`/`chat.error`
  ve `race.spectators` olaylarının **henüz frontend tüketicisi yok**.
- **Bildirim/davet arayüzü (brief §16/§28, §42 PHASE 11) — YAPILABİLİR.**
  Backend + e2e hazır (§13.11): beş uç nokta
  (`GET /players/:id/notifications`, `read-all`, `:notificationId/read`,
  `POST .../race-invites`, `.../respond`) ve üç olay
  (`notification.created`, `race.invite`, `race.invite.responded`) —
  **hiçbirinin istemci tüketicisi yok.** Asset gerekmez.
- **Sosyal profil arayüzü (brief §24, §42 PHASE 14) — YAPILABİLİR.** Backend
  hazır (§13.15): `GET /players/profile/:username` **token'sız** çalışır ve
  `money`/`gems` taşımaz. Eksik olan yalnızca `/profile/:username`
  sayfasının kendisidir; kariyer kademesi istemcide `level`'den türetilir
  (`features/career/career-tier.ts`), `achievements` bilinçli olarak `null`
  gelir. Asset gerekmez.
- **Blok/şikâyet arayüzü (brief §33, §42 PHASE 15) — YAPILABİLİR.** Backend +
  e2e hazır (§13.16): dört uç nokta — hiçbirinin istemci tüketicisi yok.
  Asset gerekmez.
- **Yönetim paneli arayüzü (brief §34, §42 PHASE 15-B) — YAPILABİLİR
  (şikâyet kuyruğu + okuma ekranları + yarış iptali).** Backend + e2e hazır
  (§13.17 + §13.18 + §13.19): **YEDİ** uç nokta — hiçbirinin istemci
  tüketicisi yok. Asset gerekmez. **§34'ün race kontrolleri:** `Cancel`
  YAZILDI (PARA YOLU: iade + aynı transaction'da defter + denetim
  günlüğü), `Finish` başka uçta (§13.14), **`Pause` MÜMKÜN DEĞİL** —
  `races.status`'ta `paused` yoktur ve `in_progress`u yazan hiçbir kod
  yoktur (yarış `scheduled`dan doğrudan `finished`a geçer), yani
  duraklatılacak bir "koşan yarış" kavramı sunucuda MEVCUT DEĞİLDİR.
  **`Chat Reports` de YOK ve uydurulmamalıdır:** sohbete bağlı şikâyet
  diye bir olgu projede yoktur (`player_reports` bir OYUNCUYA bağlıdır,
  mesaja değil).
- **⚠️ YÖNETİCİ ATAMANIN ARAYÜZÜ YOKTUR (bilinçli).** `players.is_admin`
  şimdilik elle açılır (`UPDATE players SET is_admin = true WHERE ...`);
  testler de SQL ile yapar. Kendini yönetici yapabilen bir uç nokta
  yönetim yetkisini anlamsız kılardı. §34'ün "kullanıcı yönetimi" ekranı
  geldiğinde bu, **denetim günlüğüne yazılan** bir işlem olmalıdır.
- **PHASE 13 (bildirim üreticileri) — YEDİ/SEKİZ YAPILDI (§13.13/§13.14).**
  Sekiz türden YEDİSİ üretiliyor: `race_invite` (§13.11) + `friend_request`,
  `friend_accepted`, `message_received` (§13.13) + `gift_received`
  (§13.13.1, para yolu) + `race_finished`, `prize_won` (§13.14, ödül
  dağıtımıyla birlikte). **Kalan TEK tür: `race_starting` — ve bu bir kod
  eksikliği DEĞİL, altyapı eksikliğidir:** başlangıç ANINDA tetiklenen bir
  iş gerektirir, projede ise zamanlayıcı/cron/worker YOKTUR. `race_finished`/
  `prize_won`'un aksine bu, "bir uç noktadan çağrılır" biçiminde
  modellenemez (bir oyuncunun "yarış başladı" bildirimini kendi eliyle
  tetiklemesi anlamsız olurdu).
- `GltfAssetLoader.tsx` — **asset olmadan ANLAMSIZ.** `.glb` yokken her zaman
  yedek görünüme düşer = bugünkü kapsül+küre görüntüsünün tıpatıp aynısı.
  Bağlamak sıfır görsel etki üretir.
- `createHtmlAudioBackend()` — **asset olmadan ANLAMSIZ.** `.mp3` dosyası yok,
  üstelik motor ses olaylarını (GATES_OPEN/OVERTAKE/WINNER) hiç yaymıyor.
  Bağlanırsa sessiz bir no-op olur.
- `PlayerDemoWidget.tsx` — **gereksiz.** İşlevi ana sayfa (`usePlayer`/
  `apiClient`) tarafından zaten yapılıyor; bağlamak ikinci bir base-url
  kaynağı doğurur.

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
YOLU)** — backend; hiçbirinin istemci tüketicisi YOK. Ayrıntı:
`PROJE_DURUMU.md` §13.

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
**KALAN TEK MADDE:** anormal davranış tespiti (hız sınırı istek SAYAR,
desen TANIMAZ) — eşikler sahibinin kararı, uydurulmadı.

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
