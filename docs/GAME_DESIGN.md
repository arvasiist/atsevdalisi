# GAME_DESIGN.md — Oyun Tasarımı ve UI

> Kaynak: `docs/PROJECT_BRIEF.md` §2-3, §38-40, §47, §70, §87. Ekran
> haritası ve tasarım prensipleri; bileşen bazlı uygulama detayları FAZ 1
> içinde `apps/web/src/components` altında hayata geçirilecektir.

## 1. Ürün vizyonu (özet)

> Küçük bir ahırla başlayıp güçlü atlar yetiştiren, yarış kazanan, ekonomik
> olarak büyüyen ve kendi yarış ekosistemini kuran başarılı bir at
> sahibi/yönetici olmak.

Oyuncu bir jokey değil, **at sahibi/yönetici**dir. Bu ayrım UI'da da
yansıtılmalıdır: oyuncu atını "kontrol etmez", **hazırlar ve yönetir**;
yarış sırasında karar verici jokeydir (oyuncunun seçtiği taktik
çerçevesinde).

## 2. Ekran haritası (brief §70, birebir korunmuştur)

```text
Ana Sayfa
├── Profil / Son Yarış / Ahır Özeti / Görevler / Hızlı Erişim

Ahırım
├── At Listesi
├── At Detay (Genel / Bakım / Antrenman / Genetik / Geçmiş)
└── Ahır Yönetimi

At Pazarı
├── Liste / Filtre / At Detay / Satın Al / Satışlarım

Yarışlar
├── Takvim / Yarış Detay / Katılım / Jokey / Taktik / Yarış

Antrenman
├── At Seç / Program / Yoğunluk / Sonuç

Çiftlik
├── Ahır / Paddock / Antrenman Tesisi / Veteriner / Üreme Merkezi / Upgrade

Online
├── PvP / Matchmaking / Turnuva / Sonuçlar

Sıralama
├── Global / Türkiye / Sezon / Arkadaşlar

Kulüp
├── Kulüp / Üyeler / Görevler / Yarışlar / Sıralama
```

Next.js App Router yapısında bu haritanın karşılığı:

```text
apps/web/src/app/
├── (dashboard)/page.tsx              # Ana Sayfa
├── stable/page.tsx                   # Ahırım
├── stable/[horseId]/page.tsx         # At Detay (sekmeler: tab state)
├── market/page.tsx                   # At Pazarı
├── market/[listingId]/page.tsx
├── races/page.tsx                    # Yarış Takvimi
├── races/[raceId]/page.tsx           # Yarış Detay + Katılım + Taktik
├── races/[raceId]/live/page.tsx      # Canlı Yarış Ekranı (Three.js)
├── training/page.tsx
├── farm/page.tsx
├── online/page.tsx
├── leaderboard/page.tsx
└── club/page.tsx
```

## 3. Üst bilgi alanı (brief §2 — referans görselle birebir)

```text
[Avatar] [Oyuncu adı + Seviye + XP barı]   [Para] [Gem]  [Mesaj][Bildirim][Ayarlar][Menü]   [Saat] [Hava] [Lokasyon]
```

Bu bileşen `apps/web/src/components/layout/TopBar.tsx` olarak tüm
sayfalarda paylaşılan bir layout parçası olur; XP barı, para ve gem
değerleri gerçek zamanlı (API'den polling veya WebSocket ile) güncellenir.

## 4. Ana Sayfa kartları (brief §38)

- **Oyuncu kartı**: level, xp, money, gems
- **Ahır kartı**: at sayısı, ortalama kondisyon, sağlık uyarıları
- **Son yarış kartı**: yarış adı, mesafe, derece, sonuç
- **Hızlı işlemler**: Atını Yönet, At Pazarı, Yarışlara Katıl, Antrenman,
  Çiftlik, Online

Referans görseldeki hero alanı (büyük at/jokey/hipodrom görseli + "Son Yarış
Sonuçları" paneli) `apps/web/src/app/(dashboard)/page.tsx` üzerinde
korunacak; görsel varlıklar özgün üretilecektir (brief §2 son paragraf —
"birebir başka bir ticari oyunun kopyası olmayacak").

## 5. Ahır ekranı (brief §39)

At listesi kartları: avatar/model, level, health, energy, fitness,
fatigue, morale, race form. At detay sekmeleri: Genel Bilgi, Bakım,
Antrenman, Genetik, Geçmiş (brief §39-40).

Referans görseldeki bakım aksiyonları (Tımar, Yem Ver, Su Ver, Temizle,
Veteriner, Nalbant, Dinlendir) doğrudan `docs/API.md` §4'teki
`/horses/{id}/*` endpoint'lerine bağlanır.

## 6. Yarış ekranı (brief §2, §22-25)

Pist, atlar, jokeyler, pozisyon sıralaması, hız göstergesi, yarış zamanı,
kamera seçenekleri (Jokey Kamerası, Pist Kamerası, Son Düzlük Kamerası,
Fotofiniş), mini harita, son düzlük/sprint bilgisi, finish/photo-finish.

Bu ekran, `RaceTimeline` verisini (bkz. `docs/RACE_ENGINE.md` §5) Three.js
ile oynatan izole bir modüldür; hiçbir simülasyon mantığı içermez.

**FAZ 6'da uygulandı (basit şekillerle iskelet):** `apps/web/src/features/
race-viewer/` — pist, atlar (basit geometrik şekiller), 4 kamera modu
(Jokey, Pist, Son Düzlük, Fotofiniş), mini harita, sıralama paneli, hız/
zaman göstergesi hepsi mevcut; gerçek 3D at/jokey modelleri, animasyonlar
ve ses henüz eklenmedi (bkz. `features/race-viewer/README.md`). Demo:
`apps/web/src/app/races/demo/page.tsx` (Ana Sayfa'dan erişilebilir),
gerçek Race Engine çıktısıyla (`tools/generate-demo-race-timeline.ts`)
beslenir — henüz gerçek bir `/races/{id}` API'sine bağlı değildir.

## 7. UI/UX prensipleri (brief §47)

Modern, premium, okunabilir, hızlı, az tıklamalı, responsive, masaüstü ve
mobil uyumlu. Renkler tema config üzerinden yönetilir
(`apps/web/src/styles/theme.ts` — brief'teki "Renkler tema config üzerinden
yönetilmelidir" kuralı, breakpoint/spacing/typography dahil genişletilmiştir).

UI ile game logic ayrımı:

```text
Button → Hook/ViewModel → API Client (services/) → NestJS API → Application → Domain → Result → UI
```

Hiçbir component doğrudan veri tabanına veya iş kuralına erişmez (brief
§47 "Button → Database" anti-pattern'i yasaktır).

## 8. Responsive/mobil tasarım ilkeleri (proje sahibinin talebiyle eklendi)

- **Mobile-first breakpoint'ler**: 360px (küçük telefon), 768px (tablet),
  1024px (küçük masaüstü), 1440px (geniş masaüstü).
- Üst bilgi alanı mobilde daralır: ikincil öğeler (hava durumu, lokasyon)
  bir "daha fazla" menüsüne toplanır.
- At listesi mobilde tek sütun kart listesine, masaüstünde çok sütunlu
  grid'e dönüşür.
- Yarış ekranı mobilde dikey (portrait) ve yatay (landscape) her ikisini
  de destekleyecek şekilde tasarlanır; kamera seçenekleri mobilde
  sadeleştirilmiş bir kontrol çubuğuna taşınır.
- Dokunmatik hedefler (buton, kart) en az 44×44px (Apple HIG / Material
  Design önerisi).

## 9. Emotional design (brief §87)

At kariyeri ekranı sadece veri tablosu gibi görünmemelidir:

```text
"Şimşek"
12 yarış · 4 galibiyet · 3 ikincilik · 2 üçüncülük
Toplam ödül: ₺1.240.000
En iyi derece: 1600m Çim — 1:34.82
```

Bu ekran `apps/web/src/app/stable/[horseId]/page.tsx` → "Geçmiş" sekmesinde
uygulanacak; tipografi ve görsel hiyerarşi bir "kupa dolabı" hissi
vermelidir (tasarım detayları FAZ 1 UI çalışmasında netleştirilecektir).

## 10. Online / Sıralama / Kulüp ekranları (brief §2 ekran haritası "Online",
"Sıralama", "Kulüp"; §41-44)

**FAZ 7'de uygulandı (domain katmanı):** brief §2 ekran haritasındaki üç
bölümün ARKASINDAKİ tüm hesaplama mantığı hazır ve test edilmiştir (bkz.
`apps/api/src/domain/{online,ranking,club,tournament,season}/`,
`docs/ROADMAP.md` "FAZ 7 tamamlanma durumu"); gerçek ekranlar (`apps/web/
src/app/{online,leaderboard,club}/page.tsx`) henüz bu oturumun kapsamında
DEĞİLDİR — FAZ 1-5'teki tüm domain modülleriyle aynı "domain hazır, UI
wiring bekliyor" deseni.

- **Online** (PvP / Matchmaking / Turnuva / Sonuçlar): eşleştirme kuyruğu
  ekranı reyting + tahmini bekleme süresi gösterebilir
  (`domain/online/matchmaking.ts` `calculateRatingRangeAtWait` UI'da "aramaya
  devam ediliyor..." mesajının genişleyen aralığını yansıtabilir).
- **Sıralama** (Global / Türkiye / Sezon / Arkadaşlar): tek bir
  `LeaderboardScope` seçici (brief §43'teki 7 tür) + `domain/ranking/
  leaderboard.ts` `buildLeaderboard` çıktısını listeleyen tek bir bileşen
  yeterlidir (7 ayrı ekran değil, tek ekran + filtre).
  "Senin sıran" vurgusu `findPlayerRank` ile bulunur.
- **Kulüp** (Kulüp / Üyeler / Görevler / Yarışlar / Sıralama): "Sıralama"
  alt sekmesi yukarıdaki genel Sıralama bileşeninin `scope='club'` ile
  yeniden kullanılmasıdır. "Üyeler" listesi rol rozetleri (leader/officer/
  member, bkz. `domain/club/club.ts` `ClubRole`) gösterebilir. "Görevler"
  ve "Yarışlar" sekmeleri bu oturumun kapsamı dışındadır (içerik sistemi,
  bkz. `domain/club/README.md` "Kapsam dışı").
