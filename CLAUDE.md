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
- **E2E çalışmaz** — Docker yok, Postgres 5432 kapalı (`ECONNREFUSED ::1:5432`).
  `npm test`'te ~185 e2e testi bu yüzden düşer; **bunlar regresyon DEĞİLDİR.**
  Birim testler (`test/domain`, `test/features`, `test/lib`) tamamen geçer.
- **Asla "çalışıyor" deme** — kanıt CI'dır, ben değilim.

## Teslimat mekanizması (bozma)

```
küçük dilim → yerel tsc doğrula → commit → git bundle → apply-<özellik>-push.bat
  → proje sahibi .bat'ı çalıştırır (bundle verify → fetch → ff-only merge → push)
  → GitHub Actions CI
```

- **Commit atmam / push etmem.** Proje sahibi istemeden dosyaları bırakırım.
- Teslimat öncesi `git fetch` + `origin/main` taban doğrulaması **şart** (yerel kopya
  geride kalmış olabilir — yaşanmış bir ders).
- "Her şeyi üzerine yaz" yerine **yalnızca değişen dosyaları** yazarım.
- Kökteki `*.bundle`, `apply-*.bat`, `check-dirty*.bat`, `outputs/`, `*-log.txt`
  gitignore'lu **scratch** dosyalarıdır — ~200 tane birikmiş, normaldir.

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
YANILTICI olduğunu gösterdi.** O iskeletlerden yalnızca İKİSİ bugün gerçekten
bağlanabilir durumda:

- **`PedigreeTree.tsx` — YAPILABİLİR, ama büyük iş.** Asset gerekmiyor (saf
  React + CSS) ama **veri zinciri hiç yok**: pedigri okuyan repository,
  `GET /horses/:id/pedigree` uç noktası ve foal doğumunda kayıt — üçü de
  mevcut değil. Önce backend, sonra UI. **Sıradaki anlamlı iş budur.**
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
sunumu · **toz VFX'i (`DustParticles` → `RaceScene3D`, 27.09.2026)** — son üçü
`LiveRaceViewer`/`RaceViewer`/`RaceHud`'a BAĞLI.
Ayrıntı: `PROJE_DURUMU.md` §13.
