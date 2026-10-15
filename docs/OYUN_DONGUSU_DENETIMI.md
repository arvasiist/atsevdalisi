# Oyun Döngüsü Denetimi ve Plan (14.10.2026)

Amaç: oyuncunun at sahibi olduğu, atını yetiştirdiği, jokey seçtiği, yarışlara
katıldığı, para kazandığı ve ahırını büyüttüğü döngünün **gerçekten** işleyip
işlemediğini kanıtla ölçmek; profesyonel at yarışı oyunlarının kalıplarıyla
karşılaştırıp eksikleri sırayla gidermek.

Kaynaklar:
- **Kendi ölçümüm:** yeni misafir hesabıyla geliştirme API'sine karşı oynanan
  betikler (`/players` → at → antrenman/bakım → pratik yarış). Sayılar aşağıda.
- **Rakip araştırması:** `reports/At yarışı oyunları tasarım kalıpları.md`
  (Rival Stars, Photo Finish LIVE, ZED, Umamusume, Derby Owners Club, Starters
  Orders, Winning Post, Howrse). ⚠️ Araştırma kaynak sayfalarını açamadı,
  arama özetlerine dayanır; rakamlar doğrulanmamış kabul edilmelidir.

## 1. Ölçülen bulgular (kanıtlı)

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| B1 | **Yeni oyuncu yarışarak para kaybediyor.** Ücretsiz başlangıç atı (Hınıs, statlar ~47–56) en ucuz pratik yarışta 40 yarışta hiç ilk üçe giremedi (19 kez sonuncu). Net **−3.400 çip** (giriş 4.000, ödül 200, iade 400). | `race-ev.mjs`, 40 yarış | "Para kazanma" adımı yeni oyuncu için kapalı; tek gelir günlük ödül + görevler. |
| B1a | Kök neden: pratik yarış botları **her zaman** genel aralıktan (`BOT_STAT_RANGE` 45–75, ort. ~60) üretiliyor; atın sınıfına bakılmıyor. Lobide "Çaylak" için 36–54 aralığı tanımlı ama pratik yarış onu kullanmıyor. | `run-practice-race.use-case.ts:282`, `bot-generator.ts:7` | Sınıf/handikap eşleşmesi yok. |
| B2 | **Yarış atı yormuyor.** 12 pratik yarış arka arkaya: enerji 100, yorgunluk 0 sabit. Yarış yollarında atın enerji/yorgunluğunu yazan kod yok (yalnızca XP/seviye). | Oyun betiği + `grep "UPDATE horses"` | Sınırsız ardışık yarış; dinlenme/bakım kararı anlamsız. |
| B3 | **Enerji hiçbir şeyle azalmıyor.** Antrenman yalnızca yorgunluk ekliyor; enerji 100'de kalıyor. Para verilen yemlerin enerji etkisi (arpa +18 vb.) bu yüzden boşa. | `training.config.json`, oyun betiği | Yem/bakım ekonomisi işlevsiz. |
| B4 | **Üretimde kiralanacak jokey yok.** Jokey satırı yalnızca geliştirme seed'inde (2 jokey) üretiliyor; uygulamada jokey üreten kod yok. | `grep "INSERT INTO jockeys"` → yalnızca `001_dev_seed.sql` | "Jokey seç" adımı üretimde yapılamaz. |
| B5 | Antrenman sınırlı ve sağlıklı: yoğun 3 seansta yorgunluk 100'e çıkıp `HORSE_TOO_TIRED` ile duruyor; bakım "dinlen" 4 saatte bir. | `train-spam.mjs` | Açık yok (beklenen davranış). |
| B6 | Bakım ücretsiz; `care.config.json` → `cost` alanları okunmuyor (ölü ayar). | `perform-care-action.use-case.ts` yorum + grep | Tasarım kararı; ölü ayar tuzaktır. |
| B7 | At hiç emekli olmuyor; yaş gerçek zamanla (yılda 1) ilerliyor; damızlık evresi yok; yetiştirme yalnızca 180 gün beklemeyle sınırlı (ömür boyu sınır yok). | `horse-growth.config.json`, `genetics.config.json` | Uzun vadeli hedef ve at arzı denetimi eksik. |
| B8 | Az oyunculu lobi yarışında bot payı yanıyor → ortalama oyuncu kaybediyor (CLAUDE.md'de bilinçli kural). | CLAUDE.md "BOT PAYI YANAR" | Çok oyunculu ekonomi az oyuncuda negatif. |
| B9 | Yönlendirme (ilk oturum yolu, "sıradaki adım") yok. | Depo taraması (araştırma ajanı) | Yeni oyuncu ne yapacağını bilmiyor. |
| B10 | Damızlık ücretinde kesinti yok: başka oyuncunun aygırı için ödenen ücretin tamamı aygır sahibine geçiyor (`breeding_stud_fee_debit` = `_credit`). | `postgres-breeding.repository.ts:414-425` | Yan hesaplar arasında değer aktarma kanalı; ekonomiden para çıkmıyor. |
| B11 | Yaş gerçek takvimle ilerliyor; tay 36 ay (≈ 3 gerçek yıl) dolmadan üreyemiyor ve "prime" evresine giremiyor. | `domain/horse/age-curve.ts` (rapor taraması) | Yetiştirme → yeni kuşak döngüsü oyuncunun oyun ömründe kapanmıyor. |

## 2. Profesyonel kalıplarla karşılaştırma

| Kalıp (rakip örnek) | Bizde | Boşluk |
|---|---|---|
| Sınıfına uygun rakip; güçlü at zayıf yarışı sömüremez (ZED sınıfları, eşleştirme) | Lobide seviye aralığı (XP seviyesi, güç değil); pratikte yok | **B1/B1a** |
| Yarış sonrası toparlanma (Photo Finish: 20 sa bitkin + 4 sa toparlanma; Umamusume enerji) | Yok | **B2/B3** |
| Kiralık jokey ya da otomatik jokey ataması (Starters Orders) | Sistem var, arz yok | **B4** |
| Emekli → damızlık, ömür boyu yetiştirme sınırı (Photo Finish, ZED Champions) | Yok | **B7** |
| Yeni ahıra ücretsiz giriş yarışı / güvenlik ağı (Photo Finish "Rookie Rally", tarayıcı menajerlerinde iflas süresi) | Günlük ödül + görev var; yarış EV'si negatif | **B1** |
| Boş kapıları gerçek oyuncu "hayalet" kayıtlarıyla doldurma (Umamusume Champions Meeting) | Botlar | **B8** (sonraki faz) |
| Kalıcı "sıradaki adım" paneli, kademeli özellik açılışı | Yok | **B9** |

## 3. Uygulama planı (küçük, test edilebilir dilimler)

Her dilim: config + saf domain fonksiyonu + e2e/birim test + yerel doğrulama +
belge. Yarış motoruna dokunulmaz (botların gücü motorun DIŞINDA üretilir).

| Sıra | Dilim | Gidereceği | Ölçüt (kanıt) |
|---|---|---|---|
| **S1** ✅ | **Jokey pazarı arzı:** kiralamaya açık jokey sayısı hedefin altına düşünce sistem yeni jokey üretir (beceri aralığı + beceriye göre ücret config'te). | B4 | Boş veritabanında `GET /jockeys` dolu döner; kiralanınca yenisi gelir. |
| **S2** ✅ | **Sınıfa uygun pratik yarış:** botlar atın gücüne göre bir sınıf bandından üretilir (bant tablosu config'te); güçlü at zayıf sınıfı sömüremez. | B1/B1a | Başlangıç atının pratik yarış beklenen kazancı ölçülür (harness); hedef: ortalama oyuncu için yaklaşık başa baş. |
| **S3** | **Yarış yorgunluğu + zamanla toparlanma:** yarış enerji düşürür, yorgunluk ekler (mesafeye göre, config); zamanlayıcı (lider kilidiyle) her turda toparlar. Arayüz "ne zaman hazır" gösterir. | B2/B3 | Ardışık yarış hazırlık kapısına takılır; süre geçince açılır. |
| S4 | Ekonomi yeniden ölçümü (kademelere göre EV), gerekirse config ayarı | B1 | Ölçüm tablosu |
| S5 | Emeklilik → damızlık evresi, ömür boyu yetiştirme sınırı, damızlık ücretinde kesinti; yaş ölçeği kararı | B7, B10, B11 | e2e (yaş ölçeği sahibinin kararı) |
| S6 | "Sıradaki adım" paneli (ilk oturum yolu) | B9 | Web testi + ekran görüntüsü |
| S7 | Az oyuncuda "hayalet" rakipler (gerçek oyuncu atlarının dondurulmuş kayıtları) | B8 | Tasarım kararı gerekir |

Bu dosya her dilimden sonra güncellenir.

## 4. Yapılanlar

### S1 — Jokey pazarı arzı (14.10.2026)

- `config/jockey.config.json` → `market`: dört beceri bandı (30–45 ×2, 45–60 ×2,
  60–72 ×2, 72–85 ×1), beceri yayılımı ±8, ücret `300 + 8700 × t²` (50'ye
  yuvarlı), Türkçe ad/soyad listesi. Bozuk config ile API açılmaz
  (`validateJockeyMarketConfig`).
- Saf kurallar `domain/jockey/market.ts`: bant sayımı (`planJockeyMarketRefill`),
  aday üretimi (kompozit HER ZAMAN kendi bandında kalır — yoksa vitrin her
  istekte şişerdi), kompozitten ücret.
- `GET /jockeys` eksik bandı doldurur: önce kilitsiz bakar, eksik varsa
  `pg_advisory_xact_lock` altında yeniden sayıp aynı transaction'da yazar.
  Kiralama/bırakma (para yolu) DEĞİŞMEDİ.
- Kanıt: `test/domain/jockey/jockey-market.spec.ts` (9 test: bant içi üretim,
  uç rastgele değerler, plan kapanışı, ücret monotonluğu, yeni oyuncunun en
  ucuz banda gücünün yetmesi, bozuk config) + `test/api/jockey-market.e2e-spec.ts`
  (4 test: vitrin dolu, boşalan bant dolar, 6 eşzamanlı istekte çift üretim
  yok, yeni oyuncu en ucuz jokeyi kiralar + defter satırı). Mevcut
  `jockey.e2e-spec.ts` (22) ve `jockey-condition.e2e-spec.ts` geçiyor.

### S2 — Sınıfa uygun pratik yarış (14–15.10.2026)

- Kademe = sınıf: `economy.config.json` → `practiceRaceClasses` (her kademenin
  bot aralığı + güç tavanı). Güç = hız + ivme + dayanıklılık ortalaması (ırk
  gücüyle aynı tanım). Gücü tavana ULAŞAN at alt kademeye giremez (409
  `HORSE_TOO_STRONG_FOR_TIER`, paradan önce) — "üst sınıfta koşabilirsin,
  alt sınıfta asla". Motor değişmedi; botlar `generateBotEntrants(…, aralık)`.
- Ölçüm (harness `measurePracticeEv`, gerçek atların ağırlık uyumu ~100 ile):
  başlangıç atı (güç 50) Mahalli Koşu'da yarış başına girişin **−%86**sı →
  **−%9**; güç 53 → +%40; tavanda bir üst kademeye geçen at −%17…−%40 (umutsuz
  değil). İlk denemede ağırlık uyumu 50 alınmıştı ve canlı API çok cömert
  çıkmıştı (+%26…+%74) — aralık buna göre 4 puan yukarı alındı.
- Ahır listesi `racingPower` taşır (yalnızca sahibine); yarış ekranı kapalı
  kademeyi kilitler ve rakip gücünü yazar.
- Kanıt: `practice-class.spec.ts` (8), `practice-class.e2e-spec.ts` (3),
  `race-entry.spec.ts` (+3); tam API 228/2800, web 85/710.
