import type { EconomyConfig, RaceTierConfig } from '@at-sevdalisi/game-config';
import { credit, debit, type WalletBalance } from '../economy/wallet';
import {
  computePrizePayoutTotal,
  computePrizePayouts,
  resolvePrizeDistribution,
  validatePrizeDistributions,
} from './prize-distribution';

/**
 * Yarış ekonomisi — giriş ücreti, ödül havuzu ve ödül dağıtımı
 * (brief §31 Economy, docs/SECURITY.md §5). `domain/economy/wallet.ts`
 * (`debit`/`credit`) ile AYNI "SAF fonksiyon" deseni: hiçbir DB/HTTP
 * erişimi içermezler, sadece config + girdiden hesaplarlar. Gerçek bakiye
 * değişikliği (debit+credit, TEK satır kilidi altında) yalnızca
 * `application/use-cases/run-practice-race.use-case.ts`'te uygulanır —
 * bu dosya sadece "ne kadar" sorusuna cevap verir, "nasıl uygulanır"
 * sorusuna değil.
 *
 * ## Neden değişti (27.09.2026, proje sahibinin açık talebi)
 *
 * ÖNCE: sabit bir ödül tablosu vardı (`prizeByFinishPosition`:
 * `[200,120,80,50,30,0]`) ve botlar HİÇBİR ŞEY ödemiyordu. Bu, denetimde
 * **CRITICAL E7** olarak işaretlenen SINIRSIZ PARA MUSLUĞU'ydu: giriş
 * ücreti 50 iken beklenen ödül 80'di (EV +30/yarış), ve uç noktada ne
 * hız sınırı ne bekleme süresi vardı — oyuncu istediği kadar Çip
 * bastırabiliyordu.
 *
 * SONRA (proje sahibinin "yarışlar ücretli olsun, verilen ücret kadarıyla
 * giriş yapan kişiler çarpan olsun, 8/10/12/14/16 at koşabilsin" +
 * "kesinti olsun (~%10)" talebi): ödül artık SABİT BİR TABLO DEĞİL,
 * havuzun bir PAYIDIR:
 *
 *   havuz  = entryFee × fieldSize            (botlar DA "ödedi" sayılır)
 *   ödül(i) = entryFee × shares[i] × fieldSize
 *           = havuz × shares[i]
 *   çarpan(i) = ödül(i) / entryFee = shares[i] × fieldSize
 *
 * `Σ shares = 1 − raceRake` olduğundan `Σ ödül = havuz × (1 −
 * raceRake) < havuz` — yarış YAPISAL OLARAK para basamaz, kazanan sıra
 * sayısı ve alan büyüklüğü NE OLURSA OLSUN. Rake yalnızca bir "ev payı"
 * değil, aynı zamanda bu musluğun kapatılma biçimidir.
 *
 * Oyuncunun beklenen değeri (EV): eşit güçte N katılımcıda
 * `P(i) ≈ 1/N` → `EV(ödül) = Σ ödül / N = havuz × (1−rake) / N =
 * entryFee × (1−rake)`. Yani `EV(net) = −rake × entryFee`, alan
 * büyüklüğünden BAĞIMSIZ olarak her yarışta ~%10 kayıp (bir bahis/kumar
 * mekaniği değil, oyun-içi bir "ev payı" — kaynak tüketimi).
 *
 * ## §42 PHASE 5 — oranlar artık bu dosyada DEĞİL
 *
 * Yukarıdaki `shares`, eskiden kademenin kendi `payoutShares` alanıydı.
 * Artık `distributionId`'nin çözdüğü `PrizeDistributionConfig`'tir ve
 * havuz/ödül matematiğinin KADEMESİZ kısmı `./prize-distribution.ts`'e
 * taşındı (lobi yarışı da aynı matematiği kullanır — brief §3/§4). Bu
 * dosya kademe kavramını bilen ince bir kabuk olarak kaldı: kademeyi bul,
 * dağıtımını çöz, havuzunu hesapla. Ölçek/tolerans sabitleri de oradadır
 * (`PRIZE_DISTRIBUTION_SHARE_TOLERANCE`) — burada ikinci bir kopya
 * TUTULMAZ.
 */

/**
 * Kademeyi `id` ile bulur. Bulunamazsa `null` döner — çağıran
 * (`RunPracticeRaceUseCase`) bunu `InvalidRaceTierError`'a çevirir. Bu
 * port/domain katmanı HTTP BİLMEZ (docs/ARCHITECTURE.md §4).
 *
 * DİKKAT — `config.raceTiers` boş ya da `undefined` olamaz: öyle olsaydı
 * `find` sessizce `null` döner ve oyuncu "geçersiz kademe" hatası alırdı,
 * oysa gerçek sorun bir config hatasıdır. Bu yüzden `?? []` KULLANILMAZ
 * (bu, gerçek bir yapılandırma hatasını "kullanıcı hatası" gibi
 * gizlerdi); boş dizi durumu `validateRaceTiers` tarafından test
 * zamanında yakalanır.
 */
export function getRaceTierById(config: EconomyConfig, tierId: string): RaceTierConfig | null {
  return config.raceTiers.find((tier) => tier.id === tierId) ?? null;
}

/**
 * İstemci bir kademe SEÇMEDİYSE kullanılacak varsayılan — listenin İLK
 * elemanı. Bilinçli olarak "en ucuz" değil "ilk"tir: config'deki sıra
 * zaten zorluk sırasıdır (bkz. `config/economy.config.json`), ve
 * "en ucuzu bul" mantığı bir fiyat değişikliğinde varsayılanı sessizce
 * başka bir kademeye kaydırırdı.
 */
export function getDefaultRaceTier(config: EconomyConfig): RaceTierConfig | null {
  return config.raceTiers[0] ?? null;
}

/**
 * Ödül havuzu = `entryFee × fieldSize`. Bot rakipler de bu havuzun
 * içindedir (proje sahibinin "evet ödesin" kararı) — bu, ödülün alan
 * büyüklüğüyle BÜYÜMESİNİ sağlar ve oyuncunun gördüğü "çarpan"ın
 * (`shares × fieldSize`) kaynağıdır.
 *
 * NOT: gerçek çok oyunculu yarışta (FAZ 7 Matchmaking) bu değer
 * katılımcıların GERÇEK ödemelerinin toplamı olacaktır — formül AYNI
 * kalır, "botlar ödedi sayılır" varsayımı yerini gerçek ödemelere
 * bırakır.
 */
export function computeRacePool(tier: RaceTierConfig): number {
  return tier.entryFee * tier.fieldSize;
}

/**
 * Kademenin ödül dağıtım ORANLARI — `distributionId`'nin
 * `EconomyConfig.prizeDistributions` içinde çözülmüş hâli.
 *
 * Bulunamazsa BOŞ dizi döner. Bu bilinçli bir "güvenli varsayılan"dır:
 * `null` döndürüp çağıranı her yerde `?? []` yazmaya zorlamak aynı sonucu
 * verir ama her çağrı yerine bir hata dalı eklerdi. Boş dizi kendini belli
 * eder — `getRacePrize` 0 ödül, `computePrizeMultiplier` `null` çarpan
 * üretir, yani HİÇBİR ödül ödenmez. Böyle bir config ZATEN geçersizdir ve
 * `validateRaceTiers` onu hata olarak bildirir; istek yolunda ise para
 * basmamak doğru tepkidir.
 */
export function getRaceTierShares(config: EconomyConfig, tier: RaceTierConfig): number[] {
  return resolvePrizeDistribution(config, tier.distributionId)?.shares ?? [];
}

/**
 * Bitiş sırasına göre ödül. `finishPosition` 1 tabanlıdır (1. = birinci).
 * Dağıtım dizisinin sınırları dışında bir sıralama gelirse ödül 0 kabul
 * edilir — bu, `entrant-snapshot.ts`deki nötr-değer felsefesiyle AYNI:
 * eksik/beklenmeyen veri bir çökmeye DEĞİL, güvenli bir varsayılana yol
 * açar. (Ödül almayan sıralar zaten normaldir: her dağıtımda
 * `shares.length` kadarı ödül alır, geri kalanı almaz.)
 *
 * `config` parametresi §42 PHASE 5'te EKLENDİ: oranlar artık kademenin
 * kendi alanı değil, `distributionId`'nin çözdüğü dağıtımdır (bkz.
 * `RaceTierConfig.distributionId` doc yorumu). Yuvarlama işi
 * `computePrizePayouts`'a delege edilir ki tek bir yerde kalsın.
 */
export function getRacePrize(config: EconomyConfig, tier: RaceTierConfig, finishPosition: number): number {
  const shares = getRaceTierShares(config, tier);
  if (shares[finishPosition - 1] === undefined) {
    return 0;
  }
  return computePrizePayouts(computeRacePool(tier), shares)[finishPosition - 1] ?? 0;
}

/** Bu kademede dağıtılan TOPLAM ödül (yuvarlanmış hâliyle) — rake testinin çekirdeği. */
export function computeRacePayoutTotal(config: EconomyConfig, tier: RaceTierConfig): number {
  return computePrizePayoutTotal(computeRacePool(tier), getRaceTierShares(config, tier));
}

/**
 * Havuzdan dağıtılmayan, evde kalan tutar. `computeRacePool −
 * computeRacePayoutTotal` — `raceRake` oranından YENİDEN hesaplanmaz,
 * çünkü gerçek kesinti yuvarlamadan sonra ortaya çıkan tutardır; orandan
 * hesaplamak yuvarlama farkını gizlerdi (bu fonksiyonun tek işi
 * GERÇEKLEŞEN kesintiyi raporlamaktır).
 */
export function computeRaceRakeAmount(config: EconomyConfig, tier: RaceTierConfig): number {
  return computeRacePool(tier) - computeRacePayoutTotal(config, tier);
}

/**
 * `raceTiers`/`raceRake` yapılandırmasının DEĞİŞMEZLERİNİ denetler ve
 * bulunan sorunları (boş liste = sağlam) döner. Fırlatmaz: hem test
 * tarafından (tek çağrıyla TÜM sorunları görmek için) hem de ileride bir
 * "balance tool" (brief §82) tarafından kullanılabilmesi için sonuç
 * döndüren saf bir fonksiyondur.
 *
 * NEDEN VAR: bu değişmezler oyunun para bütünlüğünü taşır. En kritiği
 * `Σ ödül < havuz`dur (CRITICAL E7'nin YAPISAL çözümü) — config elle
 * düzenlenebilir bir JSON olduğu için, "yanlış bir pay dizisi para
 * musluğunu geri getirir" riski yalnızca bir TESTLE kapatılabilir. Bkz.
 * `apps/api/test/domain/race/prize.spec.ts`.
 */
export function validateRaceTiers(config: EconomyConfig): string[] {
  // Dağıtımların KENDİ geçerliliği (pay toplamı, azalanlık, pozitiflik)
  // ayrı bir denetimdir ve kademelerden bağımsızdır — burada ÖNCE o
  // koşar, sonra her kademenin o dağıtımı DOĞRU kullandığı denetlenir.
  // İkisini birbirine karıştırmak, "dağıtım bozuk" ile "kademe dağıtımı
  // yanlış bağlamış" hatalarını aynı mesaja indirgerdi.
  const problems: string[] = validatePrizeDistributions(config);

  if (config.raceTiers.length === 0) {
    problems.push('raceTiers boş olamaz — en az bir kademe gerekir.');
  }

  const seenIds = new Set<string>();
  for (const tier of config.raceTiers) {
    const where = `raceTiers[${tier.id || '?'}]`;

    if (tier.id.trim() === '') {
      problems.push(`${where}: id boş olamaz.`);
    } else if (seenIds.has(tier.id)) {
      problems.push(`${where}: id tekrar ediyor.`);
    }
    seenIds.add(tier.id);

    if (tier.label.trim() === '') {
      problems.push(`${where}: label boş olamaz (oyuncuya gösterilir).`);
    }

    // Tek atlık bir "yarış" yarış değildir; ayrıca payların toplamı
    // 1−rake olacağından fieldSize en az 2 olmalı ki en az bir rakip olsun.
    if (!Number.isInteger(tier.fieldSize) || tier.fieldSize < 2) {
      problems.push(`${where}: fieldSize en az 2 olan bir tam sayı olmalı (verilen: ${tier.fieldSize}).`);
    }

    if (!Number.isInteger(tier.entryFee) || tier.entryFee <= 0) {
      problems.push(`${where}: entryFee pozitif bir tam sayı olmalı (verilen: ${tier.entryFee}).`);
    }

    // Kademenin dağıtım referansı ÇÖZÜLMELİ. Çözülmezse `getRaceTierShares`
    // boş dizi döner ve o kademe HİÇ ödül ödemez — sessiz bir "herkes
    // kaybeder" durumu. Yazım hatası (`top5` yerine `top55`) bu yüzden
    // burada, test zamanında yakalanır.
    const distribution = resolvePrizeDistribution(config, tier.distributionId);
    if (distribution === null) {
      problems.push(
        `${where}: distributionId "${tier.distributionId}" prizeDistributions içinde bulunamadı ` +
          '(geçerli kimlikler: ' +
          `${config.prizeDistributions.map((d) => d.id).join(', ') || '—'}).`,
      );
      // Dağıtım yoksa aşağıdaki uzunluk/havuz kontrolleri anlamsızdır:
      // boş bir dizi her zaman "sığar" ve "para basmaz" görünürdü.
      continue;
    }

    if (distribution.shares.length > tier.fieldSize) {
      problems.push(
        `${where}: dağıtım "${distribution.id}" (${distribution.shares.length} sıra) fieldSize'dan ` +
          `(${tier.fieldSize}) uzun olamaz — yarışa katılmayan bir sıraya ödül tanımlanmış olurdu.`,
      );
    }

    // ASIL PARA BÜTÜNLÜĞÜ DEĞİŞMEZİ (CRITICAL E7): yuvarlamadan SONRA bile
    // dağıtılan toplam havuzun ALTINDA kalmalı. Pay toplamı testi bunu
    // matematiksel olarak zaten garanti eder; bu kontrol yuvarlamanın
    // (pay başına en fazla 0.5 Çip) bu garantiyi boymadığını da kapsar.
    if (tier.fieldSize >= 2 && tier.entryFee > 0) {
      const payoutTotal = computeRacePayoutTotal(config, tier);
      const pool = computeRacePool(tier);
      if (payoutTotal >= pool) {
        problems.push(
          `${where}: dağıtılan ödül (${payoutTotal}) havuzdan (${pool}) KÜÇÜK olmalı — ` +
            'aksi hâlde yarış para basar (denetim bulgusu E7).',
        );
      }
    }
  }

  return problems;
}

/**
 * Giriş ücretini düşer, ödülü ekler — TEK bir SAF fonksiyonda (bu, gerçek
 * CI'da bulunan bir hatanın düzeltilmiş halidir, bkz. altta). Gerçek
 * satır kilitleme `run-practice-race.use-case.ts`de uygulanır; bu
 * fonksiyon yalnızca "hangi sırayla, hangi korumalarla" sorusunu saf bir
 * şekilde cevaplar.
 *
 * BULUNAN HATA (CI, geçmiş oturum): `wallet.ts`deki `credit`/`debit`,
 * `assertValidAmount` ile SIFIR miktarı reddeder (`amount <= 0` →
 * `InvalidAmountError`) — önceki tüm kullanımlarda (Ahır Yükseltme'nin
 * maliyeti, Günlük Ödül'ün sabit miktarı) miktar hep pozitif olduğu için
 * bu HİÇ sorun çıkarmamıştı. Eski `prizeByFinishPosition` tablosunun SON
 * sırası BİLEREK 0'dı (son bitirene ödül yok) — bu yüzden yarışı son
 * sırada bitiren HER oyuncu için `credit(..., 0, ...)` çağrılıyor ve
 * `InvalidAmountError` fırlatıyordu; bu hata `http-exception.filter.ts`de
 * eşlenmediği için istemciye `500 Internal Server Error` olarak
 * dönüyordu.
 *
 * Düzeltme: miktar SIFIR olduğunda `debit`/`credit` HİÇ ÇAĞRILMAZ (işlem
 * atlanır) — `wallet.ts`in "sıfır olmayan pozitif miktar" kuralı
 * GEVŞETİLMEDİ, sadece "kazanılacak/harcanacak bir şey yoksa hiç
 * çağırma" mantığı eklendi. Yeni modelde bu dal ARTIK DAHA SIK
 * tetiklenir (her kademede ödül almayan sıralar vardır) — yani bu
 * koruma artık bir istisna değil, olağan yolun parçasıdır.
 */
export function applyPracticeRaceStakes(balance: WalletBalance, entryFee: number, prizeWon: number): WalletBalance {
  const afterEntryFee = entryFee > 0 ? debit(balance, entryFee, 'money') : balance;
  return prizeWon > 0 ? credit(afterEntryFee, prizeWon, 'money') : afterEntryFee;
}
