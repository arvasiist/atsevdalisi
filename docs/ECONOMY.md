# ECONOMY.md — Ekonomi Sistemi

> Kaynak: `docs/PROJECT_BRIEF.md` §30-31, §67. Server-authoritative kuralları
> için `docs/SECURITY.md`. Bu sistem **FAZ 1**'den itibaren (temel para
> akışı) FAZ 2'ye kadar (pazar, personel) kademeli olarak genişler.

## 1. Temel kural

Ekonomi **her zaman backend'de authoritative** tutulur (brief §31).
İstemciden gelen hiçbir istek doğrudan bakiyeyi değiştiremez:

```text
❌ Yanlış:  Client → { "money": +100000 } → DB
✅ Doğru:   Client → { "action": "claimReward", "raceId": "..." }
            → API doğrular → Application use-case hesaplar
            → DB transaction içinde günceller → Client'a güncel bakiye döner
```

## 2. Gelir kalemleri (brief §31)

| Kalem | Tetikleyici | Hesaplama sorumlusu |
|---|---|---|
| Yarış ödülü | Yarış sonucu (finish_position ≤ ödül sırası) | `ClaimRaceRewardUseCase` |
| Satış | Pazarda at satışı | `SellHorseUseCase` |
| Görev | Görev tamamlama | `CompleteQuestUseCase` |
| Turnuva | Turnuva sıralaması (FAZ 7) | `TournamentRewardUseCase` |
| Başarı | Achievement açılması | `UnlockAchievementUseCase` |
| Sezon ödülü | Sezon sonu (FAZ 7) | `SeasonRewardUseCase` |
| Günlük ödül | Günlük giriş | `ClaimDailyRewardUseCase` |

## 3. Gider kalemleri (brief §31)

At satın alma, yarış giriş ücreti, yem, veteriner, nalbant, antrenman,
jokey (maaş), personel (maaş), ahır/çiftlik geliştirme, yetiştiricilik
ücreti. Her gider, ilgili use-case içinde **önce bakiye kontrolü, sonra
düşüm** sırasıyla, tek bir transaction içinde yapılır (bkz. §5).

## 4. Para birimleri

| Birim | Kaynak | Kullanım alanı |
|---|---|---|
| `money` (yumuşak para) | Oyun içi kazanım | Antrenman, bakım, düşük/orta segment at alım-satımı, giriş ücretleri |
| `gems` (premium para) | Satın alma veya nadiren ödül | Kozmetik, convenience item, bazı premium hızlandırmalar |

Brief §67 gereği: **gerçek para ile "garantili yarış galibiyeti" satılmaz**
ve gerçek para bahis/kumar mekaniği oyunun çekirdeği olamaz. `gems` ile
satın alınabilecek her item, `config/economy.config.json` →
`gemShopWhitelist` içinde açıkça listelenmelidir; bu liste dışı hiçbir
item gems karşılığı satılamaz (kod seviyesinde zorunlu kılınır).

## 5. Transaction ve idempotency kuralları

Brief §54-55 ile birebir:

```text
BEGIN
  SELECT money FROM players WHERE id = :playerId FOR UPDATE;
  IF money < cost THEN ROLLBACK, raise INSUFFICIENT_FUNDS;
  UPDATE players SET money = money - cost WHERE id = :playerId;
  INSERT INTO ... (mülkiyet/kayıt değişikliği)
COMMIT
```

Ödül/ödeme endpoint'leri `Idempotency-Key` zorunlu tutar (bkz.
`docs/API.md` §1.3); aynı anahtarla ikinci istek ikinci kez ödül vermez.

## 6. Pazar değeri modeli (brief §30)

```text
MarketValue = Quality × Potential × AgeFactor × RaceHistory × PedigreeValue × Health × Demand
```

Bu, oyuncu ilan fiyatı için bir **öneri/taban** olarak kullanılır; oyuncu
kendi fiyatını belirleyebilir (özellikle `fixed_price` ilanlarda), ancak
açık artırma (`auction`) modunda taban fiyat bu formülden hesaplanabilir.
Ayrıntılı ağırlıklar `docs/ALGORITHMS.md` §11'dedir.

## 7. Monetization sınırları (brief §67)

İzin verilen: kozmetik (avatar, ahır dekorasyonu, at/jokey kozmetikleri),
premium sezon, convenience item (örn. bekleme süresini kısaltma — ama
yarış sonucunu değil).

**Kesinlikle yasak:** Gerçek para karşılığı doğrudan yarış galibiyeti
garantisi; gerçek para ile bahis/kumar mekaniği.

> **Açık karar (bkz. ARCHITECTURE.md §10.6):** Ödeme sağlayıcısı (Stripe,
> iyzico vb.) henüz seçilmedi; proje sahibinin onayı bekleniyor.

## 8. Test kriterleri (brief §53 Economy testleri)

- Hiçbir işlem sonucunda negatif para oluşamaz (`CHECK (money >= 0)` +
  use-case seviyesinde ön kontrol — çift katmanlı güvence).
- Aynı işlem (aynı Idempotency-Key) iki kez uygulanamaz.
- Yarış ödülü sadece server tarafından, `ClaimRaceRewardUseCase` içinde
  verilebilir.
- Satın alma atomiktir: para düşümü ve mülkiyet devri aynı transaction
  içinde olur; biri başarısız olursa diğeri de geri alınır.
