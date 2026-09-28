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
- **PHASE 13 (bildirim üreticileri) — KISMEN YAPILDI (§13.13).** Sekiz
  türden BEŞİ üretiliyor: `race_invite` (§13.11) + `friend_request`,
  `friend_accepted`, `message_received` (§13.13) + `gift_received`
  (§13.13.1, para yolu). **Kalan ÜÇ tür için `INSERT INTO notifications`
  yazan bir yol YOK:** `race_starting`, `race_finished`, `prize_won` —
  üçü de yarış yaşam döngüsüne bağlı.
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
(§13.13 + §13.13.1, PHASE 13 — yalnızca bu dördü)** — backend; hiçbirinin
istemci tüketicisi YOK. Ayrıntı: `PROJE_DURUMU.md` §13.

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
yaz — beş mevcut örnek: `gift`, `breeding`, `matchmaking`, `market`
(`sellerId`), `social`. Gerekçe ve testler: `PROJE_DURUMU.md` §13.12.
