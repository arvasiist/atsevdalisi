import { describe, expect, it } from 'vitest';
import {
  BRIEF_TRANSACTION_TYPES,
  CANONICAL_TRANSACTION_TYPES,
  LEDGER_TRANSACTION_TYPES,
} from '@at-sevdalisi/shared-types';
import {
  CANONICAL_TYPE_LABELS,
  describeLedgerType,
  LEDGER_TYPE_LABELS,
} from '../../../src/features/wallet/ledger-labels';

/**
 * Cüzdan etiket haritaları (28.09.2026) — `Record<...>` kapsamının
 * ÇALIŞMA ZAMANI kanıtı.
 *
 * **NEDEN `tsc` YETMİYOR:** harita `Record<LedgerTransactionType, string>`
 * olarak tiplendiği için eksik anahtar derleme hatası verir — ama bu,
 * derleyicinin `@at-sevdalisi/shared-types`'ın **kaynak** birleşimini
 * gördüğü sürece doğrudur. Web uygulaması `transpilePackages` ile derlenir
 * ve CI'da `build:packages` sonrası `dist` üzerinden çözülebilir; o anda
 * birleşim `any`'ye düşerse derleyici susar ve harita sessizce eksik kalır.
 * Bu test aynı iddiayı ÇALIŞMA ZAMANINDA, listeyi kaynaktan okuyarak
 * kurar.
 */
describe('cüzdan etiket haritaları', () => {
  it('defterde YAZILABİLEN her tür için bir etiket vardır', () => {
    for (const type of LEDGER_TRANSACTION_TYPES) {
      const label = LEDGER_TYPE_LABELS[type];
      expect(label, `Etiketsiz defter türü: ${type}`).toBeTypeOf('string');
      expect(label.trim().length, `Boş etiket: ${type}`).toBeGreaterThan(0);
    }
  });

  it('haritada FAZLA anahtar yoktur (silinmiş bir tür etiket olarak kalmaz)', () => {
    // Bu yön de önemlidir: bir tür kaldırılıp etiketi bırakılırsa, ekranda
    // artık ÜRETİLEMEYEN bir hareket için Türkçe ad durur ve okuyan kişi
    // "bu hâlâ oluyor" sanır.
    const known = new Set<string>(LEDGER_TRANSACTION_TYPES);
    for (const key of Object.keys(LEDGER_TYPE_LABELS)) {
      expect(known.has(key), `Defterde olmayan etiket anahtarı: ${key}`).toBe(true);
    }
    expect(Object.keys(LEDGER_TYPE_LABELS).length).toBe(LEDGER_TRANSACTION_TYPES.length);
  });

  it('kanonik türlerin TAMAMI etiketlidir ve brief §20\'nin altı türü eksiksizdir', () => {
    for (const canonical of CANONICAL_TRANSACTION_TYPES) {
      expect(CANONICAL_TYPE_LABELS[canonical], `Etiketsiz kanonik tür: ${canonical}`).toBeTypeOf('string');
    }
    for (const briefType of BRIEF_TRANSACTION_TYPES) {
      expect(CANONICAL_TYPE_LABELS[briefType]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('etiketler YÖNSÜZDÜR — işaret metne gömülmez', () => {
    // Yön tek doğruluk kaynağından gelir: sunucunun gönderdiği İŞARETLİ
    // `amount`. Etikete "+" ya da "−" koymak, ikisinin çelişebileceği
    // ikinci bir yön kaynağı yaratırdı (ör. damızlık ücretinin alacak
    // satırı da aynı etiketi taşır).
    for (const label of Object.values(LEDGER_TYPE_LABELS)) {
      expect(label).not.toMatch(/[+\-−]/);
    }
  });

  it('bilinmeyen bir tür için ham değer döner — boş ya da uydurma metin değil', () => {
    // Sunucu istemciden yeni bir tür gönderirse ekran BOŞ kalmamalıdır;
    // oyuncunun defterde yazan gerçek değeri görmesi yeğdir.
    const unknown = 'yeni_bir_tur' as keyof typeof LEDGER_TYPE_LABELS;
    expect(describeLedgerType(unknown)).toBe('yeni_bir_tur');
  });

  it('bilinen bir tür için Türkçe etiket döner', () => {
    expect(describeLedgerType('mock_deposit')).toBe(LEDGER_TYPE_LABELS.mock_deposit);
    expect(describeLedgerType('lobby_race_entry_fee')).not.toBe('lobby_race_entry_fee');
  });
});
