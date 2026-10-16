# Brief "Master Audit" — Son Rapor (16.10.2026)

Brief §18'in istediği 12 başlık. Ayrıntılı durum tablosu `MASTER_STATUS.md` →
"Brief 16.10.2026"; regresyon eşlemesi `docs/TESTING.md` §9; tarihçe
`PROJE_DURUMU.md` §13.110. Dal `claude/project-review-gaps-j1hb2l`
(PR arvasiist/atsevdalisi#2), commit aralığı `e0cb175..ad33b95`.

## 1. Projenin gerçek başlangıç durumu

Brief'in çoğu önceki dilimlerde yapılmış ve testliydi: ahır = ana sayfa, tam
ekran ahır sahnesi, çip/elmas "+", "Verilerimi indir"in kaldırılması, arkadaş
başarımları (her 5 arkadaşa 100 çip), dostluk hediyesi, tribün hediyesi,
Hemen Katıl, seviye aralıklı yarışlar, yarış yaşam döngüsü (Aşama 3, 15
madde), ödeme altyapısı (sağlayıcısız, sahte başarı yok). Denetim kod + test
üzerinden yapıldı; belge tek başına kanıt sayılmadı.

## 2. Bulunan sorunlar ve öncelikleri

| Kod | Sorun | Öncelik |
|---|---|---|
| S4 | Tavansız Şampiyona pratik sınıfında güçlü at evin parasıyla sınırsız çip topluyordu (güç 85'te girişin +%357'si) | P0 |
| G10 | `withTransaction` her çağrıda havuz bağlantısına `error` dinleyicisi ekleyip bırakıyordu (bellek sızıntısı) | P1 |
| G11 | Antrenman enerji harcamıyor, kondisyonu (fitness) değiştirmiyordu | P1 |
| G4 | Hemen Katıl: atın hazırlığı önceden denetlenmiyor, tek seçenek, ödül kuralı işlemden önce görünmüyordu | P1 |
| G2 | Dostluk hediyesinde gönderen ödemiyordu (oyun 10 çip basıyordu); brief gönderen öder + günlük bütçe istiyor | P2 |
| G3 | Arkadaş ekranında kazanılmış/alınmış eşik ayrımı ve "Ödülü al" yoktu; engelli arkadaş sayılıyordu | P2 |
| G9 | 12 üreticinin bildirimi canlı gitmiyordu (yalnızca yarış daveti); zilde okunmamış sayısı yoktu | P2 |
| G1 | Üst menüde Bakım yoktu; ahırdayken Bakım bağlantısı paneli açmıyordu | P2 |
| G12 | Yatay telefonda "Sıradaki adım" kartı sahnenin ~%40'ını kaplıyor, rozete biniyordu | P2 |
| G5 | Masasız yarış kartında ödül dağılımı yazmıyordu | P3 |
| G13 | Tribün hediye panelinde bakiye yazmıyordu | P3 |
| G6/G7/G8 | Kaldırılan "Verilerimi indir", tribün sahiplik kuralı ve "ana sayfa = ahır" testle kilitli değildi | P3 |

## 3. Kök nedenler ve ilgili dosyalar

- **S4:** tavansız sınıfta bot aralığı sabitti (61–81) → `apps/api/src/domain/race/practice-class.ts`, `config/economy.config.json`.
- **G10:** dinleyici `client.on` ile eklenip `release()` öncesi kaldırılmıyordu → `apps/api/src/infrastructure/database/database.module.ts`.
- **G11:** `applyTraining` yalnızca stat + yorgunluk hesaplıyordu → `apps/api/src/domain/training/training.ts`, `train-horse.use-case.ts`.
- **G2:** 0074 tasarımı "oyunun hediyesi"ydi → `postgres-friend-gift.repository.ts`.
- **G9:** bildirim satırları transaction içinde yazılıyor, soket yayını ise üreticiye bırakılmıştı → migration 0088 + `infrastructure/realtime/notification-stream.ts`.
- **G1:** `?panel` yalnızca ilk yüklemede okunuyordu → `apps/web/src/app/stable/page.tsx`.

## 4. Değiştirilen dosyalar

71 dosya (+2460 / −225). Başlıcaları: `config/{economy,gift,training,ops}.config.json`,
`packages/{game-config,shared-types}/src/*`, migration `0087`, `0088`,
`apps/api/src/{domain/race/practice-class,domain/social/friend-gift,domain/training/training}.ts`,
`postgres-friend-gift.repository.ts`, `postgres-achievement.repository.ts`,
`postgres-account-deletion.repository.ts`, `database.module.ts`,
`notification-stream.ts`, `race.gateway.ts`, `train-horse.use-case.ts`,
`apps/web/src/{components/layout/*,app/stable/page.tsx,app/training/page.tsx,app/wallet/page.tsx,features/social/*,features/race-lobby/*,features/grandstand/TribuneGiftPanel.tsx,features/notifications/*}`,
`apps/web/src/app/globals.css`, `tools/dev/{layout-check,acceptance-journey}.mjs`,
`apps/api/tools/economy-ev-report.ts`.

## 5. Yeni eklenen özellikler

- Şampiyona pratik sınıfında handikap (botlar atın gücüyle yükselir).
- Dostluk hediyesi: gönderen öder (2 çip, günlük 20 çip bütçe), alıcı önizlemesi, kişi başı sonuç, süresi dolanın iadesi.
- Arkadaş ekranında eşik listesi (alındı / Ödülü al / kilitli).
- Hemen Katıl: hazırlık uyarısı + hazır olma süresi, en uygun 3 seçenek, ücret ve ödül kuralı katılmadan önce.
- Canlı bildirim akışı (COMMIT'te), zil ve telefonda Menü rozeti.
- Antrenmanın enerji maliyeti ve kondisyon kazancı.
- Üst menü: Ana Sayfa · Ahır · Antrenman · Bakım; ahırdan Yarışlar/Pazar kısayolu.

## 6. Veritabanı ve API değişiklikleri

- **0087** `friend_gifts.sender_paid/send_id/refunded_at` (yalnızca ekleme; eski satırlar oyunun hediyesi olarak kalır, iade edilmez).
- **0088** `notifications` AFTER INSERT tetikleyicisi → `pg_notify` (yük yalnızca kimlik).
- `GET /friend-gifts`: `sendCost`, `dailySendBudget`, `spentToday`, `remainingSendBudget`, `nextRecipients`, `unsentEligibleCount`, `limitedBy`.
- `POST /friend-gifts/send-all`: `cost`, `refunded`, `balanceAfter`, `recipients[]` (kişi başı durum).
- `POST /horses/:id/train`: `energyCost`, `fitnessGain`, `newStatus.fitness`.
- Defter türleri: `friend_gift_send`, `friend_gift_refund`.

## 7. Çalıştırılan komutlar

`npm run build:packages`, kök `npm run typecheck`, `npx eslint <değişen dosyalar>`,
`npx vitest run` (web), API tam paket temiz şemada
(`DROP SCHEMA … ; npm run migrate; npx vitest run --no-file-parallelism`),
`npx tsx tools/economy-ev-report.ts 400`, gerçek tarayıcı:
`node tools/dev/layout-check.mjs`, `node tools/dev/acceptance-journey.mjs`.

## 8. Test sonuçları

- API tam paket (temiz şema): 238/238 dosya, 2927 test geçti. Sonradan eklenen sızıntı ve antrenman testleri ayrıca geçti; sızıntı testi düzeltme olmadan kırılıyor.
- Web: 89/89 dosya, 738 test.
- Tarayıcı düzeni: 4 ekran boyutu × 6 sayfa, yatay taşma 0, sayfa hatası 0.
- Son kabul yolculuğu (gerçek arayüz): 8/8 adım.

## 9. GitHub Actions durumu

`e0cb175`'ten `ad33b95`'e kadar bütün commit'lerde build-and-test, docker ve security yeşil.

## 10. Çözülemeyen sorunlar ve nedenleri

- Gerçek ödeme sağlayıcısı yok: sahte başarı kabul edilmediği için mağaza 503 döner (sahibinin sağlayıcı seçimi gerekiyor).
- ~~Az oyunculu botlu ücretli lobide bota düşen ödül yanıyor~~ — **kapandı (16.10.2026, sahibinin kararı):** bota pay düşmez, ödül gerçek oyuncular arasındaki sırayla dağılır (`computeLobbySettlement`); eşit güçte beklenen kayıp her sahada yalnızca komisyon (−%9…−%10).
- Tribün hediye kataloğu brief'in örnek listesiyle birebir değil; mevcut katalog aynı fiyat aralığında, kod değişmedi.
- Alınan hediyelerin ayrı bir "geçmiş" ekranı yok; cüzdan geçmişi ve bildirimlerde görünür.

### Brief tekrar kontrolü (16.10.2026, ikinci tur)

Brief yeniden madde madde koda karşı tarandı; iki gerçek açık bulundu ve kapatıldı:
- **G14 (§6.4):** arkadaşa gönderilen çip hediyesi alıcıya bildirim üretmiyordu → migration 0089 `friend_gift_received` (hediyeyle aynı transaction, canlı akış).
- **G15 (§7.2/§14):** `/races` lobi listesi kendiliğinden yenilenmiyordu → `race-lobby.lobbyListRefreshSeconds` (15 sn, sekme görünürken).
- Bilinçli farklar: tribün kataloğu brief'in fiyat merdivenini izler ama kalemleri farklıdır; gerçek parayla çip satılmaz (yalnızca elmas — çip ücretli havuza girer, sahibinin kararı gerekir); arkadaş başarımı 50 arkadaşta biter.

## 11. Production'a geçişi engelleyen eksikler

Ödeme sağlayıcısı + anahtarları; Google OAuth ve e-posta (Resend) anahtarları;
gerçek 3D/ses varlıkları; staging/üretim ortamında dağıtım doğrulaması;
`security/audit-allowlist.json` izinlerinin 2026-11-01'de bitmesi (Next/Nest yükseltmesi).

## 12. Sonraki mantıklı adımlar

1. ~~Az oyunculu ücretli lobi kuralı~~ — karar verildi ve uygulandı: bot payı gerçek oyunculara.
2. Ödeme sağlayıcısını seç; `PaymentGateway` uygulaması + imza doğrulaması.
3. OAuth/e-posta anahtarlarıyla staging dağıtımı; `tools/dev/acceptance-journey.mjs`'i staging'e karşı koş.
4. Next 16 / Nest 12 yükseltmesi (izin süresi dolmadan).
