import type { EconomyConfig } from '@at-sevdalisi/game-config';
import type { CanonicalTransactionType, LedgerTransactionType } from '@at-sevdalisi/shared-types';
import { CANONICAL_BY_LEDGER_TYPE } from '@at-sevdalisi/shared-types';

/**
 * Cüzdan işlem geçmişinin (brief §20, §42 PHASE 4) SAF domain kuralları.
 *
 * Bu dosya `wallet.ts` ile AYNI ilkede yazılmıştır: veritabanı/HTTP
 * erişimi YOK, sadece girdi → çıktı. Defteri okuyan SQL Infrastructure'da
 * (`infrastructure/wallet/postgres-wallet.repository.ts`), sayfalama
 * kuralı BURADA yaşar.
 */

/**
 * `GET /players/:id/wallet?limit=` parametresini normalize eder.
 *
 * `normalizeLobbyListLimit` (`domain/race/lobby.ts`) ile AYNI desen ve
 * AYNI gerekçe — bilinçli tekrar değil, bilinçli TUTARLILIK: iki liste
 * ucu da aynı soruya aynı cevabı vermelidir.
 *
 * **`unknown` ALIR** çünkü sorgu parametreleri her zaman METİNDİR
 * (`?limit=abc` gerçekten gelebilir) ve `@Query()` değerleri esbuild
 * altında doğrulanmaz (CLAUDE.md kural 5) — yani `@IsInt()` yazmak
 * yanılsama olurdu.
 *
 * **HATALI GİRDİ 400 DEĞİL, VARSAYILANA DÜŞER:** bu bir LİSTELEME ucudur.
 * `limit=abc` yüzünden oyuncuya cüzdanını hiç göstermemek kimseye bir şey
 * kazandırmaz. Tavanı aşan değer de sessizce kırpılır.
 */
export function normalizeWalletHistoryLimit(
  raw: unknown,
  config: Pick<EconomyConfig, 'walletHistoryDefaultLimit' | 'walletHistoryMaxLimit'>,
): number {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return config.walletHistoryDefaultLimit;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return config.walletHistoryDefaultLimit;
  }
  return Math.min(parsed, config.walletHistoryMaxLimit);
}

/**
 * Bir defter `type` değerini brief §20'nin aile kimliğine çevirir.
 *
 * NEDEN İNCE BİR SARMALAYICI: haritanın kendisi
 * `@at-sevdalisi/shared-types`'ta yaşar (cüzdan EKRANI da aynı haritayı
 * kullanır — `apps/web`). Domain katmanının haritaya doğrudan erişmesi
 * yerine bu fonksiyondan geçmesi, ileride bir "aile" kuralı eklenirse
 * (ör. REFUND'un yalnızca ENTRY_FEE/SPECTATOR_FEE'den türeyebilmesi)
 * değişecek TEK yeri belirler.
 *
 * `Record<LedgerTransactionType, ...>` olduğu için tanımsız bir tür
 * derleme hatasıdır; çalışma zamanında `undefined` dönmesi imkansızdır.
 */
export function canonicalTypeOf(type: LedgerTransactionType): CanonicalTransactionType {
  return CANONICAL_BY_LEDGER_TYPE[type];
}
