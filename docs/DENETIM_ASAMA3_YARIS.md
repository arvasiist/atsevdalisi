# Aşama 3 — Yarış Sistemi Denetimi (15.10.2026)

Brief'in 15 maddesi koda ve testlere karşı tek tek kontrol edildi. "Var" demek
için kod yolu ve onu sınayan test birlikte gösterilmiştir. Bu aşamada
**gerçekten eksik** bulunan dört şey düzeltildi (aşağıda ✱ ile işaretli); geri
kalanı zaten çalışıyordu ve yeniden yazılmadı.

## Bulunan eksikler ve kararlar

| # | Eksik | Karar | Kod | Kanıt |
|---|-------|-------|-----|-------|
| ✱1 | **Yetersiz oyuncu kuralı yoktu.** Ücretli lobi yarışı tek gerçek oyuncuyla botlu koşuyordu. Havuz yalnızca gerçek oyuncunun ücretiydi ve bota düşen pay yanıyordu. Bu yüzden oyuncu birinci gelse bile ücretinin yalnızca %37,5'ini geri alıyordu (güvenceli kayıp). | Yarış başına kural `races.min_real_players` + `races.ai_fill` (migration 0085), yarış açılırken yazılır. Ücretli 2, ücretsiz 1, botsuz en az 2 (`config/race-lobby.config.json` → `fieldRules`). Kilitte eşiğin altında kalınırsa yarış **iptal edilir**, ücret defterden okunan tutarla **iade edilir**, bildirim gider. | `domain/race/field-rule.ts`, `dropUnreadyLobbyEntries` | `race-field-rule.e2e-spec.ts`, `field-rule.spec.ts` |
| ✱2 | **AI atları kurala bağlı değildi.** Bot kullanımını yalnızca global `aiFillEnabled` ve turnuva kuralı belirliyordu; yarış açan oyuncu "botsuz yarış" seçemiyordu. | `POST /races` `aiFill: false` alır (DTO + domain doğrulaması, metin `"false"` 400). Bot yalnızca yarışın kuralı **ve** global düğme izin verirse koşar (`effectiveAiFill`). Kesinleşme ve canlı görünüm aynı kuralı kullanır. | `create-race.use-case.ts`, `settle-race.use-case.ts`, `lobby-live-race.use-case.ts` | `race-field-rule.e2e-spec.ts` (botsuz: 2 satır, bot yok) |
| ✱3 | **İptal/düşürmede oyuncuya haber yoktu.** Kilit anında hazır olmayan, `on_start` bedelini ödeyemeyen ya da yönetici iptaline uğrayan oyuncu parasının neden geri geldiğini bilmiyordu. | Yeni bildirim türü `race_cancelled` (`not_enough_players` / `not_ready` / `insufficient_funds` / `admin`, `refundedAmount` = deftere yazılan iade). İadeyle **aynı transaction'da** yazılır. Web `/notifications` sebebi Türkçe yazar. | `postgres-race.repository.ts`, `postgres-admin.repository.ts`, migration 0085 CHECK | `race-field-rule.e2e-spec.ts`, `notification-types.spec.ts` |
| ✱4 | **8/10/12/14/16 atlı sahalar ve gerçek eşzamanlı kesinleşme uçtan uca sınanmıyordu.** Saha boyutları yalnızca domain'de, e2e yalnızca 8 atla vardı. Çift kesinleşme yalnızca ardışık çağrıyla sınanıyordu. | Kod değişmedi; kanıt eklendi. Her saha boyutunda 2 gerçek oyuncu + bot: sonuç N satır, sıralar 1..N, kulvarlar tekil. Aynı anda 5 kesinleştirme isteğinden biri 200, dördü 409; ödül oyuncu başına bir kez. | — | `race-field-rule.e2e-spec.ts` |

**Oyuncu sayısı yetersizse sistem ne yapar (cevap):** Başlangıç anında hazır
olmayanlar iade edilip düşer. Kalan gerçek oyuncu sayısı yarışın
`min_real_players` değerinin altındaysa yarış koşmaz: kalan herkese iade +
`race_cancelled` (`not_enough_players`). Ücretsiz yarışta eşik 1'dir; tek
oyuncu botlarla koşar (kaybedilecek para yok). Botsuz yarışta eşik en az 2'dir.
Turnuva finali kendi kuralını kullanır (botsuz, `online.tournament.minParticipants`).

Değerlendirilip **seçilmeyen alternatif:** tek oyunculu ücretli yarışı
"ödülsüz bot koşusu" olarak koşturmak. Reddedildi, çünkü oyuncu ücretini yine
kaybederdi. İptal + iade tek dürüst seçenek.

## 15 maddenin durumu

| Madde | Durum | Kod | Test |
|-------|-------|-----|------|
| Yarış oluşturma | VAR | `create-race.use-case.ts`, `validateRaceCreation` | `race-lobby.e2e-spec.ts`, `lobby.spec.ts`, `create-race-dto.spec.ts` |
| Yarış takvimi | VAR | `RaceCalendarScheduler`, `computeCalendarSlotTimes` | `race-calendar.e2e-spec.ts`, `race-calendar.spec.ts`, `race-calendar-scheduler.spec.ts`, `sunday-derby.spec.ts` |
| Kayıt süreci (katıl / ayrıl / hazır) | VAR | `joinLobbyRace`, `leaveLobbyRace`, ready | `race-join.e2e-spec.ts`, `race-leave.e2e-spec.ts`, `race-ready.e2e-spec.ts` |
| Katılacak atların belirlenmesi (yaş, hazırlık, ırk, seviye, kulüp, çakışan yarış) | VAR | `checkRaceReadiness`, ırk/seviye/kulüp kapıları, `isHorseInActiveRace` | `race-age.e2e-spec.ts`, `race-condition.e2e-spec.ts`, `race-breed-class.e2e-spec.ts`, `horse-level-bracket.e2e-spec.ts`, `race-club-only.e2e-spec.ts`, `race-horse-lock.e2e-spec.ts` |
| Gerçek oyuncu / AI ayrımı | VAR | `resolveFieldComposition`, `participantType` | `race-field-composition.e2e-spec.ts`, `field-composition.spec.ts` |
| 8/10/12/14/16 atlı senaryolar | VAR ✱ | config `fieldSizes` | `race-field-rule.e2e-spec.ts` (5 boyut), `field-composition.spec.ts`, `race-engine-field-balance.spec.ts` |
| Kadronun kilitlenmesi | VAR | `LockRaceUseCase`, `lockLobbyRace` (seed + snapshot dondurma) | `race-lifecycle.e2e-spec.ts` |
| Otomatik zamanlama | VAR | `RaceLockScheduler` + `SettleDueRacesUseCase` (lider kilidi) | `race-auto-settle.e2e-spec.ts`, `scheduler-leader.e2e-spec.ts`, `lock-race-backoff.spec.ts` |
| Başlatma ve tamamlanma | VAR | kilit → (kontrollü yarışta canlı koşu) → kesinleşme | `race-auto-settle.e2e-spec.ts`, `lobby-live-race.e2e-spec.ts` |
| Sonuçların kaydedilmesi | VAR | `settleLobbyRace` (sıra, süre, segmentler) | `race-settlement.e2e-spec.ts`, `race-timeline.e2e-spec.ts` |
| Kazananların belirlenmesi | VAR | motor (`race-engine.ts`, deterministik) | `race-engine.spec.ts`, `race-balance.spec.ts` |
| Ödül dağıtımı | VAR | `computeTableSettlement`, `lobby_race_prize` defter satırı | `race-settlement.e2e-spec.ts`, `race-table-rules.e2e-spec.ts`, `economy-reconciliation.e2e-spec.ts` |
| İptal ve iade | VAR + bildirim ✱ | `dropUnreadyLobbyEntries`, yönetici iptali, kendi yarışını iptal | `race-lifecycle.e2e-spec.ts`, `admin.e2e-spec.ts`, `race-ready-gate.e2e-spec.ts`, `race-field-rule.e2e-spec.ts` |
| Bağlantı kesilmesi | VAR | `RaceGateway.handleDisconnect` hiçbir satır yazmaz | `race-disconnect.e2e-spec.ts` (gerçek soket) |
| Sunucunun yeniden başlaması | VAR | koruma DB durumunda; ikinci uygulama örneği | `race-disconnect.e2e-spec.ts` ("SUNUCU YENİDEN BAŞLARSA"), `multi-instance-realtime.e2e-spec.ts` |
| Tekrarlanan olay / çift sonuçlandırma | VAR + eşzamanlı kanıt ✱ | `scheduled/locking → finished` geçişi kilit altında; ikinci çağrı 409 | `race-auto-settle.e2e-spec.ts` (crank × zamanlayıcı), `race-field-rule.e2e-spec.ts` (5 eşzamanlı istek) |

**"Yarış yalnızca bir butona basıldığı için değil, kurallara ve zamanlamaya
göre ilerler":** Kilit ve kesinleşme zamanlayıcıdan gelir (`startTime` geçince).
`POST /races/:id/settle` yalnızca aynı use-case'i tetikleyen bir "crank"tir ve
aynı kapılardan geçer. Erken çağrı, eşik altı kadro ya da bitmemiş canlı koşu
409 alır.

## Mevcut testlerdeki uyarlama

Tek gerçek oyunculu ücretli yarış koşan 13 e2e dosyası (kilit, dondurma, kopma,
masa, READY, ırk/seviye botları…) başka bir kuralı sınıyor. Bu dosyalar eski
kuralı **açık bir ön koşul** olarak kurar: `allowSoloLobbyRace(app, raceId)` →
`min_real_players = 1` (`test-helpers.ts`). Yetersiz oyuncu kuralının kendisi
yalnızca `race-field-rule.e2e-spec.ts`te sınanır ve orada bu yardımcı
kullanılmaz.

## Bilinen açık uçlar (bu aşamada değiştirilmedi)

- Takvim programlarının hiçbiri kendi `fieldRule`unu vermiyor; hepsi ücrete göre
  varsayılanı alıyor. Ücretli takvim yarışı da artık en az 2 oyuncu ister.
  Program bazında farklı eşik gerekirse `calendar.programs[].fieldRule`
  kullanılır (başlangıçta doğrulanır).
- Migration öncesi açılmış yarışlar varsayılan `min_real_players = 1` ile kalır
  (eski kural). Kural yarış açılırken yazıldığı için geriye dönük değiştirilmedi.
