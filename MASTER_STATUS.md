# AT SEVDALISI MASTER STATUS

> Son güncelleme: 16.10.2026 · Dal: `claude/project-review-gaps-j1hb2l` (PR #2)
> Kaynak: KOD (migration, use-case, controller, ekran, test) — belgeler değil.
> Ayrıntılı tarihçe `PROJE_DURUMU.md` §13'te (13.1–13.102); bu dosya brief'in
> istediği özet sözleşmedir. Sınıflar: NOT_STARTED · PLANNED · PARTIAL ·
> IMPLEMENTED · TESTED · PRODUCTION_READY · BROKEN · NEEDS_REFACTOR.
>
> ⚠️ Hiçbir özellik PRODUCTION_READY DEĞİLDİR: gerçek staging/üretim ortamı,
> seçilmiş izleme hizmeti ve gerçek dağıtım doğrulanmadı (brief §121).
> "TESTED" = veritabanı + backend + API + ekran + otomatik test (birim/e2e) var
> ve yerelde + CI'da geçiyor.
>
> **Belge haritası (tekrar etmesin diye):** kurallar + tuzaklar `CLAUDE.md` ·
> tarihçe `PROJE_DURUMU.md` §13 · uçlar `docs/API.md` · bu dosya özet.
> Kökteki `AUDIT_REPORT.md` (14.09.2026 güvenlik/kalite denetimi) ve
> `docs/AUDIT_REPORT.md` (3D brief Phase 0 boşluk analizi) **tarihli
> anlık görüntülerdir**; bugünkü durum için bu dosyaya bakılır.

## Brief 16.10.2026 — Kapsamlı oyun geliştirme (§2–§8, koddan doğrulandı)

"Durum" denetim anındaki durumdur (kod + test okunarak); "Sonuç" bu brief
kapsamında yapılan iştir. 3D işi kapsam dışı (brief kuralı 7). Brief metni §9'un
("Uluslararası hipodrom sistemi") ortasında kesik geldi; §9 ve sonrası bekliyor.

| § | Konu | Durum (denetim) | Kanıt / açık | Sonuç |
|---|---|---|---|---|
| 2 | Giriş → kendi ahırı, ahır ana merkez, tam ekran | TESTED | `HOME_FOR_PLAYERS`, `.stable3d-full`, `orientation-layout.spec.ts` | değişmedi |
| 2 | Üst menü yalnızca Ana Sayfa/Ahır/Antrenman/Bakım | TESTED | `nav-links.ts`, `top-bar-nav.spec.ts` | değişmedi |
| 2 | Gerçek veri: at, kapasite, bakım, kondisyon, enerji, yaklaşan yarışlar | TESTED | `/stable` (vital çubukları, `Kapasite`), `PlayerOverview` "Yaklaşan Yarışlar" | değişmedi |
| 2 | Boş ahır / ilk at alma akışı | PARTIAL | son at pazarda satılabiliyor → ahır boş kalabiliyor; boş ahırda yalnızca "at bulunamadı" yazıyor, at alma yolu yok | ✅ K2: boş ahırda Irk mağazası + At pazarı düğmeleri |
| 2 | Onboarding | TESTED | `OnboardingPanel`, `onboarding.e2e-spec.ts` | değişmedi |
| 2 | Çip/elmas "+" → satın alma | TESTED | `TOP_UP_HREF`, `top-bar-nav.spec.ts` (gerçek ödeme sağlayıcısı YOK) | değişmedi |
| 2 | "Verilerimi indir" kaldırıldı | TESTED | `/account` | değişmedi |
| 3 | Satın alma, sahiplik, ad/ırk/cinsiyet/yaş/seviye/soy | TESTED | ırk mağazası, pazar (sabit + müzayede), `PedigreeTree` | değişmedi |
| 3 | Hız, dayanıklılık, sprint statları sahibine görünür | NOT_STARTED | `PublicHorse` stat taşımıyor; sahibi kendi atının statlarını hiçbir ekranda göremiyor (potansiyel gizli kalmalı) | ✅ K2 TESTED: sahibinin listesinde 8 görünür stat, kartta ızgara; gizli kişilik + potansiyel sızmaz (`horse-career.e2e-spec.ts`) |
| 3 | Enerji/sağlık/moral/yorgunluk, XP/seviye, yaşlanma, emeklilik, dinlenme/hazırlık | TESTED | `race-condition`, `race-age`, `horse-retirement` e2e | değişmedi |
| 3 | Satış / transfer | IMPLEMENTED | pazar + müzayede; doğrudan at transferi bilinçli YOK (çoklu hesap değer aktarımı) | değişmedi |
| 3 | At profili + geçmiş (yarışlar, dereceler, kazanç) | NOT_STARTED | atın yarış geçmişi/kazanç ucu yok (`findRecentResultsByHorseId` yalnızca iç kullanım) | ✅ K2 TESTED: `GET /horses/:id/career` (kazanç defterden), kartta "Kariyer ve Geçmiş" (`horse-career.e2e-spec.ts`, web `horse-profile.spec.ts`) |
| 3 | Ekonomik değer tek skordan değil | IMPLEMENTED | `calculateMarketValue` (kalite, potansiyel, yaş, yarış geçmişi, sağlık; soy puanı `null`) | değişmedi |
| 4 | Ayrı çiftleştirme merkezi | PARTIAL | `BreedingPanel` ahırın içinde; damızlık listesi `GET /breeding/studs` | ✅ K3 TESTED: `/breeding` Çiftleştirme Merkezi (kurallar, takvim, teklifler, ilanlar, arama) — web `BreedingCenter.spec.tsx` |
| 4 | Aygır sahibi kendi ücretiyle ilan verir | NOT_STARTED | ücret formülden (`calculateStudFee`), ilan kavramı yok — emekli her aygır listede | ✅ K3 TESTED: `stud_listings`, sahip ücreti formül × [0,5–3] (`breeding-center.e2e-spec.ts`) |
| 4 | Kısrak sahibi teklif gönderir, aygır sahibi kabul/ret | NOT_STARTED | çiftleştirme tek tuş, aygır sahibinin onayı YOK | ✅ K3 TESTED: teklif → kabul/ret/iptal, ırk + azami ücret süzgeci |
| 4 | Anlaşmasız çiftleştirme yapılamaz | BROKEN (brief kuralına göre) | `POST /players/:id/breeding` başkasının aygırıyla anında tay üretiyor | ✅ K3 TESTED: 409 `BREEDING_REQUIRES_AGREEMENT` (`breeding.e2e-spec.ts`) |
| 4 | Ücret/ödeme zamanı/iptal/iade, çift kabul/ödeme engeli, geçmiş | PARTIAL | ücret anında düşer (defter + bildirim var); iptal/iade/teklif geçmişi yok | ✅ K3 TESTED: emanet + tam iade yolları, eşzamanlı çift kabulde tek kabul, defter mutabakatı, iki tarafın geçmişi, hesap silme engeli |
| 5 | Doğurganlık özelliği | NOT_STARTED | `horses` doğurganlık sütunu yok | ✅ K4 TESTED: `horses.fertility` (eski atlar tek seferlik türetildi, yeni at `deriveFertility`, tay kalıtımla) |
| 5 | Döllenme olasılığı < %100 | NOT_STARTED | her çiftleştirme tay verir | ✅ K4 TESTED: olasılık doğurganlık + sağlık + yaş, [%10, %95]; tutmayan deneme kısrağı dinlendirir |
| 5 | Gebelik süresi (config, ≈ gerçeğin 1/5'i ≈ 67 gün), takvim, kalan süre | NOT_STARTED | tay ANINDA doğuyor | ✅ K4 TESTED: `gestation` 335 × 0,2 = 67 gün, takvim + kalan süre ekranda |
| 5 | Gebelikte bakım/beslenme/veteriner, risk takibi | NOT_STARTED | — | ✅ K4 TESTED: ücretli veteriner kontrolü (haftalık) + beslenme günü → doğum riski × [0,6–1,6], risk düzeyi ekranda |
| 5 | Tek tay, yeniden başlatmaya dayanıklı, istemci saatinden bağımsız, çift doğum yok | PARTIAL | tek tay + tek transaction var; zamanlanmış doğum yok | ✅ K4 TESTED: `BreedingScheduler` (lider kilidi), eşzamanlı iki tur tek tay, ikinci uygulama örneği doğurur |
| 6 | Kalıcı ebeveyn bağı, görsel soy ağacı | TESTED | `pedigrees`, `GET /horses/:id/pedigree`, `PedigreeTree` | değişmedi |
| 6 | Ataların yarış/yetiştirme başarıları | NOT_STARTED | soy ağacı yalnızca ad gösteriyor | ✅ K2 TESTED: `recordsById` — her atanın koşu/birincilik/kazanç/tay özeti ağaçta |
| 6 | Dengeli kalıtım, test edilebilir rastgelelik, kardeşler farklı | TESTED | `genetics.config.json` (`inheritanceRange`, `mutationBounds`, potansiyel tavanı), tohum = çift kimliği, `genetics.spec.ts` | değişmedi |
| 7 | Tay evreleri oyun zamanına bağlı, yetişkin yarışına yaş şartı | TESTED | `horse-growth.config.json` evreleri, `race.readiness.minAgeMonths`, `race-age.e2e-spec.ts` | değişmedi |
| 7 | Tay yemi / bakım ürünleri, yetiştirmenin performansa dengeli etkisi, tay maliyeti | NOT_STARTED | tay yemi yok; tayın büyütülmesi statlara etki etmiyor | ✅ K5 TESTED: `tay_yemi` (yalnızca tay/gelişim), besleme başına bir yarış statına +0,5 kalıcı (sıra config, ömür boyu 16, tavan = potansiyel), ahır kartında ilerleme + kalan maliyet (`feed-categories.e2e-spec.ts`, `feed-catalog.spec.ts`) |
| 8 | Nal: standart/hafif/dayanıklı/zemine özel, ömür + değişim | PARTIAL | 3 kalite nal var; ömür, aşınma, zemin farkı yok | ✅ K6 TESTED: demir/dayanıklı çelik/alüminyum/titanyum + çim/toprak/sentetik nalı; kuşanılı parça her yarışta 1 aşınır, 0'da çıkar, yeniden kuşanılamaz (409 `EQUIPMENT_WORN_OUT`); zemine özel nal yalnızca kendi zemininde bonus (migration 0096, `equipment-durability.e2e-spec.ts`) |
| 8 | Eyer: yarış/antrenman, ağırlık/dayanıklılık, örtü/aksesuar | PARTIAL | 3 kalite eyer; antrenman eyeri antrenmana etki etmiyor | ✅ K6 TESTED (dayanıklılık): antrenman eyeri 40, yarış eyeri 25, şampiyon 15 yarış dayanır. ⚠️ Ağırlık modellenmedi (motor ekipman ağırlığını okumaz, uydurulmadı); eyer antrenmana etki etmez |
| 8 | Aksesuar (yular, örtü, battaniye, bandaj, fırça, isimlik, koleksiyon) | PARTIAL | dizgin + göz siperi + bandaj var; kozmetik aksesuar yok | ✅ K6 TESTED: yular, örtü/battaniye, isimlik, koleksiyon (fırça seti, rozet, kupa replikası) — kozmetik, nadirlikli, aşınmaz, yarışa etkisi YOK. ⚠️ 3D'de çizilmez (yeni 3D işi yapılmadı) |
| 8 | Yem: standart, yulaf, enerji, kondisyon, tay; kalite/fiyat, stok, plan | PARTIAL | saman/arpa/mama/havuç/vitamin stoklu; yulaf, kondisyon yemi, tay yemi, besleme planı yok | ✅ K5 TESTED: yulaf, enerji yemi, kondisyon yemi, tay yemi; kategori + kalite kademesi; `/shop` (Market) ilk kez yem satın alma ekranı (stok, fiyat, koşul). ⚠️ Ayrı "besleme planı" yok — günlük sınır + stok gösterilir |
| 8 | İlaç/takviye, veteriner kontrolü, sağlık kuralı yarışa etki | PARTIAL | bakımda `vet` var; envanterden ilaç/takviye ve yarışa etkisi yok | ✅ K5 TESTED: elektrolit, eklem takviyesi, ağrı kesici (son 24 saatte veteriner şartı, 409 `FEED_REQUIRES_VET_CHECK`); sağlık mevcut hazırlık kapısıyla yarış girişine etki eder |
| 8 | Teknik: tekil kimlik/fiyat/kategori, merkezi config, sunucu doğrulaması, atomik bakiye + envanter, çift alım yok, alım geçmişi | TESTED | `equipment.config.json` + `validateEquipmentConfig`, `Idempotency-Key`, `equipment_purchase`/`feed_purchase` defteri | değişmedi |
| 8 | Kozmetik ile performans ayrı; pahalı ürün otomatik kazandırmaz | PARTIAL | performans tavanı ×1,05 (`performance.ts`); kozmetik ekipman kategorisi yok | ✅ K6 TESTED: kategori TİPTEN türer (config kozmetiği performansa sokamaz), kozmetik kalitesi 0 + çarpandan elenir, tavan ×1,05 testli (`performance.spec.ts`) |
| 9 | Uluslararası hipodromlar (ülke/şehir) | PARTIAL | 5 Türk hipodromu (`hippodromes.config.json`, migration 0072) | brief metni kesik — bekliyor |

**Bilinen çelişki (sahibinin dikkatine):** gebelik ≈ 67 gerçek gün, mevcut
"1 gerçek gün = 1 oyun ayı" kuralıyla birlikte kısrağın bir gebelikte ~67 oyun
ayı (5,5 yaş) yaşlanması demek. Üreme penceresi 36–180 oyun ayı olduğu için bir
kısrak ömründe en fazla ~2 tay verir (`lifetimeFoalLimit.mare = 5`e
ulaşılamaz). İki değer de config'te; hangisinin değişeceği sahibinin kararı.

## Brief 16.10.2026 (devam) — §9–§24 denetimi (koddan doğrulandı)

§2–§8 yukarıdaki tabloda. Durum = denetim anı; "Sonuç" bu brief kapsamında
yapılan iş. Sıra brief §25 fazlarıdır (FAZ 1–4 = K1–K6 + ahır geliştirme/
bölmeler).

| § | Konu | Durum | Kanıt / açık | Sonuç |
|---|---|---|---|---|
| 9 | Ülke/şehir düzeni, pist türü/zemin/mesafe/koşul | TESTED | ülke/şehir/zemin/mesafe/masa config'te; yarış açarken `hippodromeRaceProblems` (400) — `hippodromes.spec.ts`, `hippodrome.e2e-spec.ts` | F5-H1 ✅ |
| 9 | Yerel/bölgesel/ulusal/uluslararası seviye, prestij, erişim | TESTED | seviye + prestij + pistin masaları (F5-H1); erişim = kariyer kademesi, katılım/açma 409 `CAREER_TIER_LOCKED` (`career.e2e-spec.ts`) | F5-H1 + H2 ✅ |
| 9 | ABD / Fransa / Dubai pistleri | IMPLEMENTED | Kentucky, Paris, Dubai (migration 0098) — markalı tesis adı KULLANILMADI (hak doğrulanmadı) | F5-H1 ✅ |
| 9 | Merkezi yapılandırmayla pist ekleme | IMPLEMENTED | `hippodromes.config.json` + migration satırı (`hippodromes.spec.ts`) | korunur |
| 9 | Gerçek isim/görsel hakları | NOT_VERIFIED | hukuki konu; görseller prosedürel (gerçek fotoğraf YOK) | sahibine bildirilecek |
| 9 | Pist takvimi, farklı mesafe/sınıf | TESTED | her programın pisti var (`race-calendar.spec.ts` pist kuralını dener); `GET /hippodromes` sıradaki saatleri zamanlayıcının fonksiyonuyla verir (`hippodrome-catalog.spec.ts`) | F5-H1 ✅ |
| 9 | Zemin/mesafe motora bağlı, uygunluk ön kontrolü | TESTED | motor `surface`/`distanceCategory`, snapshot zemin/mesafe uyumu; hazırlık + ırk/seviye kapıları | değişmedi |
| 9 | Giriş ücreti / ödül yapılandırılabilir | TESTED | masa kuralları (`table-rules.spec.ts`); pist hangi masaları ağırladığını config'te seçer (çarpan YOK — ikinci ücret kaynağı açmamak için) | F5-H1 ✅ |
| 10 | Kariyer kademeleri, puanla ilerleme, giriş koşulları, kariyer ekranı + sıradaki hedef | TESTED | 6 kademe (Yerel → Büyük Şampiyona), puan bitmiş yarışlardan TÜRETİLİR, kademe masaları + yurt dışı pistlerini açar, kademe ödülü başarım (`career_points`); `GET /career` + `/career` (geçmiş, puan tablosu, sıradaki hedef) — `career.spec.ts`, `career.e2e-spec.ts`, web `career-view.spec.ts` | F5-H2 ✅ |
| 10 | Seyahat/nakliye | EVALUATED | bekleme YOK (pist kademeyle açılır, hemen katılınır); ayrı nakliye ücreti YOK (masa bedeli zaten pist seviyesiyle artıyor — ikinci ücret kaynağı açmamak için); toparlanma bedeli mesafeyle zaten ölçekli | karar belgelendi |
| 11 | Hemen Katıl, uygun yarışlar, mesafe/pist/zemin/ücret/ödül | TESTED | `pickQuickJoinRace`, `LobbyPanel` hipodrom/zemin/mesafe | değişmedi |
| 11 | Gerçek/AI ayrımı, 8–16 saha, kayıt→kesinleşme, kalıcı sonuç, çift ödül yok, determinizm, iptal/kopma/yeniden başlatma | TESTED | `race-field-rule.e2e`, `race-engine` SHA kilidi, `settle` durum geçişi, §13.27 testleri | değişmedi |
| 12 | Kazananlar tablosu (kronolojik, sayfalı, tarih filtreli) | NOT_STARTED | genel/sezon/haftalık sıralama var; yarış kazananları listesi yok | F5-H3 |
| 13 | Jokey işe alma/beceri/uyum/form | TESTED | `jockey.e2e`, uyum + form/yorgunluk | değişmedi |
| 13 | Antrenör işe alma, maaş (peşin sözleşme), aşırı antrenman (yorgunluk/sakatlık) | TESTED | `staff.e2e`, antrenman enerji/yorgunluk | değişmedi |
| 13 | Antrenör uzmanlıkları / geliştirme | PARTIAL | `staff.specialization` sütunu var, etkisi yok | değerlendirilecek |
| 14 | Sağlık/bakım/veteriner/sakatlık/gebelik kontrolü/yarış öncesi denetim, sunucu otoritesi | TESTED | bakım + hazırlık kapısı + gebelik veteriner kontrolü | değişmedi |
| 14 | Beslenme/su ihtiyacı | PARTIAL | yem/su bakım işi var; "açlık/susuzluk" canlı durumu YOK (uydurulmadı) | değişmedi |
| 15 | İlan, fiyat, müzayede, teklif geçmişi, sahiplik kontrolü, tek işlem devir, çift satış engeli | TESTED | `market.e2e`, `auction` e2e | değişmedi |
| 16 | Arkadaş, 5'in katı arkadaş başarımı (100 çip, tek sefer), hediye/toplu alma, kulüp, sohbet | TESTED | `friend-gift`, başarım PK, kulüp e2e | değişmedi |
| 17 | Tribün hediyesi (alıcı/yarış/at doğrulaması, spam sınırı, sonuca etkisiz) | TESTED | `tribune-gift.e2e` | değişmedi |
| 17 | Brief'in hediye listesi (yonca, kurdele, havuç demeti, çelenk) + toplu alma | PARTIAL | katalog farklı (havuç, elma, nazar, Altın Nal, gül çelengi, kupa); ödeme anında, toplama yok | F7 |
| 18 | Günlük/haftalık görev, başarım, sezon, tek sefer ödül, config | TESTED | `quests`, `achievements`, `season` e2e | değişmedi |
| 18 | Çiftleştirme/tay yetiştirme görevleri | NOT_STARTED | görev ölçütlerinde yok | F7 |
| 19 | Kapasite, geliştirme, yem/bakım/personel/yarış giderleri | TESTED | ahır geliştirme + defter | değişmedi |
| 19 | Günlük/aylık gelir-gider raporu ekranı | NOT_STARTED | cüzdanda yalnızca satır listesi | F6 |
| 20–21 | Sunucu bakiyesi, atomik işlem, idempotency, denetim kaydı, negatif bakiye yok, oturum/yetki/hız sınırı, gizli anahtar | TESTED | para yolu kuralları, `phase16-hardening`, gitleaks | değişmedi |
| 22 | Tablolar, indeksler, kısıtlar, zamanlayıcılar (lider kilidi), yeniden başlatma güvenliği | TESTED | migration 0001–0097, zamanlayıcı testleri | yeni tablolar fazlarla |
| 23 | Hipodrom/takvim ekranı, kazananlar ekranı | PARTIAL | `/hippodromes` (ülke grupları, masa, takvim, açık yarış) VAR; kazananlar ekranı YOK | kazananlar F5-H3 |
| 24 | Birim/API/migration/eşzamanlılık/yeniden başlatma/ekonomi testleri, CI | TESTED | API 3040+, web 786+, GitHub Actions | her dilimde |

## Brief 16.10.2026 — Sosyal + çip ekonomisi (koddan doğrulandı)

Ayrıntı ve 12 maddelik tamamlanma raporu: `docs/SOSYAL_CIP_DENETIMI.md`.

| Konu | Durum | Kanıt |
|---|---|---|
| Oyuncu arama (ID / kullanıcı adı) + profilde Arkadaş Ekle | TESTED | `player-discovery.e2e-spec.ts`, `presence.spec.ts` |
| Çevrimiçi / son görülme / gizlilik | TESTED | `player-discovery.e2e-spec.ts`, web `presence.spec.ts` |
| Arkadaşlık: birlikte yarış VEYA davet çifti | TESTED | `friendship-race-gate.e2e-spec.ts`, `referral.e2e-spec.ts` |
| Çip transferi: onay, limitler, iki taraf bildirim | TESTED | `chip-transfer.e2e-spec.ts`, `gift.e2e-spec.ts`, `gift-limits.spec.ts`, web `chip-transfer.spec.ts` |
| Satın alınan çip hediye edilemez | TESTED | `chip-transfer.e2e-spec.ts`, `payments.e2e-spec.ts` |
| Davet kodu + ödül | TESTED | `referral.e2e-spec.ts`, `referral.spec.ts` (api + web) |
| Mağazada çip paketleri | IMPLEMENTED (sağlayıcı YOK) | `payments.e2e-spec.ts` (sahte imzalı sağlayıcıyla) |
| Yasal metinler (KVKK, gizlilik, kullanım şartları) | PARTIAL — TASLAK: şirket bilgisi + hukuki inceleme sahibinde | `/yasal`, web `legal-documents.spec.ts` |

## Brief 16.10.2026 — "Master Audit" eşlemesi (koddan doğrulandı)

Her satır kod + test ile kontrol edildi. "Durum" denetim anındaki durumdur;
"Sonuç" bu brief kapsamında yapılan iştir. 12 başlıklı son rapor:
`docs/BRIEF_16_10_2026_RAPOR.md`.

| Aşama | Konu | Durum (denetim) | Kanıt | Açık | Öncelik | Sonuç |
|---|---|---|---|---|---|---|
| 2.1 | Giriş → ahır | IMPLEMENTED | `HOME_FOR_PLAYERS` (`/`→`/stable`, `app/(dashboard)/page.tsx`) | G8: yönlendirmeyi kilitleyen test yok | P3 | G8 ✅ |
| 2.2 | Ahır tam ekran + üst menü | PARTIAL | `.stable3d-full`, `orientation-layout.spec.ts` | G1: üst menüde Bakım yok (Ana Sayfa/Ahır/Antrenman/Yarışlar/Pazar/Sıralama/Sosyal); ahırdayken `/care` paneli açmıyor (`?panel` yalnızca ilk yüklemede okunuyor) | P2 | G1 ✅ |
| 3 | Elmas/çip "+" | TESTED | `TOP_UP_HREF`, `top-bar-nav.spec.ts` | — | — | 16.10.2026: çip "+" de `/store` (çip paketleri) |
| 3 | Satın alma doğrulaması | TESTED (sağlayıcısız) | `payments.e2e-spec.ts` (imza, tekrar webhook, tutar uyuşmazlığı) | gerçek sağlayıcı yok → mağaza 503 (sahte başarı yok) | — | değişmedi |
| 4 | "Verilerimi indir" kaldırıldı | IMPLEMENTED | `/account`ta çağrı yok | G6: kaldırıldığını kilitleyen test yok | P3 | G6 ✅ |
| 5.1–5.2 | Arkadaş başarımı (5/10/…/50 → 100 çip) | TESTED (+ engelli sayılmaz, 16.10) | `friend_count` (kabul edilmiş, silinmiş/engelli sayılmaz), `achievements.e2e-spec.ts` | G3: arkadaş ekranı kazanılmış/alınmış eşikleri ve "Al" düğmesini göstermiyor | P2 | G3 ✅ |
| 5.3–5.4 | Toplu çip hediyesi | PARTIAL → TESTED | `friend-gift.e2e-spec.ts` (10), `friend-gift.spec.ts` (domain + web) | G2: gönderenden para düşmüyordu (oyun 10 çip basıyordu) | P2 | G2 ✅ migration 0087: gönderen öder 2 çip, günlük bütçe 20, alıcı önizlemesi, kişi başı sonuç, eşzamanlı basışta tek tahsilat, süresi dolanın iadesi |
| 6.1 | Hemen Katıl | PARTIAL → TESTED | `pickQuickJoinRace`, `lobby-logic.spec.ts` | G4: atın enerji/yorgunluk/yaş durumu önceden denetlenmiyor (sunucu 409 veriyor), tek seçenek, ödül kuralı işlemden önce gösterilmiyor | P1 | G4 ✅ |
| 6.2 | Yarış kartı | IMPLEMENTED → TESTED | `LobbyPanel` (mesafe, pist, sınıf, kapasite, ücret, masa kuralları, süre) | G5: masasız yarışta ödül dağılımı yazmıyor | P3 | G5 ✅ |
| 6.3–6.4 | Uygunluk + yaşam döngüsü | TESTED | `DENETIM_ASAMA3_YARIS.md` (15 madde) | — | — | değişmedi |
| 7 | Tribün hediyesi | TESTED (+ sahiplik değişimi, 16.10) | `tribune-gift.e2e-spec.ts` | G7: "yarıştan sonra at satılırsa hediye koşturana gider" kuralının testi yok | P3 | G7 ✅ |
| 8–10 | At/ahır/bakım/antrenman, motor, genetik, kariyer | TESTED | `OYUN_DONGUSU_DENETIMI.md` (S1–S6, B12–B13), `RACE_BALANCE_REPORT.md` §11 | — | — | S4 handikap (16.10) |
| 11 | Ekonomi bütünlüğü | TESTED | `player-journey.e2e-spec.ts` (bakiye = başlangıç + defter) | G2 yeni para yolu → yolculuk testine girer | P1 | G2 ile |
| 11a | Lobi: bota düşen ödül (sahibinin kararı, 16.10) | bota düşen pay yanıyordu (2 oyunculu botlu masada −%71…−%91) | `computeLobbySettlement` (`table-rules.spec.ts`), `race-settlement` + `economy-reconciliation` + `final` e2e | — | P1 | ✅ bota pay düşmez; ödül gerçek oyuncu sırasıyla, beklenen kayıp yalnızca komisyon |
| 12 | Canlı bildirim | PARTIAL → TESTED | `notification-stream.e2e-spec.ts`, `notification-stream.spec.ts`, `unread-badge.spec.ts` | G9: 12 üreticinin bildirimi DB'ye yazılıyor ama canlı (`notification.created`) yalnızca yarış davetinde gidiyordu; zilde okunmamış sayısı yoktu (brief'teki `notification.new` adı kodda YOK — gerçek olay `notification.created`) | P2 | G9 ✅ migration 0088 tetikleyici + `NotificationStreamListener` (COMMIT'te, örnek başına yerel yayın), zil/Menü rozeti |
| 12–14 | Sosyal, soket, güvenlik | TESTED | `phase16-hardening.spec.ts`, `multi-instance-realtime.e2e-spec.ts`, `production-env.ts` (`DISABLE_RATE_LIMIT` üretimde reddedilir) | — | — | değişmedi |
| 11/16 | Veritabanı bağlantı havuzu | BROKEN → TESTED | `with-transaction-listeners.e2e-spec.ts` | G10 (denetimde bulundu): `withTransaction` her çağrıda havuz client'ına `error` dinleyicisi ekleyip bırakıyordu (bellek sızıntısı) | P1 | G10 ✅ |
| 9 | Antrenman | PARTIAL → TESTED | `training.spec.ts`, `training.e2e-spec.ts` | G11: antrenman enerji harcamıyor, kondisyonu (fitness) değiştirmiyordu — brief "yoğunluk, enerji, kondisyon, yorgunluk, sağlık birlikte" | P1 | G11 ✅ config'ten enerji maliyeti + kondisyon kazancı, ekranda gösterilir |
| 2.2 | Ahır düzeni (gerçek tarayıcı) | TESTED | `tools/dev/layout-check.mjs` (Chromium; 1440×900, 820×1180, 844×390, 390×844 × 6 sayfa): yatay taşma 0, sayfa hatası 0, menü 4 bölüm, ahır işlemleri görünür; dikey telefonda "yan çevir" | G12: yatay telefonda "Sıradaki adım" kartı sahnenin ~%40'ını kaplıyor, PLACEHOLDER rozetine biniyordu | P2 | G12 ✅ kısa ekranda tek satırlık şerit |
| 8.4 | Tribün paneli bakiye | IMPLEMENTED | `TribuneGiftPanel` | G13: panelde çip bakiyesi yazmıyordu | P3 | G13 ✅ |
| 19 | Son kabul yolculuğu (gerçek arayüz) | TESTED | `tools/dev/acceptance-journey.mjs` (16.10.2026 koşusu: 8/8 adım geçti — ahır, Bakım paneli, bakım, antrenman kondisyon +0,60, Hemen Katıl, pratik yarış 5000→5080, seviye 2, sayfa hatası 0); API tarafı `player-journey.e2e-spec.ts` | — | — | kanıtlandı |
| 5.4 | Arkadaş hediyesi bildirimi (brief tekrar kontrolü, 16.10) | PARTIAL | `friend-gift.e2e-spec.ts` | G14: gönderilen çip hediyesi alıcıya bildirim üretmiyordu (brief §6.4 "bildirimler mevcut altyapıya bağlanmalı") | P2 | G14 ✅ migration 0089 `friend_gift_received`, hediye satırlarıyla aynı transaction, canlı akış 0088 tetikleyicisiyle |
| 6.2 / 13 | Lobi listesi güncelliği (brief tekrar kontrolü, 16.10) | PARTIAL | `lobby-refresh.spec.ts` | G15: `/races` listesi yalnızca açılışta ve "Yenile" ile okunuyordu — başkasının katılımı, kilit, kalan süre bayat kalıyordu (`lobby.update` yalnızca eşleştirme sayfasına yayılır) | P2 | G15 ✅ `race-lobby.lobbyListRefreshSeconds` (15 sn), sekme gizliyken durur, üst üste istek yok |
| 8.1 | Tribün kataloğu | IMPLEMENTED | `grandstand.config.json` | brief örneğiyle aynı fiyat merdiveni (10/20/30/50/100 + 250), kalemler farklı (havuç, elma, nazar boncuğu, Altın Nal, gül çelengi, kupa) | — | bilinçli: brief "öneri" diyor; kalem değişimi migration CHECK ister |
| 4 | Çip satın alma | — | `store.config.json` yalnızca elmas paketi | gerçek parayla çip SATILMIYOR: çip ücretli yarış havuzuna girer (elmas politikası (81)); çip "+" → cüzdan (çip kaynakları) | — | sahibinin kararı gerekir |
| — | 3D | kapsam DIŞI (brief) | — | — | — | dokunulmadı |

## Repository

- Monorepo (npm workspaces): `apps/api` (NestJS 11), `apps/web` (Next.js 16 +
  React 19 + R3F 9), `packages/shared-types`, `packages/game-config`,
  `config/*.json`, `database/migrations` (0001–0082, hepsi `up`/`down`),
  `database/seeds/001_dev_seed.sql`, `tools/` (migrate, seed, ops: duman/yük
  testi, yedek/geri yükleme), `docker-compose.yml` + `docker-compose.staging.yml`.
- CI: `.github/workflows/ci.yml` → `npm ci` → lint → typecheck → migrate →
  test (api + web + paketler) → build → imaj + duman testi + yük testi bütçesi
  + yedek provası; `security` işi (bağımlılık açığı + gitleaks, tüm geçmiş).
- Test dosyaları: API 216 (97 e2e + 119 birim/güvenlik/denge), web 71
  (09.10.2026 yerel koşu: web 643/643, API birim+güvenlik 1596/1596).
- Kökte gitignore'lu eski scratch dosyaları (`*.bundle`, `*.bat`, `*-log.txt`) — zararsız.

## Current Architecture

- Backend katmanları: `domain/` (saf TS, Nest/ORM yok) → `application/`
  (use-case + port) → `infrastructure/` (Postgres repo, zamanlayıcılar, config)
  → `api/` (controller, guard, gateway). Para yolu `SELECT … FOR UPDATE` +
  aynı transaction'da `economy_transactions`.
- Defter DEĞİŞTİRİLEMEZ (DB tetikleyicisi UPDATE/DELETE'i reddeder).
- Yarış motoru `domain/race/race-engine.ts`: seed'li PRNG, deterministik,
  config güdümlü; komutsuz çıktı SHA-256 parmak iziyle kilitli. Jokey uyumu,
  jokey formu/yorgunluğu ve ırk/seviye sınıfları motor DIŞINDA kadroya donar.
- Gerçek zamanlı: Socket.IO `RaceGateway` (`/races`) + Redis köprüsü (çok
  örnek; oynatma kareleri yerel yayılır).
- Zamanlayıcılar (Nest içi): kilit, kesinleşme, takvim, turnuva, sezon,
  eşleştirme taraması, etkileşimli yarış, müzayede kapanışı, ilan süre dolumu,
  avatar işleri — hepsi lider kilidi arkasında (`scheduler-leader.ts`).
- Config: `config/*.config.json` + `packages/game-config` (tipli yükleyiciler,
  açılışta doğrulayıcılar: ırk, masa, ekipman, kişilik, jokey durumu, seviye aralığı).

## Frontend Status — TESTED (üretim değil)

Rotalar: `/` (misafire 3D vitrin, oyuncuya → `/stable`), `/stable` (tam ekran
3D ahır; bakım/ekipman paneli içinde — `/care`, `/equipment` buraya yönlenir),
`/training`, `/farm`, `/staff`, `/breeds`, `/market`, `/races` (lobi + Hemen
Katıl + pratik + kontrollü sürüş + masa kuralları), `/races/[raceId]/watch`,
`/races/demo`, `/replays`, `/grandstand`, `/leaderboard`, `/club` (sohbet +
davet), `/friends`, `/profile/[username]`, `/notifications`, `/quests`,
`/avatar`, `/store`, `/wallet`, `/account` (+ reset/verify), `/admin`,
`/online`. Altın-lacivert tema, mobil alt sekme çubuğu, PWA manifest.
Eksik: sosyal hub (avatarlı alan).

## Backend Status — TESTED

36 API modülü (achievements, admin, auth, avatar, breeding, breeds, care,
chat, club, economy, equipment, farm, feed, gift, grandstand, health, horse,
idempotency, jockey, leaderboard, market, matchmaking, notification, ops,
payments, player, quests, race, rate-limit, realtime, season, social, stable,
staff, training, tribune-gift). Doğrulama controller + domain'de çift katman
(esbuild altında DTO dekoratörleri atlandığı için).

## Database Status — TESTED

82 migration (hepsi `down` dosyalı), FK/CHECK/kısmi tekil indeksler, değişmez
defter tetikleyicisi. CHECK ↔ config eşleşmesi testlerde EN SON migration
okunarak denetlenir (bildirim türü, ırk, ırk sınıfı, seviye aralığı, masa,
tribün hediyesi, görev ölçütü). Yedek/geri yükleme betikleri + CI provası VAR;
üretim verisinde prova ortamı (gerçek staging) YOK.

## Authentication Status — PARTIAL

VAR: misafir kayıt, e-posta + şifre (`scrypt`), şifre sıfırlama, Google girişi
+ hesap bağlama, kısa ömürlü JWT + dönen refresh token (yeniden kullanım
tespiti), çıkış / tüm cihazlardan çıkış / cihaz listesi, e-posta doğrulama,
hesap silme (anonimleştirme), veri dışa aktarma ucu (arayüzü sahibinin
isteğiyle kaldırıldı), askı/yasak oturum kapısında (403). YOK: Apple girişi
(kimlik bilgisi). Üretim için `GOOGLE_OAUTH_CLIENT_ID`, `RESEND_API_KEY`,
güçlü `JWT_SECRET` gerekir.

## Economy Status — TESTED (üretim değil)

Sunucu otoriteli; her hareket defterde (tür, tutar, önce/sonra bakiye,
referans); `player-journey.e2e-spec.ts` "bakiye = başlangıç + defter" ile
kilitli. Para yolları: pazar (sabit + müzayede emanet), ırk mağazası, ekipman
kataloğu, yem, tesis, personel, bilet, hediye, dostluk/tribün hediyesi,
görev/başarım/sezon ödülü, yönetici düzeltmesi, masa kuralları (ücret anı +
kaybeden iadesi). Gerçek para (`payment_orders`) defterden AYRI; defter
yalnızca elması görür. **Elmas politikası (09.10.2026):** elmas yalnızca
görünüş + kolaylık. Bu tarihe kadar notlarda "elmasın harcama yolu yok"
yazıyordu ve YANLIŞTI: stoklu yem elmasla satılıyordu (yem kondisyon/sağlık
verir, motor ikisini okur → parayla yarış performansı) ve elmas arkadaşa
hediye edilebiliyordu. İkisi kapatıldı (yem çiple; `validateGemPolicy`
açılışta kilitler). Kozmetik mağaza: altyapı + ilk ürünler (forma renkleri)
VAR (`/cosmetics`, migration 0082) — forma renkleri (yarışta jokeyde
görünür), şapkalar ve aksesuarlar; mağaza ekranı (`/store`) ve avatar
düzenleyicide kilit dahil. Gerçek ödeme sağlayıcısı YOK.

## Horse Status — TESTED

11 ırk (ücretsiz başlangıç atı en zayıf ırk), 8 görünür + 6 gizli stat,
sağlık, yaş/gelişim, görünüş (don/sakarlık, kalıtım), zemin/mesafe uygunluğu,
ekipman, yarış geçmişi, seviye/XP, sahiplik kilitleri. Kişilik doğuşta
kimlikten determinist; etkisi antrenmanda; sahibine yalnızca ETİKET gösterilir.
"Açlık" ve "stres" canlı durum alanı YOK (uydurulmadı).

## Stable Status — TESTED

Ahır seviyesi/kapasitesi, yükseltme (para yolu), tam ekran 3D ahır sahnesi
(prosedürel yedek + PLACEHOLDER rozeti), bakım/ekipman sahnenin içinde.
16.10.2026 — ahır geliştirme: 10 seviye (ad, kapasite, konfor = zamanla
toparlanma hızı, oyuncu seviyesi şartı), sahnede "Ahırı Geliştir" paneli +
seviye yol haritası (`stable-development.e2e-spec.ts`). 3D ahır seviyeyle
görsel olarak DEĞİŞMEZ (yeni 3D işi yapılmadı).
16.10.2026 — ahır bölmeleri (migration 0097): her atın kalıcı bölmesi; sahnede
yan bölmelerde komşu atlar + "+ At al" / kilitli bölme düğmeleri; "Bölmeler"
paneliyle taşı/yer değiştir (`stable-stalls.e2e-spec.ts`, tarayıcıda ekran
görüntüsüyle doğrulandı: masaüstü + telefon yatay).

## Training Status — TESTED

Tür/yoğunluk/süre; kazanç potansiyel, mevcut stat, canlılık, antrenör, tesis
ve kişilik çarpanına bağlı; yorgunluk/sakatlık riski; geçmiş; antrenmanı
yapan oyuncu kaydedilir (görev sayımı).

## Care Status — TESTED

Bakım eylemleri, bekleme süreleri, sakatlıktan çıkış, personel ve padok
etkisi, yem envanteri ve besleme.

## Race Engine Status — TESTED

Deterministik, 8/10/12/14/16 at, tempo/sollama/blok/pozisyon/dayanıklılık,
zemin/hava/mesafe, jokey etkisi (beceri + at uyumu + form/yorgunluk), taktik,
oyuncu kontrolü (kırbaç/yön/sakin), tekrar oynatma. Denge ölçümü CI'da kilitli
(`RACE_BALANCE_REPORT.md`). Bilinen ölçülmüş risk: sürpriz payı dar —
bilinçli düzeltilmedi. Start kulvarı (`gatePosition`) motorda okunmuyor —
sahibinin kararı bekliyor.

## Genetics Status — TESTED

Kalıtım, mutasyon, soy ağacı, görünüş kalıtımı, tay ırkı (melez kuralı config'te).

## Management Status — TESTED

Jokey (kiralama/bırakma, beceri, at uyumu, form/yorgunluk), personel (sözleşme
peşin, süre dolumu, etkiler), pazar (sabit fiyat + müzayede/emanet, süre dolumu
zamanlayıcısı, bildirimler).

## Farm Status — TESTED

Yedi tesis tipi, inşa/yükseltme (para yolu), etkiler bağlı (padok, pist,
depo, üreme merkezi, personel binası); veteriner merkezi bilinçli olarak kapalı.

## 3D Status — PARTIAL

Kod hattı TAM (R3F): yarış, misafir vitrini, ahır; beş hipodrom (Veliefendi,
Ankara, İzmir, Adana, Bursa) temalı arka planla; GLB bağlama, LOD, kalite
kademesi + otomatik düşürme, ışık/HDRI (yerel), start kapısı, toz, figürlü
kalabalık, jokey kamerası, foto-finiş, ses (dosya yoksa sessiz).
**Gerçek varlık YOK** — prosedürel at/jokey/hipodrom + "PLACEHOLDER" rozeti.
Brief §30 gereği bu hâli üretime hazır SAYILMAZ. Varlıklar ÜCRETLİ alınacak.

## Multiplayer Status — TESTED (üretim değil)

Lobi yarışı (katıl/hazır/ayrıl, kilit, kesinleşme, iade, masa kuralları,
ırk sınıfı, at seviyesi aralığı, Hemen Katıl), eşleştirme, turnuva, takvim
(özel yarış dahil), kontrollü canlı yarış, tribün (canlı + tekrar + hediye +
emote), yeniden bağlanma. Çok örnek: zamanlayıcı lider kilidi + Socket.IO
Redis köprüsü (e2e: iki örnek). Şüpheli desen listesi (yalnızca inceleme) ve
yük testi (CI bütçe kapısı) VAR.

## Social Status — TESTED

Arkadaşlık (yalnızca birlikte yarışanlar), mesaj, hediye (para yolu), dostluk
hediyesi, engelleme/şikâyet, profil (+ fotoğraf, avatar, başarımlar),
bildirimler, yarış daveti, kulüp (kur/katıl/davet/lider devri/puan/sohbet),
tribün emote + hediyesi, kulüp içi yarış (09.10.2026). YOK: sosyal hub (avatarlı alan),
kulüpler arası yarış (sahibi kulüp içini seçti).

## AI Avatar Status — PARTIAL

Manuel avatar (katalog, kimlikten türetilen varsayılan, 2B portre + prosedürel
3D figür) ve profil fotoğrafı (meta veri silinir, moderasyon) VAR. AI hattı
altyapısı VAR (rıza, yükleme doğrulaması, asenkron iş + zamanlayıcı,
sağlayıcı/depo soyutlaması, gizlilik silmesi, yönetimde AI işleri).
**Gerçek sağlayıcı YOK** → özellik kapalı (503, dosya okunmadan).

## Mobile/PWA Status — IMPLEMENTED

Duyarlı arayüz, alt sekme çubuğu, 3D kalite kademesi/otomatik düşürme,
manifest + üretilen ikonlar. Gerçek cihaz testi YAPILMADI. Service worker
bilinçli olarak yok.

## Admin Status — TESTED

Roller (`is_admin`, `is_moderator`; her istekte DB'den, izin tablosu
`domain/admin/staff.ts`), denetim günlüğü aynı transaction'da: şikâyet
kuyruğu, oyuncu/yarış/işlem listeleri, yarış iptali (iade), rol atama,
askı/yasak, duyurular, etkinlikler, bakiye düzeltmesi, at araması, şüpheli
desenler, AI işleri, fotoğraf kaldırma, salt okuma ayar/sezon/turnuva.
YOK: çalışma anında ayar düzenleme (bilinçli), IP alanı.

## Live Operations Status — TESTED

Takvim yarışları (özel/ırka/seviyeye özel programlar), turnuvalar, sezon +
ödülü, haftalık/aylık sıralama (birincilik sayısına göre), günlük ödül,
duyurular, görevler + süreli etkinlikler, başarımlar (arkadaş başarımları
dahil). YOK: etkinlik para birimi, kulüp/sezon görevleri.

## Observability Status — PARTIAL

VAR: `/health` + `/health/ready` (DB + Redis), `X-Request-Id`, hata zarfında
`requestId`, üretimde JSON log, değiştirilebilir hata raporlayıcı, web hata
sınırları + `POST /client-errors`, `GET /metrics` (Prometheus, token'lı) +
alarm webhook'u (soğumalı). YOK: seçilmiş hata izleme hizmeti (Sentry vb.)
ve metrik toplayan/gösteren altyapı (sağlayıcı kararı).

## Deployment Status — PARTIAL

VAR: API/web Dockerfile'ları, CI'da imaj build + duman testi, üretim ortam
doğrulaması (açılışta), `docker-compose.staging.yml`, yedek/geri yükleme
betikleri + CI provası, `docs/DEPLOYMENT.md`. YOK: gerçek staging/production
ortamı, imaj kayıt defteri + dağıtım hattı, gizli anahtar yöneticisi.

## Security Status — PARTIAL (iyi temel)

Sunucu otoritesi, sahiplik kapıları, IDOR (403 önce 404 sonra), hız sınırı,
idempotency, değişmez defter, gizli statların ve tohumun sızmaması, helmet,
yükleme güvenliği (baytlardan biçim doğrulaması, meta veri silme, sunucu
üretimli depo anahtarı), imzalı ödeme webhook'u, CI'da bağımlılık kapısı
(izin listesi BOŞ) + gitleaks. YOK: SAST, dış sızma testi.

## Testing Status — TESTED

Birim (domain), entegrasyon/e2e (gerçek Postgres + Redis, supertest +
socket.io-client, iki uygulama örneği), güvenlik (`test/security`), denge
(265k simülasyon), determinizm parmak izi, para mutabakatı, yük testi (CI),
tarayıcı kontrolleri (yerel Playwright). YOK: CI'da tarayıcı E2E, mutasyon testi.

## Documentation Status — IMPLEMENTED

`CLAUDE.md` (kurallar + tuzaklar, madde 1–78), `PROJE_DURUMU.md` (tarihçe
§13.1–13.102), `docs/*` (API, DB, motor, ekonomi, güvenlik, dağıtım, denge
raporu, varlık rehberi). `README.md`/`ROADMAP.md` faz tabloları BAYAT
(CLAUDE.md kural 9). İki `AUDIT_REPORT.md` tarihli anlık görüntüdür (yukarı bak).

## Existing Bugs

- Bilinen açık hata YOK (14.10.2026 denetiminden sonra).
- 14.10.2026'da kapatılan (dal `fix/project-audit`, CLAUDE.md (86)): katılımsız
  oyuncu yarışı başlangıçtan sonra ölü kalıp açık yarış tavanını kalıcı
  dolduruyordu (oyuncu bir daha yarış açamıyordu); kilitlenirken hata veren
  yarışlar kuyruğu tıkayabiliyordu; oyuncu kendi yarışını iptal edemiyordu;
  `/admin` ilk isteği tokensız gidiyordu.
- Ölçülmüş tasarım riski: yarış sürpriz payı dar (`RACE_BALANCE_REPORT.md` §2c).
- 09.10.2026'da kapatılan: takvim liste sınırından fazla yarış açık tuttuğu için
  oyuncunun açtığı/katıldığı geç yarış lobi listesinden düşebiliyordu (artık başta).

## Missing Features

Apple girişi · gerçek AI avatar sağlayıcısı · gerçek ödeme · gerçek 3D/ses varlıkları · sosyal hub · etkinlik para
birimi. (Çalışma anında ayar düzenleme bilinçli olarak YOK — ayar dosyası
kodla birlikte dağıtılır.)

## Technical Debt

- Zamanlayıcılar API sürecinde (ayrı worker/kuyruk yok); lider kilidi var.
- `in_progress` yarış durumu ölü (miras).
- `PlayerDemoWidget` bağlı değil (bilinçli, kaldırılabilir).
- `gemShopWhitelist` ölü config (okuyan kod yok).
- ROADMAP faz tablosu bayat (README'deki 14.10.2026'da kaldırıldı).
- Turnuvalar masasız (kendi kuralları var: rake yok, ilk üçe 50/30/20);
  takvim programları 09.10.2026'dan beri masaya bağlı.

## Production Blockers

1. Gerçek 3D/ses varlıkları (satın alınacak).
2. Gerçek ödeme sağlayıcısı + yasal inceleme (altyapı hazır, kapalı).
3. AI avatar sağlayıcısı + çok örnekte S3 uyumlu depo (altyapı hazır, kapalı).
4. Kimlik bilgileri: `GOOGLE_OAUTH_CLIENT_ID`, `RESEND_API_KEY`, Apple.
5. İzleme hizmeti seçimi (metrik ucu + alarm kancası hazır).
6. Dağıtım: gerçek staging/production, kayıt defteri, gizli anahtar yöneticisi.

## Recommended Priority

1. Sahibinin dış kararları: 3D/ses varlıkları, ödeme sağlayıcısı, AI avatar
   sağlayıcısı, izleme hizmeti, Apple kimlik bilgileri.
2. Gerçek staging ortamı (compose dosyası + duman testi hazır).
3. Açık oyun tasarımı soruları (kulvar etkisi, sürpriz payı).

## Current Phase

Brief fazlarına göre gerçek durum:

| Faz | Durum |
|---|---|
| 0 Audit | COMPLETE |
| 1 Core | TESTED — Apple girişi yok (kimlik bilgisi) |
| 2 Management | TESTED |
| 3 Genetics | TESTED |
| 4 Farm | TESTED |
| 5 Advanced Race | TESTED (kulvar etkisi hariç — karar bekliyor) |
| 6 3D/Presentation | PARTIAL — kod tam, gerçek varlık yok |
| 7 Online | TESTED — çok örnek (lider kilidi + Redis köprüsü), anti-cheat inceleme, yük testi |
| 8 AI Avatar | PARTIAL — manuel avatar + fotoğraf + AI altyapısı; gerçek sağlayıcı bekliyor |
| 9 Social | TESTED — sosyal hub yok |
| 10 Admin | TESTED |
| 11 Live Ops | TESTED — etkinlik para birimi yok |
| 12 Monetization | PARTIAL — altyapı + mağaza + makbuz + iade; gerçek sağlayıcı yok |
| 13 Production | PARTIAL — temel + Nest 11/Next 16 + staging compose + yedek provası + metrik/alarm; gerçek ortam yok |
| 14 Final E2E | TESTED — `final.e2e-spec.ts` + `player-journey.e2e-spec.ts` |

## Next Phase

Kodla kapanabilecek büyük bir eksik kalmadı; kalanların çoğu sahibinin dış
kararına bağlı (yukarıdaki öncelik 1). Arada yapılabilecek: sosyal hub (avatar
sonrası).

---

## Faz Raporu

> Aşağıdaki raporlar YAZILDIKLARI GÜNÜN durumudur (değiştirilmez). 07.10.2026
> sonrası dilimlerin raporu `PROJE_DURUMU.md` §13.85–13.102'dedir.

PHASE: 0 — Audit / Architecture
STATUS: COMPLETE
COMPLETED: Kod tabanının gerçek durumu çıkarıldı (bu dosya).
FILES CREATED: MASTER_STATUS.md
FILES MODIFIED: —
DATABASE CHANGES: —
API CHANGES: —
FRONTEND CHANGES: —
BACKEND CHANGES: —
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: —
ADMIN CHANGES: —
DEPLOYMENT CHANGES: —
TESTS ADDED: —
TESTS PASSED: API 2331/2331, web 509/509 (yerel, temiz şema)
TESTS FAILED: 0 (CI #264 kararsız testten düştü; düzeltme 580bc6d + 159b93e)
BUGS FOUND: mockDeposit üretimde açık; gemShopWhitelist ölü config; /health DB/Redis'i denetlemiyor
BUGS FIXED: kararsız antrenman testleri
TECHNICAL DEBT: yukarıda
PRODUCTION BLOCKERS: yukarıda (8 madde)
REMAINING: Faz 1-B, 13-A, 10, 11, 8, 12, 6
NEXT PHASE: 1-B Hesap/oturum tamamlama

---

PHASE: 1-B.1 — Oturum güvenliği (refresh token, logout, logout-all, cihazlar)
STATUS: TESTED
COMPLETED: Kısa ömürlü erişim JWT'si (`sid`) + dönen refresh token; yeniden
kullanım tespiti; sunucu tarafı çıkış / tüm cihazlardan çıkış; cihaz listesi
ve kapatma (IDOR 404); eski token kabulü + yükseltme; şifre sıfırlamada tüm
oturumların aynı transaction'da kapanması; guard + soket oturum kapısı;
web otomatik yenileme, sekmeler arası kilit, yalnızca 401'de oturum silme,
`/account` "Oturumlar" paneli.
FILES CREATED: database/migrations/0057_create_auth_sessions.{up,down}.sql ·
apps/api/src/domain/auth/session.ts · application/ports/auth-session.repository.ts ·
application/use-cases/auth-session.use-case.ts ·
infrastructure/auth/postgres-auth-session.repository.ts ·
apps/web/src/lib/session-logic.ts · features/auth/{SessionsPanel.tsx,device-label.ts} ·
testler (aşağıda)
FILES MODIFIED: auth.guard · auth.controller · player.controller · race.gateway ·
token.service (+jsonwebtoken) · token.module · postgres-player-credentials.repository ·
http-exception.filter · config/auth.config.json (+session) · game-config types ·
shared-types (AuthSession, SessionTokens, AuthSessionInfo, 3 hata kodu) ·
web api-client · player-context · account sayfası · globals.css · belgeler
DATABASE CHANGES: `auth_sessions` tablosu + `players.tokens_valid_after` (veri bozmayan, eklemeli)
API CHANGES: POST /auth/refresh, /auth/session, /auth/logout, /auth/logout-all;
GET /auth/sessions; DELETE /auth/sessions/:id. Giriş/kayıt yanıtına
`refreshToken` + `accessTokenExpiresAt` eklendi. Var olmayan oyuncunun
token'ı 401 (eskiden 404). Soket reddi artık `connect_error`.
FRONTEND CHANGES: otomatik yenileme, eski oturum yükseltme, Oturumlar paneli
BACKEND CHANGES: oturum servisi, guard async, soket kimliği ara katmanda
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: iptal edilebilir oturum; çalıntı refresh tespiti; şifre
sıfırlama tüm oturumları öldürür; refresh token düz metni saklanmaz/loglanmaz
ADMIN CHANGES: —
DEPLOYMENT CHANGES: `JWT_EXPIRES_IN_SECONDS` env KALDIRILDI (süre config'te)
TESTS ADDED: api `auth-session.e2e-spec.ts` (10), `domain/auth/session.spec.ts` (5),
`realtime.e2e-spec.ts` (+1: çıkmış token soket açamaz); web `session-logic.spec.ts`,
`player-context.spec.tsx` (+3), `api-client.spec.ts` (+5)
TESTS PASSED: API 2346/2346 (157 dosya, temiz şema), web 43 dosya yeşil; tarayıcıda
uçtan uca (kayıt → bozuk token → yenileme → eski token yükseltme → tüm cihazlardan çıkış)
TESTS FAILED: 0
BUGS FOUND: web her hatada (ağ kopması dahil) oturumu siliyordu; soket kapısı
async olunca ilk olay `playerId`siz işleniyordu; StrictMode çift yükseltme
BUGS FIXED: üçü de
TECHNICAL DEBT: açık soket bağlantısı çıkışta koparılmaz (yeni bağlantı reddedilir)
PRODUCTION BLOCKERS: "iptal edilemez 30 günlük JWT" KAPANDI
REMAINING: 1-B.2 e-posta doğrulama, 1-B.3 hesap silme, 13-A üretim temeli
NEXT PHASE: 1-B.2 E-posta doğrulama

---

PHASE: 1-B.2 — E-posta doğrulama
STATUS: TESTED
COMPLETED: Kayıtta doğrulama e-postası; tek kullanımlık, süreli, e-postaya
bağlı bağlantı (özet saklanır); yeniden gönderme (aralık sınırı); durum
`GET /auth/credentials.emailVerified`; `/account` rozeti + `/account/verify`.
FILES CREATED: database/migrations/0058_create_email_verification.{up,down}.sql ·
application/use-cases/email-verification.use-case.ts · apps/web/src/app/account/verify/page.tsx ·
test/api/email-verification.e2e-spec.ts
FILES MODIFIED: player-credentials port + Postgres repo · auth.controller/module ·
domain/auth/errors · http-exception.filter · config/auth.config.json (+emailVerification) ·
game-config types · shared-types (AccountCredentialsView.emailVerified, 3 kod) ·
web api-client + account sayfası · password-reset/google-link e2e (yeni e-posta/alan) · belgeler
DATABASE CHANGES: `player_credentials.email_verified_at` + `email_verification_tokens` (eklemeli)
API CHANGES: POST /auth/email/verification, POST /auth/email/verify; credentials görünümüne `emailVerified`
FRONTEND CHANGES: doğrulama rozeti, tekrar gönder, doğrulama sayfası (düğmeyle)
BACKEND CHANGES: EmailVerificationUseCase
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: bağlantı düz metni saklanmaz/loglanmaz; e-posta değişirse eski bağlantı geçersiz
ADMIN CHANGES: —
DEPLOYMENT CHANGES: üretimde gerçek gönderim için `RESEND_API_KEY` (değişmedi)
TESTS ADDED: email-verification.e2e-spec.ts (5), web api-client (+1)
TESTS PASSED: API 158 dosya (2355 test; temiz şema), web 43 dosya / 523; tarayıcıda uçtan uca
TESTS FAILED: 0
BUGS FOUND: 98519ab öncesi e653023'te iki soket testi yanlışlıkla düşmüştü (CI lint yakaladı) — geri eklendi
BUGS FIXED: aynı
TECHNICAL DEBT: doğrulanmamış e-postayla adres işgali (devralma kararı yok)
PRODUCTION BLOCKERS: —
REMAINING: 1-B.3 hesap silme, 13-A üretim temeli
NEXT PHASE: 1-B.3 Hesap silme

---

PHASE: 1-B.3 — Hesap silme / veri yaşam döngüsü
STATUS: TESTED
COMPLETED: Kişisel veri silme + anonimleştirme (defter/maç geçmişi korunur);
parası emanette olan hesapta engel (kilit altında); onay (kullanıcı adı +
şifre); silinmiş oyuncu oturum açamaz, listelenmez; `/account` "Hesabı sil".
FILES CREATED: database/migrations/0059_add_player_deleted_at.{up,down}.sql ·
domain/account/account-deletion.ts · application/ports/account-deletion.repository.ts ·
application/use-cases/delete-account.use-case.ts ·
infrastructure/account/postgres-account-deletion.repository.ts · api/auth/account.controller.ts ·
apps/web/src/features/auth/DeleteAccountPanel.tsx · test/api/account-deletion.e2e-spec.ts
FILES MODIFIED: auth.module · domain/auth/errors · http-exception.filter · auth-session repo
(deleted_at) · player repo (findById/findByUsername/profil) · leaderboard + sezon sorguları ·
shared-types (AccountDeletionCheck, 3 kod) · web api-client, player-context (forgetSession),
account sayfası · belgeler
DATABASE CHANGES: `players.deleted_at` (eklemeli; veri bozmaz)
API CHANGES: GET /account/deletion, POST /account/delete
FRONTEND CHANGES: Hesabı sil paneli (engel listesi, onay, şifre)
BACKEND CHANGES: DeleteAccountUseCase + tek transaction'lı silme
GAMEPLAY CHANGES: silinmiş oyuncu sıralama/sezon ödülüne girmez
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: silinen hesabın tüm token'ları anında geçersiz; yanlış şifre 403
ADMIN CHANGES: — (yönetim listesi silinmiş oyuncuyu anonim adıyla gösterir)
DEPLOYMENT CHANGES: —
TESTS ADDED: account-deletion.e2e-spec.ts (5), web api-client (+1)
TESTS PASSED: API 159 dosya / 2362 (temiz şema), web 43 / 524; tarayıcıda uçtan uca
TESTS FAILED: 0
BUGS FOUND: —
BUGS FIXED: —
TECHNICAL DEBT: kişisel veri dışa aktarma yok; şikâyet metinleri moderasyon kaydı olarak kalır
PRODUCTION BLOCKERS: "hesap/veri silme yok" KAPANDI
REMAINING: 13-A üretim temeli (health DB/Redis, request id, mockDeposit üretimde kapalı, CI taramaları, Dockerfile)
NEXT PHASE: 13-A Üretim temeli

---

PHASE: 13-A — Üretim temeli
STATUS: TESTED (Docker imajları yalnızca CI'da derlenir — yerelde Docker daemon yok)
COMPLETED: Üretim ortam kapısı (eksik/zayıf ortamda açılmaz); `/health/ready`
(DB + Redis); istek kimliği (başlık + hata zarfı + log); cüzdan formu sunucu
bayrağına bağlı; CI bağımlılık kapısı + gitleaks; API/web Dockerfile + CI build
+ duman testi; `images.unoptimized` (savunma katmanı); `docs/DEPLOYMENT.md`.
FILES CREATED: config/ops.config.json · infrastructure/ops/production-env.ts ·
api/middleware/request-id.middleware.ts · tools/security/audit-gate.mjs ·
security/audit-allowlist.json · .gitleaksignore · .dockerignore ·
apps/api/Dockerfile · apps/web/Dockerfile · docs/DEPLOYMENT.md ·
test/security/production-env.spec.ts · test/api/ops.e2e-spec.ts
FILES MODIFIED: main.ts · app.module.ts · health.controller · http-exception.filter ·
get-wallet use-case + wallet repo/port · game-config (loadOpsConfig) · shared-types
(WalletView.depositAvailable) · web wallet sayfası + next.config.mjs · ci.yml ·
apps/api/.env.example · belgeler
DATABASE CHANGES: —
API CHANGES: GET /health/ready; tüm yanıtlarda X-Request-Id; hata zarfında error.requestId;
GET /players/:id/wallet → depositAvailable
FRONTEND CHANGES: yatırma formu yalnızca sunucu izin verirse
BACKEND CHANGES: açılış ortam doğrulaması, istek kimliği ara katmanı
GAMEPLAY CHANGES: —
3D CHANGES: —
AI CHANGES: —
SECURITY CHANGES: zayıf/eksik gizli değerle açılmama; DISABLE_RATE_LIMIT üretimde yasak;
istek kimliği güvenli karakterle sınırlı (log enjeksiyonu yok); bağımlılık + gizli anahtar taraması
ADMIN CHANGES: —
DEPLOYMENT CHANGES: Dockerfile'lar, migrate hedefi, HEALTHCHECK, CI imaj build
TESTS ADDED: production-env.spec.ts (16), ops.e2e-spec.ts (6, Redis düşük senaryosu dahil)
TESTS PASSED: API 161 dosya / 2383 (temiz şema), web 43 / 524; derlenmiş sunucu üretim modunda
eksik ortamla çıkış 1, tam ortamla /health/ready 200; audit kapısı yeni açıkla 1 döner (negatif deneme)
TESTS FAILED: 0
BUGS FOUND: web yatırma formu üretimde de görünüyordu; Faz 0 "mockDeposit üretimde açık" tespiti yanlıştı
BUGS FIXED: ikisi de
TECHNICAL DEBT: `images.unoptimized` etkisi yerelde gösterilemedi (uç her iki ayarda 404) —
asıl çözüm Next yükseltmesi
PRODUCTION BLOCKERS: Next 14 kritik açıklar (yeni, 9. madde) — Faz 13-B
REMAINING: 13-B çerçeve yükseltmesi (Next 16 + React 19, Nest 12), staging, hata izleme, yedek provası
NEXT PHASE: 13-B Next/Nest yükseltmesi (izin listesi 2026-11-01'de biter)

---

PHASE: 13-B.1 — Nest 10 → 11 (multer/express açıkları)
STATUS: TESTED
COMPLETED: @nestjs/* 11.2.7 (express 5.2.1, multer 2.4.0); multer'in 8 yüksek
danışmanı kapandı ve izin listesinden çıkarıldı (kalan 12 kayıt: Next 14 + postcss).
Nest 12 GEREKMEDİ: açık aralığı `<=11.1.14`; 11.2.7 güvenli.
FILES MODIFIED: apps/api/package.json, package-lock.json, app.module.ts (`'{*path}'` —
Express 5 adlandırılmış joker; `'*'` başlangıçta uyarı veriyordu),
security/audit-allowlist.json, .github/workflows/ci.yml (gitleaks teşhisi),
test/api/interactive-race.e2e-spec.ts
DATABASE CHANGES: —
API CHANGES: — (sorgu parametreleri düz `@Query('x')`; Express 5'in basit ayrıştırıcısı aynı sonucu verir)
SECURITY CHANGES: 8 yüksek multer DoS danışmanı kapandı
TESTS PASSED: API 161 dosya / 2383 (temiz şema; bir test kendi iddia hatası — aşağıda);
derlenmiş sunucu Nest 11 ile açılıyor, /health/ready 200, X-Request-Id 404/401'de var, rota uyarısı yok
BUGS FOUND: (1) `interactive-race` testine dün koyduğum üst sınır YANLIŞTI: sunucu komutu
`commandSafetyMs` İLERİSİNE yazar; doğru değişmez "yanıt anında gösterilmiş segmente düşmez".
(2) f6df133 CI'ında gitleaks adımı düştü; yerelde (tüm dallar + PR birleştirme simülasyonu)
yeniden üretilemedi, log'a erişim yok → adım ayrıldı ve bulgular annotation olarak yazılıyor.
BUGS FIXED: (1) düzeltildi, 3 ardışık koşu yeşil. (2) teşhis bekliyor.
REMAINING: 13-B.2 Next 16 + React 19 + R3F 9 / drei 10
NEXT PHASE: 13-B.2

---

PHASE: 13-B.2 — Next 14 → 16 + React 19 + R3F 9 / drei 10 / postprocessing 3
STATUS: TESTED
COMPLETED: next 16.3.8, react/react-dom 19, @react-three/fiber 9.8, drei 10.7,
postprocessing 3.1. Yüksek/kritik bağımlılık açığı: 0 (izin listesi BOŞ).
Dinamik sayfalar `useParams()`, rota işleyici `await params` (Next 15+ Promise).
Kökte eski React 18 kalıyordu (iki React → kırık JSX tipleri ve çalışma anında
çift React riski): kök `overrides` + kilit dosyasından React girişleri ayıklandı → tek React 19.
FILES MODIFIED: apps/web/package.json, package.json (overrides), package-lock.json,
apps/web/next-env.d.ts (Next 16 üretir), replays/[raceId] + races/[raceId]/watch sayfaları,
pwa-icon rota işleyicisi, next.config.mjs (yorum), security/audit-allowlist.json (boş),
apps/api/Dockerfile + apps/web/Dockerfile (çalışma alanı node_modules), .gitleaks.toml, ci.yml
BUGS FOUND: (1) API imajı Nest 11 ile açılmıyordu: Dockerfile yalnızca kök node_modules'u
kopyalıyordu, express 5/Nest 11 apps/api/node_modules'teydi (`Cannot find module '@nestjs/core'`,
yerelde birebir yeniden üretildi). (2) gitleaks: aynı yanlış pozitifler CI'ın çektiği başka
commit'lerde (parmak izi tutmaz). İlk istisna denemesi (yol + AND) bu sürümde bütün dosyayı
muaf tutuyordu — gerçek bir anahtarı gizledi; satır desenine daraltıldı ve sentetik depoda
kanıtlandı.
BUGS FIXED: ikisi de
TESTS PASSED: web 43 / 524, next build, API 161 / 2383 (temiz şema), tarayıcıda ana sayfa/ahır/
kontrollü yarış 3D sahneleri + 6 sayfa: sayfa hatası 0; yalnızca beklenen eksik-varlık HEAD 404'leri
PRODUCTION BLOCKERS: 9. madde (Next 14 açıkları) KAPANDI
REMAINING: staging, hata izleme, yedek provası (13-C)

---

PHASE: 13-C — Yedek provası + staging yığını + hata izleme temeli
STATUS: TESTED (staging yığını yalnızca CI'da kapsayıcılarla koşar; yerelde aynı
süreçlerle — derlenmiş API üretim modu + next start — duman testi geçti)
COMPLETED: db-backup / db-restore (boş olmayan hedefi reddeder) / backup-drill +
db-fingerprint; CI'da test verisiyle prova. docker-compose.staging.yml +
.env.staging.example + tools/ops/smoke.mjs; CI'da yığın + duman testi. Üretimde JSON
log (JsonLogger), ErrorReporter (varsayılan log; Sentry takılabilir), filtre 500'ü
raporlar, POST /client-errors, web error.tsx + global-error.tsx.
FILES CREATED: tools/ops/{db-backup.sh,db-restore.sh,backup-drill.sh,db-fingerprint.mjs,smoke.mjs} ·
docker-compose.staging.yml · .env.staging.example · infrastructure/ops/{structured-log,error-reporting}.ts ·
api/ops/{client-errors.controller,ops.module}.ts · web app/error.tsx, app/global-error.tsx,
features/errors/error-report.ts · testler (aşağıda)
FILES MODIFIED: main.ts · app.module.ts · http-exception.filter · config/ops.config.json
(+clientErrors) · game-config types · web api-client · ci.yml · .gitignore (.env.staging) ·
docs/DEPLOYMENT.md
DATABASE CHANGES: —
API CHANGES: POST /client-errors (202; mesajsız 400)
SECURITY CHANGES: rapora sorgu dizesi girmez (token olabilir); istemciye yığın izi yok;
raporlayıcı hatası isteği düşürmez; .env.staging gitignore
DEPLOYMENT CHANGES: staging compose, duman testi, yedek/geri yükleme betikleri
TESTS ADDED: test/security/error-reporting.spec.ts (3), test/api/client-errors.e2e-spec.ts (2),
web test/features/errors/error-report.spec.ts (3)
TESTS PASSED: API 163 / 2388 (temiz şema), web 44 / 527, next build; yedek provası test verisiyle
(48 tablo, 615 defter satırı); negatif: dolu hedef reddedildi, +1 bakiye farkı yakalandı;
duman testi 6/6 (üretim modu)
TESTS FAILED: 0
PRODUCTION BLOCKERS: sağlayıcı kararları: barındırma, imaj kayıt defteri, gizli anahtar
yöneticisi, hata izleme hizmeti, zamanlanmış yedek/saklama süresi
REMAINING: sahibinin sağlayıcı kararları; kalan fazlar (8 AI avatar, 10/11 admin+live ops, 12 ödeme)
NEXT PHASE: sahibinin kararına bağlı

---

PHASE: 10 + 11-A — Roller, yaptırımlar, duyurular
STATUS: TESTED
SUMMARY: Moderatör rolü + izin tablosu; askı (süreli) / yasak (süresiz) + kaldırma; rol
atama; duyurular (yönetimden açılır, herkes görür). Askı oturum kapısında (istek, soket,
giriş, yenileme → 403 ACCOUNT_SUSPENDED); yasak oturumları kapatır. Her yazma denetim
kaydıyla aynı transaction'da.
FILES CREATED: migration 0060 · config/moderation.config.json · domain/admin/staff.ts ·
ports/moderation.repository.ts · infrastructure/admin/postgres-moderation.repository.ts ·
use-cases/moderation.use-case.ts · api/admin/moderation.controller.ts · web
features/admin/{PlayerModerationPanel,AnnouncementsAdmin,moderation-labels} ·
features/announcements/{AnnouncementStrip,announcement-logic} · testler
FILES MODIFIED: auth-session (use-case/repo/domain) · admin repo + 3 use-case (moderatör izni) ·
player tipi/mapper (isModerator) · http-exception.filter · shared-types · game-config ·
web admin/page, layout, TopBar, api-client, player-context, session-logic, globals.css
DATABASE CHANGES: 0060 — players.is_moderator, player_sanctions, announcements (yalnızca ekleme)
API CHANGES: POST/GET /admin/players/:id/sanctions · POST /admin/sanctions/:id/lift ·
PUT /admin/players/:id/role · POST/GET /admin/announcements · POST
/admin/announcements/:id/archive · GET /announcements (@Public) · GET /admin/players
+isModerator/activeSanction · PlayerSummary.isModerator
SECURITY CHANGES: yetki her istekte DB'den, 403 önce 404 sonra; kendine rol/yaptırım yasak;
personele yaptırım yasak; moderatör yasak/uzun askı veremez; askı 401 değil 403 (oturum kaybolmaz)
TESTS ADDED: test/api/staff-moderation.e2e-spec.ts (8), web announcement-logic (3),
moderation-labels + isAccountSuspended (3), player-context askı (1), api-client rotaları (1)
TESTS PASSED: API 164 / 2398 (temiz şema), web 46 / 535, next build, lint 0 hata; tarayıcı:
duyuru yayınlandı → şeritte göründü, askı uygulandı → oyuncu mesajı gördü, oturum kaldı
TESTS FAILED: 0
PRODUCTION BLOCKERS: değişmedi
REMAINING: 11-B etkinlikler, at/pazar/config yönetimi, anormal davranış tespiti
NEXT PHASE: sahibinin kararı (8 AI avatar / 12 ödeme sağlayıcı bekliyor; kodla yapılabilen: 11-B)

---

PHASE: 11-B — Günlük/haftalık görevler + yönetimden etkinlik
STATUS: TESTED
SUMMARY: Brief §68 görevleri (Bugün: 2 antrenman, 1 yarış, 1 bakım; Bu hafta: 5 yarış,
1 galibiyet, 1 at alımı) config'ten; ilerleme mevcut tablolardan türetilir. Yönetici süreli
etkinlik açar (ölçüt × adet × para ödülü). Ödül talebi para yolu, tek seferlik.
FILES CREATED: migration 0061 · config/quests.config.json · shared-types quests.ts ·
domain/quests/{quests,errors}.ts · ports/quest.repository.ts · infrastructure/quests/
postgres-quest.repository.ts · use-cases/quest.use-case.ts · api/quests/{controller,module} ·
web app/quests/page.tsx, features/quests/quest-labels.ts, features/admin/LiveEventsAdmin.tsx · testler
FILES MODIFIED: app.module · http-exception.filter · staff.ts (events.manage) · economy.ts
(quest_reward, event_reward) · error-codes · game-config · web api-client, nav-links/icons,
admin/page, moderation-labels, ledger-labels, globals.css
DATABASE CHANGES: 0061 — live_events, quest_claims (yalnızca ekleme)
API CHANGES: GET /quests · POST /quests/:key/claim · POST /events/:id/claim ·
POST/GET /admin/events · POST /admin/events/:id/archive
SECURITY CHANGES: ilerleme/ödül istemciden alınmaz; talep kilit altında yeniden sayar;
tekil talep kısıtı çift ödemeyi keser (eşzamanlı 4 talep → 1 ödeme, testli); yönetim yetkisi
DB'den, 403 önce 404 sonra; asgari alım fiyatı 0 TL el değiştirmeyle görev tamamlatmaz
TESTS ADDED: test/domain/quests/quests.spec.ts (18), test/api/quests.e2e-spec.ts (11),
web quest-labels (4) + api-client rotaları (1)
TESTS PASSED: API 166 / 2429 (temiz şema), web 47 / 540, next build, lint 0 hata; tarayıcı:
etkinlik açıldı → bakım → görev + etkinlik ödülü alındı (+850, defter iki satır)
TESTS FAILED: 0
PRODUCTION BLOCKERS: değişmedi
REMAINING: başarımlar, kulüp/sezon görevleri, at/pazar/config yönetimi
NEXT PHASE: sahibinin kararı (8 AI avatar / 12 ödeme sağlayıcı bekliyor)

---

PHASE: 1 (kalan) — Kişisel veri dışa aktarma
STATUS: TESTED
SUMMARY: GET /account/export → hesap, giriş yöntemleri, oturumlar, atlar, para hareketleri,
yarışlar, mesajlar, arkadaşlıklar, engeller, yaptığım şikâyetler, hediyeler, bildirimler,
kulüp, yaptırımlar, görev ödülleri. Web: /account "Verilerimi indir" (JSON dosyası).
FILES CREATED: ports/account-export.repository.ts · infrastructure/account/postgres-account-export.repository.ts ·
use-cases/export-account-data.use-case.ts · web features/auth/{ExportDataPanel.tsx,data-export.ts} · testler
FILES MODIFIED: account.controller · auth.module · auth.config.json (dataExport) · game-config ·
shared-types player.ts · web api-client, account/page
DATABASE CHANGES: —
API CHANGES: GET /account/export (3/saat, Cache-Control: no-store)
SECURITY CHANGES: sütunlar açıkça seçilir; özetler, başka oyuncu kimlikleri, şikâyetçi ve
yaptırımı veren yönetici yanıta girmez (e2e ham JSON'da arar); silinmiş hesap dışa aktarılmaz
TESTS ADDED: test/api/account-export.e2e-spec.ts (4), web data-export (2)
TESTS PASSED: e2e 4/4, web 48 / 542; tarayıcı: indirilen dosya 15 bölüm
TESTS FAILED: 0
REMAINING: Apple girişi (sahibinin kimlik bilgisi)
NEXT PHASE: Faz 5 — start kulvarı etkisi (motor; sahibinin kararı gerekir)

---

PHASE: 7 (kalan) — Anti-cheat: şüpheli desenler
STATUS: TESTED
SUMMARY: Sunucu otoriter (istemci sonuç/para belirleyemez); kalan risk çoklu hesapla değer
aktarma. Üç desen yönetime inceleme listesi olarak: hediye hunisi, tekrarlayan alım-satım
çifti, yeni hesaptan para çıkışı. Otomatik ceza yok.
FILES CREATED: config/anticheat.config.json · domain/anticheat/anomaly.ts · ports/anomaly.repository.ts ·
infrastructure/anticheat/postgres-anomaly.repository.ts · use-cases/list-anomalies.use-case.ts ·
web features/admin/AnomaliesAdmin.tsx · testler
FILES MODIFIED: staff.ts (anomalies.view: moderatör + yönetici) · moderation.controller · admin.module ·
shared-types admin.ts · game-config · web api-client, admin/page, moderation-labels
DATABASE CHANGES: —
API CHANGES: GET /admin/anomalies
SECURITY CHANGES: yetki DB'den, 403 önce; uç salt okur (testle kilitli)
TESTS ADDED: test/api/anomalies.e2e-spec.ts (4), test/domain/anticheat/anomaly.spec.ts (3)
TESTS PASSED: 7/7, web 48 / 542; tarayıcı: moderatör sekmeleri Şikâyetler/Oyuncular/Şüpheli, bulgular listelendi
TESTS FAILED: 0
REMAINING: Faz 7 yük testi; IP/cihaz sinyali (kişisel veri kararı)
NEXT PHASE: Faz 7 — yük testi

---

PHASE: 7 (kalan) — Yük testi
STATUS: TESTED
SUMMARY: Bağımlılıksız yük aracı + CI bütçe kapısı. Tek API örneği ~350 istek/sn'de doyuyor
(CPU tek çekirdek, yarış motoru); 200 eşzamanlı oyuncuda bile hata yok, yalnızca gecikme artıyor.
FILES CREATED: tools/ops/load-test.mjs
FILES MODIFIED: config/ops.config.json (loadTest) · game-config types · .github/workflows/ci.yml · docs/DEPLOYMENT.md
DATABASE CHANGES: —
API CHANGES: —
SECURITY CHANGES: araç yerel olmayan hedefe yalnızca --allow-remote ile gider
TESTS ADDED: CI "Load test (budget gate)" adımı
TESTS PASSED: yerel 25 oyuncu p95 395 ms / 0 hata; 100 ve 200 oyuncu 0 hata (p95 1266 / 2163 ms — bütçe dışı, bilgi amaçlı)
TESTS FAILED: 0
PRODUCTION BLOCKERS: yatay ölçek için zamanlayıcı lider kilidi (Faz 13)
REMAINING: Faz 7 tamam (yük kapasitesi gerçek sunucuda yeniden ölçülmeli)
NEXT PHASE: Faz 9 — Sosyal (emote, sosyal hub, kulüp sohbeti)

---

PHASE: 13 (parça) — Zamanlayıcı lider kilidi
STATUS: TESTED
SUMMARY: Birden çok API örneğinde zamanlanmış işleri (kilit, kesinleşme, takvim, turnuva, sezon,
eşleştirme, müzayede, kontrollü yarış) yalnızca lider örnek koşar. Postgres oturum kilidi; lider ölünce
izleyici devralır.
FILES CREATED: infrastructure/scheduler/scheduler-leader.ts · test/api/scheduler-leader.e2e-spec.ts
FILES MODIFIED: 7 zamanlayıcı (scheduleNext → runIfLeader) · app.module · ops.config.json
(schedulerLeader) · game-config types · 3 zamanlayıcı birim testi
DATABASE CHANGES: —
API CHANGES: —
SECURITY CHANGES: —
TESTS ADDED: scheduler-leader.e2e-spec.ts (3)
TESTS PASSED: API 170 / 2443 (temiz şema); yerel iki süreç: lider öldürüldü → izleyici 10 sn içinde devraldı
TESTS FAILED: 0
PRODUCTION BLOCKERS: çok örnek için Socket.IO Redis adaptörü
REMAINING: Socket.IO Redis adaptörü (sahibi onaylarsa)
NEXT PHASE: Faz 9 — Sosyal

---

PHASE: 9 — Sosyal (kulüp sohbeti + emote)
STATUS: TESTED
SUMMARY: Kulüp sohbeti (yalnızca üyeler, kalıcı) ve tribün emote'ları (anonim, kalıcı değil).
Social Hub brief §50'de avatarlı alan olarak tanımlı → Faz 8 ile.
FILES CREATED: migration 0062 · ports/club-chat.repository.ts · infrastructure/club/postgres-club-chat.repository.ts ·
use-cases/club-chat.use-case.ts · api/club/club-chat.controller.ts · web features/club/{ClubChatPanel,club-chat-logic},
features/race-viewer/emote-logic.ts · testler
FILES MODIFIED: club.module · race.gateway (race.emote) · chat.config.json (clubChat, emotes) · game-config ·
shared-types (social, player export bölümü) · hesap silme + dışa aktarma · web api-client, club/page,
LiveRaceViewer, RaceChatPanel, live-race-socket, globals.css
DATABASE CHANGES: 0062 — club_messages (yalnızca ekleme)
API CHANGES: GET/POST /clubs/:clubId/messages · soket race.emote (istemci → sunucu → oda)
SECURITY CHANGES: üyelik her istekte + yazma anında; emote anonim, anahtar listesi + abonelik + soğuma
TESTS ADDED: club-chat.e2e-spec.ts (5), race-emote.e2e-spec.ts (1, bariyerli), web emote-logic (3), club-chat-logic (1), api-client (1)
TESTS PASSED: API 172 / 2451 (temiz şema), web 50 / 547; tarayıcı: iki oyuncu kulüp sohbeti, emote ekranda
TESTS FAILED: 0
REMAINING: Social Hub (Faz 8), kulüp yarışı
NEXT PHASE: Faz 10 — Yönetim (at, ekonomi, config, sezon, turnuva yönetimi)

---

PHASE: 10 (parça) — Bakiye düzeltmesi + at araması
STATUS: TESTED
SUMMARY: Yönetici gerekçeli bakiye düzeltmesi (para yolu, idempotent, denetimli); moderatör +
yönetici için at araması.
FILES CREATED: ports/admin-ops.repository.ts · infrastructure/admin/postgres-admin-ops.repository.ts ·
use-cases/admin-ops.use-case.ts · api/admin/admin-ops.controller.ts · web features/admin/{BalanceAdjustmentForm,
HorsesAdmin}.tsx · testler
FILES MODIFIED: staff.ts (economy.adjust, horses.view) · admin errors + filter · admin.module ·
moderation.config.json · game-config · shared-types (economy: admin_adjustment/ADJUSTMENT; admin; error-codes) ·
web api-client, ledger-labels, PlayerModerationPanel, admin/page
DATABASE CHANGES: — (yeni defter türü serbest metin)
API CHANGES: POST /admin/players/:id/balance-adjustments (Idempotency-Key zorunlu) · GET /admin/horses?q=
SECURITY CHANGES: yalnızca yönetici; kendine/personele yasak; aynı anahtar ikinci kez ödemez; eksiye düşmez
TESTS ADDED: admin-ops.e2e-spec.ts (5), web balance-adjustment-form (2), api-client (1)
TESTS PASSED: API 173 / 2456 (temiz şema), web 51 / 550; tarayıcı: +1250 düzeltme + defter satırı, at araması
TESTS FAILED: 0
REMAINING: (aşağıdaki son parça)
NEXT PHASE: Faz 10 son parça

---

PHASE: 10 (son parça) — Salt okuma: etkin ayarlar, sezonlar, turnuvalar
STATUS: TESTED
SUMMARY: Yönetici etkin config'i (33 dosya, özetli) ve sezon/turnuva durumunu görür. Ayar düzenleme
bilinçli olarak yok (dağıtımla değişir). Faz 10'da kalan: AI Jobs (Faz 8).
FILES CREATED: infrastructure/admin/config-snapshot.ts · web features/admin/{ConfigAdmin,SeasonsAdmin}.tsx
FILES MODIFIED: admin-ops (port/repo/use-case/controller) · moderation.config.json (adminViews) · game-config ·
shared-types admin.ts · web api-client, admin/page, moderation-labels, globals.css
DATABASE CHANGES: —
API CHANGES: GET /admin/config · GET /admin/seasons · GET /admin/tournaments
SECURITY CHANGES: yalnızca yönetici; config'te gizli değer yok kuralı CLAUDE.md'ye yazıldı
TESTS ADDED: admin-ops.e2e-spec.ts (+2), web api-client (+1)
TESTS PASSED: admin-ops 7/7, web 51 / 551; tarayıcı: Ayarlar 33 dosya, Sezon & Turnuva listesi
TESTS FAILED: 0
REMAINING: AI Jobs (Faz 8)
NEXT PHASE: Faz 11 kalan (sezon olayları, özel yarışlar, sıralama sıfırlama kontrolü)

---

PHASE: 11 (kalan) — Dönemsel sıralama + özel yarış
STATUS: TESTED
SUMMARY: Haftalık/aylık sıralama (Leaderboard Resets) ve takvimde öne çıkan haftalık özel yarış
(Special Races). Faz 11 brief maddeleri: Season Events (sezon + etkinlikler), Daily/Weekly Events (görevler),
Special Races, Scheduled Jobs, Rewards, Announcements, Leaderboard Resets — hepsi VAR.
FILES CREATED: domain/ranking/period-window.ts · use-cases/period-leaderboard.use-case.ts · testler
FILES MODIFIED: season controller/module · race-lobby.config.json (sunday-derby) · online.config.json ·
game-config types · shared-types (online, race) · schedule-race-calendar (program ufku) · race-calendar
doğrulayıcı · race repository (featured + sıralama) · web leaderboard sayfası, lobby-logic, api-client
DATABASE CHANGES: —
API CHANGES: GET /leaderboard/period/:period · RaceLobbyListItem.calendar.featured
SECURITY CHANGES: —
TESTS ADDED: period-window.spec (4), period-leaderboard.e2e (2), sunday-derby.spec (3), race-calendar (+1 e2e, +1 doğrulama), web (+1)
TESTS PASSED: API 176 / 2467 (temiz şema, ardından takvim e2e 5/5), web 51 / 552; tarayıcı: haftalık sekme, derbi lobide başta
TESTS FAILED: 0
REMAINING: başarımlar (achievement)
NEXT PHASE: Faz 13 kalan (Socket.IO Redis köprüsü)

---

PHASE: 13 (kalan) — Socket.IO Redis köprüsü
STATUS: TESTED
SUMMARY: Çok örnekli kurulumun son önkoşulu. Sohbet/emote/bildirim/lobi yayınları ve izleyici sayısı
örnekler arası yayılır; yarış oynatması örneğe yerel kalır (çift kare yok).
FILES CREATED: infrastructure/realtime/redis-io.adapter.ts · test/api/multi-instance-realtime.e2e-spec.ts
FILES MODIFIED: main.ts · race.gateway.ts · test-helpers.ts · ops.config.json · game-config types · apps/api/package.json
DATABASE CHANGES: —
API CHANGES: — (soket olayları aynı)
SECURITY CHANGES: — (bağımlılık denetimi temiz)
TESTS ADDED: multi-instance-realtime.e2e-spec.ts (1, iki örnek)
TESTS PASSED: API 177 / 2469 (temiz şema); iki örnekli e2e 3 ardışık koşuda temiz
TESTS FAILED: 0
REMAINING: — (Faz 13 sağlayıcıdan bağımsız kısmı tamam)
NEXT PHASE: Faz 14 — uçtan uca oyuncu yolculukları

---

PHASE: 14 — Final E2E (oyuncu yolculukları)
STATUS: TESTED
SUMMARY: İki oyuncu tek akışta oyunun bütün yüzeylerinden geçer (hesap, turnuva, yarış, görev, sosyal,
kulüp, pazar, sezon, dışa aktarma, silme); sonunda bakiye = başlangıç + defter toplamı. Yolculuk gerçek
bir hata buldu: yarış atın şimdiki sahibine yazılıyordu, at satışı sezon puanını/ödülünü alıcıya taşıyordu.
FILES CREATED: test/api/player-journey.e2e-spec.ts · test/api/race-entry-ownership.e2e-spec.ts ·
database/migrations/0063_backfill_practice_entry_player.{up,down}.sql
FILES MODIFIED: postgres-race.repository (katılım player_id, son yarışlar, katılımcı) · postgres-season.repository ·
postgres-leaderboard.repository · postgres-grandstand.repository · FINAL_ACCEPTANCE.md (madde 31)
DATABASE CHANGES: 0063 — eski pratik katılımlarına defterden player_id (veri düzeltmesi, şema değişmez)
API CHANGES: — (sıralama/sezon/son yarışlar artık koşturan oyuncuya göre)
SECURITY CHANGES: sezon ödülü kazanmış at satın alınarak devralınamaz
TESTS ADDED: player-journey (11 adım), race-entry-ownership (1)
TESTS PASSED: API 179 / 2483 (temiz şema)
TESTS FAILED: 0
REMAINING: Avatar yolculuğu (Faz 8 ile)
NEXT PHASE: Sona bırakılanlar — Faz 8 AI avatar, Faz 12 ödeme, gerçek 3D/ses varlıkları, Apple girişi

---

PHASE: 11/24 (kalan) — Başarımlar
STATUS: TESTED
SUMMARY: Brief §24 "Achievements" ve §68'in son açık maddesi. 11 yaşam boyu başarım; ilerleme mevcut
tablolardan türetilir (görev sayım motoru), ödül tek kez ve para yoluyla; /quests'te bölüm, profilde rozet.
FILES CREATED: config/achievements.config.json · shared-types achievements.ts · domain/achievements/* ·
ports/achievement.repository.ts · infrastructure/achievements/* · use-cases/achievement.use-case.ts ·
api/achievements/* · web features/quests/achievement-labels.ts · migration 0064
FILES MODIFIED: profil use-case/tipi (achievements: dizi) · player.module · app.module · hata eşlemesi ·
hesap silme + dışa aktarma · defter türü achievement_reward (REWARD) · web /quests, profil, api-client
DATABASE CHANGES: 0064 achievement_claims (PK player_id + achievement_key)
API CHANGES: GET /achievements · POST /achievements/:key/claim · PlayerProfileView.achievements
SECURITY CHANGES: ataya bağlı ölçütler (antrenman/bakım) başarım olamaz (at alarak ödül açılmasın)
TESTS ADDED: achievements.spec (5), achievements.e2e (5), web achievement-labels (3) + api-client (1)
TESTS PASSED: API 181 / 2495 (temiz şema), web 52 / 556; tarayıcı: /quests başarımlar bölümü (11 satır)
TESTS FAILED: 0
REMAINING: görevlerde antrenman/bakım ölçütünün oyuncuya bağlanması (ayrı dilim)
NEXT PHASE: Sona bırakılanlar (Faz 8 AI avatar, Faz 12 ödeme, varlıklar, Apple girişi)

---

PHASE: 11 (düzeltme) — Görevlerde antrenman/bakım sahipliği
STATUS: TESTED
SUMMARY: Antrenman/bakım görevi atın şimdiki sahibine sayılıyordu; at satılınca aynı günün görevi iki
oyuncuya ödenebiliyordu. Satırlar artık işi yapan oyuncuyu yazar, görev sorgusu ona bakar.
FILES MODIFIED: postgres-training-session.repository · postgres-care-log.repository · postgres-quest.repository ·
quests.e2e-spec (regresyon)
DATABASE CHANGES: 0065 — training_sessions.player_id, horse_care_log.performed_by (nullable, yalnızca ekleme)
API CHANGES: —
SECURITY CHANGES: görev ödülü at satışıyla çoğaltılamaz
TESTS ADDED: quests.e2e (+1; düzeltmesiz kırıldığı doğrulandı)
TESTS PASSED: API 181 / 2498 (temiz şema)
TESTS FAILED: 0
REMAINING: —
NEXT PHASE: Sona bırakılanlar (Faz 8 AI avatar, Faz 12 ödeme, varlıklar, Apple girişi)

---

PHASE: 8-A — Manuel avatar oluşturucu + özelleştirme
STATUS: TESTED
SUMMARY: Brief §44 (özelleştirme) ve §49 (AI yokken/başarısızken manuel avatar). Katalog config'te, sunucu
doğrular; kaydı olmayan oyuncu kimlikten türetilen varsayılanla görünür. /avatar ekranı (prosedürel 3D,
el salla/tezahürat, sosyal/yarış kıyafeti), profilde SVG portre. AI selfie avatarı bilinçli olarak YOK.
FILES CREATED: config/avatar.config.json · shared-types avatar.ts · domain/avatar/* · ports/avatar.repository.ts ·
infrastructure/avatar/* · use-cases/avatar.use-case.ts · api/avatar/* · web features/avatar/*, app/avatar/page.tsx ·
migration 0066
FILES MODIFIED: profil use-case/tipi (avatar), player.module, app.module, hata eşlemesi, silme + dışa aktarma,
web profil başlığı, gezinti (Avatarım), api-client, globals.css
DATABASE CHANGES: 0066 player_avatars (player_id PK, appearance JSONB)
API CHANGES: GET /avatar · PUT /avatar · PlayerProfileView.avatar
SECURITY CHANGES: katalog dışı değer 400; kimlik yalnızca token'dan; PUT hız sınırlı
TESTS ADDED: avatar.spec (4), avatar.e2e (5), web avatar-catalog (3) + api-client (1)
TESTS PASSED: API 183 / 2509 (temiz şema), web 53 / 560; tarayıcı: /avatar seçim + kaydet + el salla + yarış forması, profilde portre
TESTS FAILED: 0
REMAINING: 8-B selfie hattı altyapısı (sağlayıcısız), AI üretimi (sağlayıcı kararı), sosyal alan (§50)
NEXT PHASE: Faz 8-B

---

PHASE: 8-B — Selfie → AI avatar hattı altyapısı (sağlayıcısız)
STATUS: TESTED (sahte sağlayıcıyla); gerçek sağlayıcı YOK → özellik kapalı
SUMMARY: Brief §38–49'un sağlayıcıdan bağımsız kısmı. Sağlayıcı yokken 503 + hiçbir şey saklanmaz; varken
rıza → doğrulama → iş → zamanlayıcı → doğrulanmış GLB → avatar değişimi; selfie iş bitince silinir.
FILES CREATED: domain/avatar/{selfie,generation-job}.ts · ports/{avatar-generation.provider,avatar-storage,avatar-job.repository}.ts ·
infrastructure/avatar/{postgres-avatar-job.repository,local-avatar-storage,avatar-generation.providers}.ts ·
use-cases/avatar-generation.use-case.ts · scheduler/avatar-generation.scheduler.ts · api/avatar/avatar-generation.controller.ts ·
web features/avatar/{AiAvatarPanel,ai-avatar-labels}, features/admin/AvatarJobsAdmin · migration 0067
FILES MODIFIED: avatar.module, auth.module (hesap silme → dosya silme), delete-account use-case, staff izinleri,
hata eşlemesi, production-env, silme + dışa aktarma, web api-client (FormData), /avatar, /admin, DEPLOYMENT.md
DATABASE CHANGES: 0067 avatar_generation_jobs (oyuncu başına tek etkin iş), player_ai_avatars
API CHANGES: GET/POST /avatar/generation · POST /avatar/generation/:jobId/cancel · DELETE /avatar/ai ·
GET /avatar/ai/model · GET /admin/avatar-jobs
SECURITY CHANGES: dosya adı yol olmaz (sunucu anahtarı + kök kontrolü), biçim baytlardan, boyut sınırı,
sağlayıcı yokken gövde okunmaz, model yalnızca sahibine (no-store), yönetim listesi anahtar sızdırmaz,
AVATAR_PROVIDER varken AVATAR_STORAGE_DIR zorunlu
TESTS ADDED: avatar-generation.spec (8), avatar-generation.e2e (8; sahte sağlayıcı), production-env (+2),
web ai-avatar-panel (3) + api-client (1)
TESTS PASSED: API 185 / 2529 (temiz şema), web 54 / 564, tam lint 0 hata; tarayıcı: /avatar AI paneli "kapalı" durumu
TESTS FAILED: 0
REMAINING: gerçek sağlayıcı (sahibinin kararı), S3 uyumlu depo, AI modelinin 3D gösterimi, sosyal alan (§50)
NEXT PHASE: sahibinin sağlayıcı kararı / Faz 12 ödeme

---

PHASE: 12 — Ödeme altyapısı (sağlayıcısız)
STATUS: TESTED (sahte sağlayıcıyla); gerçek sağlayıcı YOK → satın alma kapalı
SUMMARY: Premium para (elmas) paketleri, sipariş → sağlayıcı ödeme sayfası → imzalı webhook → elmas;
makbuzlar, iade (talep + webhook), sahtekârlık korumaları. Gerçek para oyun içi defterden ayrı.
FILES CREATED: config/store.config.json · shared-types payments.ts · domain/payments/* · ports/{payment-gateway,
payment-order.repository}.ts · infrastructure/payments/{postgres-payment-order.repository,payment-gateways}.ts ·
use-cases/payments.use-case.ts · api/payments/* · web app/store, features/store, features/admin/PaymentsAdmin · migration 0068
FILES MODIFIED: main.ts + test-helpers (rawBody), app.module, hata eşlemesi, staff izinleri (payments.manage),
hesap silme engeli (payment_pending), dışa aktarma (payments), defter türleri, web api-client/nav/admin, DEPLOYMENT.md
DATABASE CHANGES: 0068 payment_orders, payment_events (provider, event_id PK)
API CHANGES: GET /store · POST/GET /store/orders · GET /store/orders/:id · POST /payments/webhook/:provider ·
GET /admin/payments · POST /admin/payments/:id/refund
SECURITY CHANGES: istemci yalnızca SKU gönderir; webhook imzası ham gövdeyle; olay tekilliği; tutar eşleşmesi;
sınırlar; iade talep≠sonuç; sağlayıcı kimlikleri oyuncuya/yöneticiye dönmez
TESTS ADDED: store.spec (7), payments.e2e (7; HMAC imzalı sahte sağlayıcı), web store-labels (2) + api-client (1)
TESTS PASSED: API 187 / 2545 (temiz şema), web 55 / 567, tam lint 0 hata; tarayıcı: /store "kapalı" durumu
TESTS FAILED: 0
REMAINING: gerçek sağlayıcı + yasal inceleme (sahibinin kararı)
NEXT PHASE: sahibinin sağlayıcı kararları (AI avatar, ödeme) / gerçek 3D varlıkların bağlanması
