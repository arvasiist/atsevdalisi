import type { EconomyConfig, PrizeDistributionConfig } from '@at-sevdalisi/game-config';

/**
 * ÖDÜL HAVUZU + ÇARPAN SERVİSİ — brief §3 "PRIZE POOL" ve §4
 * "ÇARPAN / MULTIPLIER SİSTEMİ", §42 PHASE 5.
 *
 * ## Neden ayrı bir dosya (brief §4'ün AÇIK şartı)
 *
 * Brief §4: "**ÖNEMLİ:** Çarpan hesaplama Race Engine'den ayrı bir
 * domain/service olmalı." Bu yüzden buradaki hiçbir fonksiyon
 * `race-engine.ts`'e dokunmaz, ondan bir şey import etmez ve motora
 * sokulmaz. Motor "atlar nasıl koşar" sorusunu cevaplar; bu dosya
 * "havuz ne kadar, kazanan ne alır, çarpan kaç" sorusunu cevaplar. İkisi
 * arasındaki tek temas noktası `finishPosition`'dır (bitiş sırası) — ve o
 * da motordan DEĞİL, motora verilen girdiden/çıktıdan gelir.
 *
 * ## Bu dosya ile `prize.ts` arasındaki iş bölümü
 *
 * - `prize.ts` — KADEMELİ (pratik yarış) ekonomi: kademe bul, kademenin
 *   havuzunu/ödülünü hesapla, `run-practice-race` için bakiye mutasyonunu
 *   üret. Kademe kavramı bilir.
 * - `prize-distribution.ts` (bu dosya) — KADEMESİZ, genel dağıtım
 *   matematiği: verilen bir havuzu verilen oranlarla paylaştır, çarpanı
 *   hesapla. Kademe kavramını BİLMEZ, `fieldSize` diye bir şey duymaz.
 *
 * Bu ayrım lobi yarışını mümkün kılar: lobi yarışı bir kademe DEĞİLDİR
 * (alanı 8-16 arasında değişir, ücreti oyuncunun seçtiği 5 seçenekten
 * biridir) ama havuzu tam olarak AYNI matematikle paylaşılır. İki tüketici
 * tek bir dağıtım tanımından beslenir — oranlar `economy.config.json` →
 * `prizeDistributions` altında TEK KEZ yazılır.
 *
 * ## Neden burada HİÇBİR ŞEY fırlatılmaz
 *
 * `validateRaceTiers`/`mock-deposit.ts` ile AYNI felsefe: bu fonksiyonlar
 * hem istek yolunda (her lobi yanıtında) hem de test/config denetiminde
 * çağrılır. Fırlatan bir fonksiyon, bozuk bir config'i oyuncuya 500 olarak
 * gösterirdi; oysa doğru tepki bozuk config'i TESTTE yakalamaktır
 * (`validatePrizeDistributions`) ve istek yolunda güvenli bir varsayılana
 * düşmektir (`null` çarpan = "gösterilecek çarpan yok").
 */

/**
 * Verilen havuzu, verilen oranlarla sıraya göre paylaştırır.
 * `payouts[i]` = (i+1). sıranın ALACAĞI Çip (yuvarlanmış).
 *
 * Yuvarlama ŞART ve `prize.ts`teki `getRacePrize` ile AYNI gerekçeyle:
 * `money` bir tam sayı birimidir (`domain/economy/wallet.ts` →
 * `assertValidAmount`'ın `Number.isInteger` kontrolü), kayan noktalı bir
 * ödül `InvalidAmountError` fırlatır ve istemciye 500 dönerdi.
 *
 * Dönen dizi oranlar dizisiyle AYNI uzunluktadır — "kaç sıraya ödül
 * verilir" sorusunun cevabı oranlar dizisinin uzunluğudur, havuzun
 * büyüklüğü değil.
 */
export function computePrizePayouts(pool: number, shares: readonly number[]): number[] {
  return shares.map((share) => Math.round(pool * share));
}

/** Dağıtılan TOPLAM ödül (yuvarlanmış hâliyle) — "yarış para basıyor mu" testinin çekirdeği. */
export function computePrizePayoutTotal(pool: number, shares: readonly number[]): number {
  return computePrizePayouts(pool, shares).reduce((total, amount) => total + amount, 0);
}

/**
 * Ödül havuzu = `entryFee × participantCount` — brief §3'ün verdiği formül
 * birebir ("10 oyuncu × 100 coin = 1000 coin prize pool").
 *
 * Bu fonksiyon bir **PROJEKSİYON** aracıdır: "şu an N katılımcı var, havuz
 * bu" sorusunu cevaplar. Gerçek lobi havuzunun tek doğruluk kaynağı
 * `races.prize_pool` sütunudur (katılımda büyür, ayrılmada küçülür) — bu
 * fonksiyon onun YERİNE geçmez, onunla TUTARLI olmak zorundadır. Tutarlılık
 * e2e'de ölçülür.
 */
export function computePrizePool(entryFee: number, participantCount: number): number {
  return entryFee * participantCount;
}

/**
 * Oyuncuya gösterilen ÇARPAN — brief §4: "kullanıcıya gösterilen multiplier
 * gerçek zamanlı katılım durumuna göre değişebilir".
 *
 * TANIM: **kazananın alacağı ödülün giriş ücretine oranı.** Yani "giriş
 * ücretimin kaç katını kazanabilirim". Havuz katılımla büyüdüğü için
 * (`pool = entryFee × participantCount`) bu sayı GERÇEKTEN gerçek zamanlı
 * değişir: `multiplier = pool × shares[0] / entryFee = participantCount ×
 * shares[0]`.
 *
 * ## Neden AYRI BİR "çarpan config'i" YOK
 *
 * Brief §4 örnek olarak `1.00x / 1.25x / 1.50x / 2.00x` gibi bir merdiven
 * verir. Bu merdiven bilinçli olarak KONFİGÜRE EDİLMEDİ: gösterilen çarpan
 * ile ÖDENEN ödül ayrı iki kaynaktan gelirse, biri diğerini yalanlayabilir
 * (oyuncu 2.00x görüp 1.4x alır). Çarpan burada TÜRETİLMİŞ bir değerdir —
 * lobide görünen sayı, gerçekten ödenecek tutarın ta kendisidir. Merdiven
 * etkisi zaten kendiliğinden oluşur, çünkü çarpan `participantCount` ile
 * DOĞRU ORANTILIDIR: 8 oyuncuda 3.0x, 16 oyuncuda 6.0x (top5 dağıtımı,
 * `shares[0] = 0.375`). "Kalan süre/katılım arttıkça çarpan artar"
 * davranışı brief'in istediği gibidir; onu ayrıca bir tabloya yazmak
 * ikinci bir doğruluk kaynağı yaratmaktan başka bir şey yapmazdı.
 *
 * `null` döner — "gösterilecek bir çarpan yok" — şu üç durumda:
 * - ücretsiz yarış (`entryFee <= 0`): bölme tanımsız, ayrıca ödül de yok;
 * - havuz boş (`pool <= 0`): henüz kimse katılmadı, vaat edilecek bir şey yok;
 * - dağıtım boş (`shares` boş): ödül alacak sıra tanımlı değil.
 *
 * `null` ile `0` AYRI ŞEYLERDİR ve bu ayrım bilinçlidir: `0` "çarpan var ve
 * sıfır" demek olurdu, oysa doğru ifade "bu yarışta çarpan kavramı yok".
 * İstemci `null` gördüğünde çarpanı hiç göstermez.
 */
export function computePrizeMultiplier(pool: number, entryFee: number, shares: readonly number[]): number | null {
  const topShare = shares[0];
  if (topShare === undefined) {
    return null;
  }
  if (entryFee <= 0 || pool <= 0) {
    return null;
  }
  return (pool * topShare) / entryFee;
}

/**
 * Brief §4'ün saydığı dört büyüklük — `ENTRY FEE`, `PARTICIPANT COUNT`,
 * `PRIZE POOL`, `MULTIPLIER` — artı iki türev (`topPrize`, `payouts`),
 * TEK bir çağrıda.
 *
 * `pool` DIŞARIDAN verilir (kademe için `entryFee × fieldSize`, lobi için
 * `races.prize_pool` sütunu): böylece "havuz nereden geliyor" sorusunun
 * cevabı çağıranın elinde kalır ve bu dosya iki tüketicinin farkını
 * bilmek zorunda olmaz.
 */
export interface RacePrizeEconomicsInput {
  entryFee: number;
  participantCount: number;
  pool: number;
  shares: readonly number[];
}

export interface RacePrizeEconomics {
  entryFee: number;
  participantCount: number;
  prizePool: number;
  /** `null` = bu yarışta gösterilecek çarpan yok (bkz. `computePrizeMultiplier`). */
  multiplier: number | null;
  /** Kazananın alacağı Çip — `payouts[0]`, sıra tanımlı değilse 0. */
  topPrize: number;
  /** Sıraya göre ödüller (1. sıra ilk eleman) — yuvarlanmış. */
  payouts: number[];
}

export function describeRacePrizeEconomics(input: RacePrizeEconomicsInput): RacePrizeEconomics {
  const payouts = computePrizePayouts(input.pool, input.shares);
  return {
    entryFee: input.entryFee,
    participantCount: input.participantCount,
    prizePool: input.pool,
    multiplier: computePrizeMultiplier(input.pool, input.entryFee, input.shares),
    topPrize: payouts[0] ?? 0,
    payouts,
  };
}

/**
 * Dağıtımı `id` ile bulur. Bulunamazsa `null` — çağıran bunu
 * `InvalidRaceTierError`'a (kademe) ya da "çarpan gösterilmez"e (lobi)
 * çevirir. `getRaceTierById` ile AYNI desen: `?? []` gibi bir varsayılana
 * DÜŞÜLMEZ, çünkü bu gerçek bir config hatasını gizlerdi.
 */
export function resolvePrizeDistribution(
  config: EconomyConfig,
  distributionId: string,
): PrizeDistributionConfig | null {
  return config.prizeDistributions.find((distribution) => distribution.id === distributionId) ?? null;
}

/**
 * Kayan noktalı pay toplamı karşılaştırmasında kullanılan tolerans —
 * `prize.ts`teki `RACE_TIER_SHARE_TOLERANCE` ile AYNI değer ve AYNI
 * gerekçe (IEEE-754 toplaması `0.375 + 0.225 + ...` için tam `0.9`
 * vermeyebilir; 1e-9 hiçbir GERÇEK config hatasını gizlemez).
 */
export const PRIZE_DISTRIBUTION_SHARE_TOLERANCE = 1e-9;

/**
 * `prizeDistributions` yapılandırmasının DEĞİŞMEZLERİNİ denetler ve
 * bulunan sorunları döner (boş liste = sağlam). Fırlatmaz —
 * `validateRaceTiers` ile AYNI gerekçe: tek çağrıyla TÜM sorunları görmek.
 *
 * Bu denetim burada, KADEMEDEN BAĞIMSIZ durur: bir dağıtımın geçerliliği
 * onu kullanan yarışın alan büyüklüğünden bağımsızdır. "Bu dağıtım şu
 * kademeye sığar mı" sorusu `validateRaceTiers`'ın işidir (oradaki
 * `shares.length > fieldSize` kontrolü).
 */
export function validatePrizeDistributions(config: EconomyConfig): string[] {
  const problems: string[] = [];

  if (config.prizeDistributions.length === 0) {
    problems.push('prizeDistributions boş olamaz — en az bir dağıtım gerekir.');
  }

  const seenIds = new Set<string>();
  for (const distribution of config.prizeDistributions) {
    const where = `prizeDistributions[${distribution.id || '?'}]`;

    if (distribution.id.trim() === '') {
      problems.push(`${where}: id boş olamaz.`);
    } else if (seenIds.has(distribution.id)) {
      problems.push(`${where}: id tekrar ediyor.`);
    }
    seenIds.add(distribution.id);

    if (distribution.label.trim() === '') {
      problems.push(`${where}: label boş olamaz (oyuncuya gösterilir).`);
    }

    if (distribution.shares.length === 0) {
      problems.push(`${where}: shares boş olamaz — ödül alacak sıra tanımsız olurdu.`);
    }

    let previousShare = Number.POSITIVE_INFINITY;
    let shareTotal = 0;
    for (const [index, share] of distribution.shares.entries()) {
      if (!(share > 0)) {
        problems.push(`${where}: shares[${index}] pozitif olmalı (verilen: ${share}).`);
      }
      // 1. sıra her zaman en çok kazanır — azalan sıra, "birinciyi
      // ödüllendirme" niyetinin bozulmadığını garanti eder.
      if (share >= previousShare) {
        problems.push(
          `${where}: shares azalan olmalı — [${index}] (${share}) öncekinden (${previousShare}) büyük/eşit.`,
        );
      }
      previousShare = share;
      shareTotal += share;
    }

    const expectedShareTotal = 1 - config.raceRake;
    if (Math.abs(shareTotal - expectedShareTotal) > PRIZE_DISTRIBUTION_SHARE_TOLERANCE) {
      problems.push(
        `${where}: shares toplamı ${shareTotal}, beklenen ${expectedShareTotal} (1 − raceRake ${config.raceRake}). ` +
          'Ayrışma, ya kesintinin ya ödül dağıtımının yanlış olduğu anlamına gelir.',
      );
    }
  }

  return problems;
}
