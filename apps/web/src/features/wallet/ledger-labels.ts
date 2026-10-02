import type { CanonicalTransactionType, LedgerTransactionType } from '@at-sevdalisi/shared-types';

/**
 * Cüzdan ekranındaki hareket etiketleri (brief §20 "WALLET SYSTEM", §35
 * `/wallet` — 28.09.2026).
 *
 * ## Neden `Record<LedgerTransactionType, string>` ve düz bir nesne DEĞİL
 *
 * Defterde YAZILABİLEN her tür (`LEDGER_TRANSACTION_TYPES`, 20 değer) bu
 * haritada BULUNMAK ZORUNDADIR. Tip `Record<...>` olduğu için eksik bir
 * anahtar `tsc` hatası verir — sunucuya yeni bir tür eklendiğinde
 * (`shared-types`'ta birleşim büyür) istemci SESSİZCE boş bir satır
 * göstermeye başlayamaz. Bu, `CURRENCY_LABELS`'taki (`lib/currency.ts`)
 * gerekçenin aynısıdır.
 *
 * ## Neden ham `type` yerine bu etiketler
 *
 * `type` alanı defterin İNCE türüdür (`lobby_race_entry_fee`) ve oyuncuya
 * gösterilemez. Kanonik tür (`ENTRY_FEE`) ise brief'in ailesidir ama TEK
 * BAŞINA YETMEZ: aynı `ENTRY_FEE` ailesinde `practice_race_entry_fee` ile
 * `lobby_race_entry_fee` vardır ve cüzdanda "hangi yarışa ne ödedim"
 * sorusunun cevabı bu ayrımdır. Etiket bu yüzden İNCE tür üzerinden
 * yazılır; kanonik tür yalnızca gruplama/renklendirme için kullanılır.
 *
 * ## Yön metne GÖMÜLMEZ
 *
 * "Yem aldın" / "Ödül kazandın" gibi ifadeler yönü (borç/alacak) metne
 * gömerdi ve o zaman `amount` işaretiyle çelişme riski doğardı. Etiketler
 * bilerek YÖNSÜZDÜR ("Yem alımı"); ekranda ödemenin yönünü `amount`
 * işareti (+/−) ve rengi taşır. Tek doğruluk kaynağı sunucunun gönderdiği
 * işaretli tutardır (brief §22 "Tüm finansal hesaplamalar backend'de
 * yapılmalı").
 */
export const LEDGER_TYPE_LABELS: Record<LedgerTransactionType, string> = {
  daily_reward: 'Günlük ödül',
  stable_upgrade: 'Ahır yükseltmesi',
  facility_build: 'Tesis inşası',
  facility_upgrade: 'Tesis yükseltmesi',
  feed_purchase: 'Yem alımı',
  breeding_stud_fee_debit: 'Damızlık ücreti (ödenen)',
  breeding_stud_fee_credit: 'Damızlık ücreti (kazanılan)',
  gift_send_debit: 'Hediye gönderimi',
  gift_send_credit: 'Hediye alımı',
  grandstand_ticket: 'Tribün bileti',
  // PHASE 7.2 — yönsüz: satın almanın AYNASI. "Tribün bileti iadesi"
  // yazılsaydı etiket yönü (alacak) metne gömerdi; yönü `amount` işareti
  // taşır. `race_entry_refund` ile aynı desen.
  grandstand_ticket_refund: 'Tribün bileti iadesi',
  market_purchase_debit: 'Pazar alımı',
  market_purchase_credit: 'Pazar satışı',
  practice_race_entry_fee: 'Antrenman yarışı girişi',
  practice_race_prize: 'Antrenman yarışı ödülü',
  lobby_race_entry_fee: 'Yarış giriş ücreti',
  lobby_race_prize: 'Yarış ödülü',
  mock_deposit: 'Sanal para yüklemesi',
  race_entry_refund: 'Yarış girişi iadesi',
  // PHASE 6.2 — yönsüz: bu satır HEM ödeme (debit) hem de (ücretsiz jokeyde
  // deftere hiç yazılmadığı için pratikte yalnızca) ödeme anlamına gelir,
  // ama etiket kuralı gereği yön metne gömülmez.
  jockey_hire: 'Jokey kiralama',
  staff_contract: 'Personel sözleşmesi',
  season_reward: 'Sezon ödülü',
  auction_bid_hold: 'Müzayede teklifi',
  auction_bid_refund: 'Müzayede teklifi iadesi',
  auction_sale_credit: 'Müzayede satışı',
};

/**
 * Kanonik türlerin Türkçe adları — filtre/özet satırları için.
 *
 * `Record<CanonicalTransactionType, string>` olduğu için brief §20'nin
 * saydığı altı türün hepsi burada ZORUNLUDUR; yeni bir aile eklenirse
 * derleyici uyarır.
 */
export const CANONICAL_TYPE_LABELS: Record<CanonicalTransactionType, string> = {
  DEPOSIT: 'Yatırma',
  ENTRY_FEE: 'Giriş ücreti',
  PRIZE: 'Ödül',
  GIFT: 'Hediye',
  SPECTATOR_FEE: 'Seyirci',
  REFUND: 'İade',
  MARKET: 'Pazar',
  BREEDING: 'Damızlık',
  UPKEEP: 'Bakım',
  REWARD: 'Ödül (günlük)',
};

/**
 * Bir hareketin oyuncuya görünen adı. Bilinmeyen bir tür gelirse ham
 * değer DÖNER (boş etiket ya da "bilinmiyor" değil): sunucu istemciden
 * yeni bir tür eklediyse, oyuncunun ekranında en azından defterde
 * yazan gerçek değeri görmesi, hiçbir şey görmemesinden iyidir.
 */
export function describeLedgerType(type: LedgerTransactionType): string {
  return LEDGER_TYPE_LABELS[type] ?? type;
}

