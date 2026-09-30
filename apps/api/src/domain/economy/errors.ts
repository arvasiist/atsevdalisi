/**
 * Economy domain'ine özgü hatalar. Bu hatalar Application katmanında
 * yakalanıp docs/API.md §11'deki ErrorCode değerlerine eşlenir (bkz.
 * apps/api/src/api/middleware/http-exception.filter.ts, FAZ 1'de
 * genişletilecek).
 *
 * `Currency` `./wallet`'tan YALNIZCA TİP olarak alınır (`import type`):
 * `wallet.ts` bu dosyadan değer (`InsufficientFundsError`) import ettiği
 * için, tip importu derlemede silinmezse döngüsel bir runtime import
 * oluşurdu. `import type` bunu yapısal olarak imkânsız kılar.
 */

import type { Currency } from './wallet';

export class InsufficientFundsError extends Error {
  constructor(
    public readonly currency: Currency,
    public readonly required: number,
    public readonly available: number,
  ) {
    super(
      `Yetersiz bakiye: ${currency} için ${required} gerekiyor, mevcut ${available}.`,
    );
    this.name = 'InsufficientFundsError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: number) {
    super(`Geçersiz miktar: ${amount}. Miktar pozitif bir tam sayı olmalıdır.`);
    this.name = 'InvalidAmountError';
  }
}

/**
 * FAZ 1 wiring, yedinci dilim — Günlük Ödül (brief §37). `bkz.
 * domain/economy/daily-reward.ts` `canClaimDailyReward` — cooldown
 * penceresi dolmadan tekrar talep edilirse fırlatılır.
 * `CareActionOnCooldownError` ile AYNI desen/gerekçe.
 */
export class DailyRewardAlreadyClaimedError extends Error {
  constructor(public readonly remainingMinutes: number) {
    super(`Günlük ödül zaten alındı — tekrar alınabilmesi için ${remainingMinutes} dakika kaldı.`);
    this.name = 'DailyRewardAlreadyClaimedError';
  }
}

/**
 * SANAL para yatırma kapalı — brief §21/§41, §42 PHASE 4b.
 *
 * `reason` alanı YOKTUR ve bilinçlidir: `MockDepositDisabledError`'ın
 * iki fırlatıcısı vardır (`config.mockDeposit.enabled === false` ve
 * `NODE_ENV === 'production'`, bkz. `MockPaymentProvider.isEnabled`) ama
 * İKİSİ DE aynı `MOCK_DEPOSIT_DISABLED` (403) kodunu döndürür.
 * Ayrımı mesaja koymak CAZİPTİ ama YANLIŞ olurdu: bu uç nokta üretimde
 * her zaman kapalıdır, yani "neden kapalı" bilgisi üretimde çağırana
 * HİÇBİR ZAMAN gösterilmeyecek, yalnızca geliştirme ortamında işe
 * yarayacaktır — bunun için API sözleşmesine kalıcı bir alan eklemek
 * (`RaceNotWatchableError`'ın üç nedenli `reason`'ından farklı olarak,
 * orada ayrımı oyuncu GÖRÜR) gereksiz bir karmaşıklık olurdu.
 */
export class MockDepositDisabledError extends Error {
  constructor() {
    super('Sanal para yatırma bu sunucuda kapalıdır.');
    this.name = 'MockDepositDisabledError';
  }
}

/**
 * Yatırma tutarı geçersiz — brief §20 DEPOSIT, §42 PHASE 4b.
 *
 * `problem` alanı çağıranlar (testler ve API filtre katmanı) içindir;
 * mesaj HER ZAMAN bu alandan türetilir, böylece ikisinin ayrışması
 * imkânsızdır (`InvalidGiftAmountError` ile AYNI desen). Tek bir
 * `reason → mesaj` haritası vardır.
 *
 * `problem` `'disabled'` İÇEREMEZ: "yatırma kapalı" durumu tamamen
 * `MockDepositDisabledError`'a aittir ve tutarın geçerliliğiyle İLGİSİZDİR
 * (kapalı bir uçta "tutarın çok küçük" demek yanıltıcı olurdu). Bu yüzden
 * `domain/economy/mock-deposit.ts` → `validateMockDeposit` `enabled`
 * alanına hiç BAKMAZ; o kararın tek sahibi `PaymentProvider.isEnabled()`'dır.
 */
export type InvalidDepositAmountProblem = 'not_an_integer' | 'below_minimum' | 'above_maximum';

const DEPOSIT_AMOUNT_MESSAGES: Record<InvalidDepositAmountProblem, string> = {
  not_an_integer: 'Yatırılacak tutar pozitif bir tam sayı olmalıdır.',
  below_minimum: 'Yatırılacak tutar izin verilen en düşük miktarın altında.',
  above_maximum: 'Yatırılacak tutar izin verilen en yüksek miktarın üzerinde.',
};

export class InvalidDepositAmountError extends Error {
  constructor(public readonly problem: InvalidDepositAmountProblem) {
    super(DEPOSIT_AMOUNT_MESSAGES[problem]);
    this.name = 'InvalidDepositAmountError';
  }
}

/**
 * `GET /players/:id/wallet?before=` imleci UUID değil (30.09.2026). 400 —
 * `limit`in aksine VARSAYILANA DÜŞÜLMEZ: bozuk imleç sessizce ilk sayfayı
 * dönseydi "daha fazla göster" aynı sayfayı sonsuza dek tekrar getirirdi.
 */
export class InvalidWalletCursorError extends Error {
  constructor(raw: string) {
    super(`Geçersiz cüzdan geçmişi imleci: ${raw.slice(0, 64)}`);
    this.name = 'InvalidWalletCursorError';
  }
}
