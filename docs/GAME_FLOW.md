# GAME_FLOW.md — Oyun Döngüleri

> Kaynak: `docs/PROJECT_BRIEF.md` §1.3, §37, §68-69, §74, §88.

## 1. Ana oyun döngüsü (brief §1.3 — birebir)

```text
At bul → Satın al/sahiplen → Ahıra getir → Veteriner kontrolü
  → Kondisyon/özellik analizi → Antrenman planı → Beslenme/bakım/dinlenme
  → Yarış seç → Jokey seç → Taktik belirle → Yarışa katıl
  → Race Engine sonucu hesaplar → 3D sonuç görselleştirilir
  → Derece/ödül/XP/itibar → At gelişimi → Durum güncellemesi
  → Yeni yarış/satış/yetiştiricilik → Yeni nesil atlar
  → Daha büyük ahır ve çiftlik
```

Bu döngü, sistemler arası bağımlılığı tanımlar: Training → Care → Race →
Progression → Economy → Market/Breeding → Farm, sonra baştan. Her modül
(FAZ 1-4) bu döngünün bir dilimini uygulamaya açar.

## 2. Günlük oyun döngüsü (brief §37)

```text
Login → Daily Reward → Horse Status Check → Training → Feeding → Care
  → Vet/Rest → Race Selection → Jockey Selection → Tactics → Race → Result
  → Reward → Horse Development → Market → Tasks → Online → Logout
```

Bu döngü, brief §68 "retention" hedefiyle birlikte günlük/haftalık/sezonluk
görev sistemine bağlanır (bkz. `docs/ECONOMY.md` §2 Görev geliri).

## 3. İlk oynanabilir prototip akışı (brief §74 — FAZ 1 hedefi)

```text
Login → Ana Sayfa → Ahırım → At seç → Atı incele → Antrenman → Bakım
  → Yarış seç → Jokey seç → Taktik seç → Yarış başlat → Race Engine
  → Sonuç → Ödül → XP → At gelişimi
```

**Bu akış stabil olmadan** breeding, club, gelişmiş pazar, turnuva veya
karmaşık sosyal sistemler geliştirilmeye başlanmaz (brief §74 son
paragraf, §91 "kritik sistemleri test etmeden sonraki sisteme geçme").
Bu kısıt, `docs/ROADMAP.md`'deki faz sırasını doğrudan belirler.

## 4. Uzun vadeli endgame döngüsü (brief §88)

```text
Küçük ahır → İyi at → Yarış galibiyeti → Daha iyi at → Büyük ahır
  → Çiftlik → Yetiştiricilik → Kan hattı → Şampiyon at → Büyük yarışlar
  → Kulüp → Online şampiyonluk → Efsane kan hattı
```

Bu döngü FAZ 3 (Genetics) ve FAZ 4 (Farm) ile FAZ 7 (Online) arasındaki
bağı kurar: yetiştiricilik sistemi olmadan "efsane kan hattı" hedefi
anlamsız kalır, bu yüzden brief §73'teki modül sırası (Genetics → Farm →
... → Online) korunmalıdır.

## 5. Sezon döngüsü (brief §69)

Her sezon: yarış takvimi, leaderboard, görevler, ödüller, özel turnuvalar.
Sezon reseti **oyuncunun ilerlemesini silmez**, sadece sezon skorlarını
resetler — bu kural `SeasonResetUseCase` (FAZ 7) implementasyonunda
açıkça test edilecek bir davranıştır (brief §69 son cümle).

## 6. Bildirim tetikleyicileri (brief §46, event tabanlı)

```text
HorseTrained        → "Atın antrenmanını tamamladı."
HorseFatigued       → "Atın yoruldu."
VetCheckRequired    → "Veteriner kontrolü gerekli."
RaceStarting        → "Yarış başlıyor."
ListingExpired      → "Pazardaki ilanının süresi doldu."
RaceWon             → "Atın yarış kazandı."
ClubRaceEntered     → "Kulübün yeni yarışa katıldı."
```

Bu eventler, brief §51'deki domain event listesiyle birebir örtüşür ve
`docs/API.md` §10 WebSocket bölümündeki `notification.new` kanalından
istemciye iletilir.
