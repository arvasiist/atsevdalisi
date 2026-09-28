# AT SEVDALISI — PROJE DURUMU

**Tarih:** 29.09.2026
**Bu belge nedir:** "Bugün neredeyiz" sorusunun **kısa** cevabı. Ayrıntılı
özellik-özellik denetim `docs/FINAL_PROJECT_AUDIT.md`te; derin bağlam
`PROJE_DURUMU.md`te.

> ⚠️ `README.md` ve `docs/ROADMAP.md`nin en üstündeki faz tablosu
> **bayattır** — orada "FAZ 1-7 planlandı" yazar. Gerçek bu belgedir.

---

## 1. Tek paragraf

**AT SEVDALISI**, tarayıcıda çalışan bir **3D at yarışı + at sahipliği ve
yetiştiricilik simülasyonu + ekonomi yönetimi** oyunudur. Monorepo: Next.js 14
(`apps/web`) + NestJS 10 (`apps/api`) + PostgreSQL + Redis + Socket.IO +
Three.js. Sunucu otoritesi mutlaktır: yarış sonucunu, parayı, istatistiği ve
ödülü **yalnızca** sunucu belirler; simülasyon tek bir yerde
(`domain/race/race-engine.ts`) koşar ve deterministtir.

**Bugün:** brief §42'nin **8 kritik sisteminin 7'si bitti** (yaşam döngüsü,
gerçek oyuncu/bot ayrımı, ücretli ekonomi zinciri, kopma/iptal güvenliği,
denge ölçümü, jokey/kişilik/taktik, sosyal+tribün+canlı birleştirme).
8.'si — **final denetim belgesi — bu belgeyle birlikte yazıldı**.
51 özelliğin **32'si üretime hazır**; kalan 19'un 9'u **bilinçli** olarak
ertelendi (asset bekleyen 1, sahibin kararını bekleyen 1, tasarım gereği
istemci tüketicisi olmayan 2, oyun dengesi kararı bekleyen 5).

---

## 2. Brief §42 — 8 kritik sistem

| # | Sistem | Durum | Kanıt |
|---:|---|---|---|
| 1 | Gerçek yarış yaşam döngüsü + zamanlayıcı | ✅ **BİTTİ** | `race-lifecycle.ts` + `RaceLockScheduler`, migration 0042, §13.24 |
| 2 | 8/10/12/14/16 at + gerçek oyuncu/AI ayrımı | ✅ **BİTTİ** | `field-composition.ts` (saf), `participantType`, §13.25 |
| 3 | Ücretli yarış → motor → ödül → defter → cüzdan | ✅ **BİTTİ** | `POST /races/:id/settle`, §13.14 + §13.26 |
| 4 | İptal / iade / kopma güvenliği | ✅ **BİTTİ** | §13.19 + §13.27 (kopma DB'ye dokunmaz) |
| 5 | Yarış dengesi — ≥10.000 simülasyon | ✅ **BİTTİ** | 265.125 simülasyon, `RACE_BALANCE_REPORT.md`, §13.28 |
| 6 | Jokey + kişilik + taktiğin **gerçek** motor etkisi | ✅ **BİTTİ** | PHASE 6.1 `1b12a86` · 6.2 `7d9f814` · 6.3 `7703b5e` (CI #226 ✅) |
| 7 | Sosyal + tribün + canlı yarış tek akışta | ✅ **BİTTİ** | §13.32 + `/races/[raceId]/watch` |
| 8 | `FINAL_PROJECT_AUDIT.md` | ✅ **BİTTİ** | `docs/FINAL_PROJECT_AUDIT.md` (51 başlık, 12 kolon) |

---

## 3. Zincir kontrolü

Brief'in şartı: *"Bir özelliğin sadece dosyası veya endpoint'i mevcut diye
tamamlandı kabul etme."* Her özellik şu zincirde sınandı:

```
DATABASE ↓ BACKEND ↓ API ↓ BUSINESS LOGIC ↓ RACE ENGINE ↓ WEBSOCKET ↓ FRONTEND ↓ UX ↓ TEST
```

Zincirin **en zayıf halkası** o özelliğin durumunu belirledi. Örnek:
`domain/club/club.ts` saf mantığı ve birim testi vardır, ama onu çağıran
hiçbir use-case ve hiçbir HTTP yolu yoktur → `DOMAIN ONLY`, üretime hazır
**hayır**.

---

## 4. Üretime hazır sayıları

| Durum | Adet |
|---|---:|
| `IMPLEMENTED` | **32** |
| `PARTIAL` | 14 |
| `API ONLY` | 2 |
| `DOMAIN ONLY` | 1 |
| `MISSING` / `BROKEN` / `UI ONLY` / `NOT WIRED` | **0** |

**Toplam 51 özellik · üretime hazır 32.**

---

## 5. Kanıt

- **CI:** her fazın commit'i GitHub Actions'ta koştu. PHASE 6.3 (`7703b5e`)
  → koşum **#226 success**. PHASE 5 (`ecffb44`) → koşum **#223 success**.
- **Yerel doğrulama** (`.claude/verify-admin.mjs`): şema sıfırlama → 43
  migration → 4 `tsc` geçişi (shared-types / game-config / api / web) → tam
  api vitest paketi → tam web vitest paketi → eslint → commit + push.
- **Hızlı DB kontrolü** (`.claude/phase7-db-check.mjs`): 53 saniyede
  `insertRaceRow`u **gerçekten çalıştıran** 68 e2e testi.

**Kural:** *"Asla 'çalışıyor' deme — kanıt CI'dır."* Bu belgedeki her ✅ bir
commit hash'ine ya da koşum numarasına dayanır.

---

## 6. Bilinen açık uçlar (öncelik sırasıyla, kısa)

1. **3D/ses varlıkları yok** — proje sahibinin cevabını bekleyen **tek
   kritik soru**. Sahte/placeholder asset uydurmak yasaktır;
   `apps/web/public/` bilinçli olarak boştur.
2. **OAuth kimlik bilgileri yok** — `POST /auth/login` pratikte çalışmaz;
   istemcide gerçek giriş yok (localStorage).
3. **Yönetim paneli yok** — 7 uç + denetim günlüğü **hazır**, istemci
   tüketicisi yok. Moderasyon bugün elle SQL ile yönetiliyor.
4. **Blok/şikâyet arayüzü yok** — 4 uç hazır, oyuncu kendini koruyamıyor.
5. **Yetiştirme yüzeyi yok** — genetik + pedigri zinciri tam, oyuncuya
   kapalı.
6. **Jokey seçilemiyor ve serbest bırakılamıyor** — motora giriyor (PHASE
   6.2) ama oyuncu müdahale edemiyor; `race_entries.jockey_id` yazılır,
   geri alınmaz.
7. **`username` üç sosyal yüzeyde eksik** — `SocialPlayerView`,
   `LeaderboardRowView`, arkadaş listesi. Yüzünden başkasının profiline
   gidilemiyor.
8. **Ayrılma düğmesi yok** — `POST /races/:id/leave` sunucuda hazır.
9. **Tribün iadesinde zaman/durum penceresi yok** — bilet, yarış bittikten
   sonra da iade edilebiliyor.
10. **Matchmaking senkron** — cron/worker yok, gerçek oyuncu azken boş döner.
11. **Kulüp/sezon/turnuva/progression bağlı değil** — `DOMAIN ONLY`; yeni
    bir faz gerektirir.

**Ölçülen ama BİLEREK düzeltilmeyen risk:** motorun sürpriz payı dardır
(favori ortalama `1/N`in 4.9–8.0 katı kazanıyor). Config değişikliği
dondurulmuş snapshot replay'ini bozar. Ayrıntı:
`docs/RACE_BALANCE_REPORT.md` §2c/§4a/§7.6.

---

## 7. Sıradaki adım

**Proje sahibinin kararını bekleyen:** 3D/ses varlıkları nereden geliyor?

**Karar verilirse yapılabilecekler (asset gerektirmez, sırayla):**

1. `/admin` paneli (7 uç + denetim günlüğü ekranı).
2. Blok/şikâyet düğmeleri (`/friends` + profiller).
3. `username` alanını üç sosyal görünüme ekle → profillere gezinme.
4. `/races` listesine "Katıldın — Ayrıl" düğmesi.
5. Yetiştirme yüzeyi (`/breeding` veya `/stable` sekmesi).
6. Jokey seçim + serbest bırakma ucu ve yüzeyi.

---

## 8. Belge haritası

| Soru | Belge |
|---|---|
| Bugün neredeyiz? | **`docs/PROJECT_STATUS.md`** (bu belge) |
| Hangi özellik ne durumda? | **`docs/FINAL_PROJECT_AUDIT.md`** |
| Brief'in kapanış kapısı geçildi mi? | **`docs/FINAL_ACCEPTANCE.md`** (27 madde) |
| Yarış dengesi nasıl ölçüldü? | `docs/RACE_BALANCE_REPORT.md` |
| Neden mimari böyle / tuzaklar? | `PROJE_DURUMU.md` |
| Motor nasıl çalışır? | `docs/RACE_ENGINE.md`, `docs/ALGORITHMS.md` |
| Ekonomi kuralları? | `docs/ECONOMY.md`, `docs/ECONOMY_AUDIT.md` |
| Uç noktalar? | `docs/API.md` |
| Şema? | `docs/DATABASE.md` |
| Güvenlik? | `docs/SECURITY.md` |
| Test altyapısı? | `docs/TESTING.md` |
| Asset durumu? | `docs/ASSET_MANIFEST.md`, `docs/ASSET_LICENSES.md` |

---

## 9. Bu ortamın sınırları

- **Tarayıcı/GPU yok** → 3D/görsel değişiklik "kod doğru ama gözle
  görülmedi".
- **Docker yok**, ama makinede **PostgreSQL 18** kurulu ve e2e yerelde
  koşar. Redis 6379'da.
- **`git` PATH'te değil** → tam yol kullanılır.
- ⚠️ Tam test paketini koşmadan önce **şema düşürülür**; birikmiş veriyle
  dosyalar birbirini bozar ve **yanlış** hata verir.
