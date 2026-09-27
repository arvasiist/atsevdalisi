import type { FeedType, Horse, Player } from '@at-sevdalisi/shared-types';
import type { EconomyLedgerEntryInput } from './economy-ledger';

/**
 * Yem envanteri portu (brief §12, bu turda EKLENDİ).
 *
 * NEDEN AYRI BİR REPOSITORY: `PlayerRepository.updateWithLock` kilitleme +
 * oyuncu yazımı + defter kaydını üstlenir, ama yem SATIN ALMA ayrıca
 * `player_feed_inventory` satırını, BESLEME ise hem `player_feed_inventory`
 * hem `horse_feed_log` hem de `horses` satırını AYNI transaction'da yazmak
 * zorundadır. Bu yüzden — `FacilityRepository` ile AYNI gerekçe ve AYNI
 * desen — kilidi ve transaction'ı kendisi kuran ayrı bir port vardır.
 *
 * KİLİT SIRASI (deadlock'u önlemek için HER İKİ metotta da aynıdır):
 * **önce `players`, sonra `horses`.** Oyuncu satırının kilitlenmesi aynı
 * oyuncunun TÜM para/stok işlemlerini tek sıraya dizer; at satırı ancak
 * ondan SONRA kilitlenir. Mevcut kodda `players`+`horses` ikilisini birlikte
 * kilitleyen başka bir yol YOKTUR (`PlayerRepository` yalnızca oyuncuyu,
 * `HorseRepository` yalnızca atı kilitler), dolayısıyla döngü oluşamaz.
 */
export interface FeedInventoryRepository {
  /**
   * Oyuncunun envanterindeki adetler. Yalnızca SATIN ALINMIŞ kalemler
   * döner; stoklanmayan kalemler (`saman`) haritada HİÇ bulunmaz —
   * çağıran `get() ?? 0` ile okumalıdır (yokluk "stok bitti" değil,
   * "stok kavramı yok" demektir).
   */
  findQuantities(playerId: string): Promise<Map<FeedType, number>>;

  /**
   * Bir ATIN kayan pencere içindeki kalem başına besleme kullanımı —
   * günlük sınır kontrolünün girdisi (bkz. `domain/care/care.ts`
   * `evaluateFeedAllowance`). Yalnızca pencerede kaydı OLAN kalemler döner.
   */
  getWindowUsages(horseId: string, windowStart: Date): Promise<Map<FeedType, FeedWindowUsage>>;

  /**
   * Yem SATIN ALMA — `players` satırını kilitler, güncel stoğu okur,
   * `mutate`'i çalıştırır, oyuncuyu + stoğu + (varsa) defter kaydını AYNI
   * transaction'da yazar. Oyuncu yoksa `mutate` hiç çağrılmaz, `null` döner
   * (`PlayerRepository.updateWithLock` ile AYNI sözleşme).
   *
   * Domain doğrulaması (fiyat, yeterli bakiye) BİLEREK `mutate` İÇİNDE
   * yapılmalıdır: satır kilitliyken okunan bakiye/stok en güncel değerdir.
   */
  buyWithLock<T>(
    playerId: string,
    feedType: FeedType,
    count: number,
    mutate: (
      player: Player,
      currentQuantity: number,
    ) => { player: Player; quantity: number; result: T; ledgerEntries?: EconomyLedgerEntryInput[] },
  ): Promise<T | null>;

  /**
   * GÜNLÜK HEDİYE (bu turda EKLENDİ) — `players` satırını kilitler, oyuncunun
   * TÜM stok adetlerini okur, `mutate`'i çalıştırır, oyuncuyu + verilen
   * kalemleri + (varsa) defter kaydını AYNI transaction'da yazar.
   *
   * NEDEN `PlayerRepository.updateWithLock` YETMİYOR: günlük ödül artık para
   * ile BİRLİKTE bedava yem de veriyor; `updateWithLock`'un callback'i
   * yalnızca `players` satırını yazabildiğinden `player_feed_inventory`'ye
   * dokunamaz. İki ayrı transaction'a bölmek ise "para verildi ama yem
   * verilmedi" (ya da tersi) durumunu MÜMKÜN kılardı.
   *
   * `mutate`'e KİLİTLİ okunmuş güncel adetler verilir; döndürdüğü `grants`
   * MUTLAK yeni adetlerdir (`quantity += count` hesabı çağıranın işidir),
   * `null` döndürmek diye bir şey YOKTUR — hediye ya verilir ya verilmez.
   */
  grantWithLock<T>(
    playerId: string,
    mutate: (
      player: Player,
      quantities: Map<FeedType, number>,
    ) => {
      player: Player;
      grants: FeedGrant[];
      result: T;
      ledgerEntries?: EconomyLedgerEntryInput[];
    },
  ): Promise<T | null>;

  /**
   * BESLEME — tek transaction'da: (1) `players` satırını kilitle, (2) güncel
   * stoğu ve pencere kullanımını oku, (3) `horses` satırını kilitle,
   * (4) `mutate` (saf domain: izin + etki), (5) atı yaz, (6) stoğu yaz
   * (yalnızca stoklanan kalemlerde), (7) `horse_feed_log`'a bir satır ekle.
   *
   * Besleme PARA HAREKETİ üretmez (para yalnızca satın almada harcanır), bu
   * yüzden defter kaydı YOKTUR — `ledgerEntries` alanı bilinçli olarak
   * yoktur. Buna karşılık stok düşümü ile atın beslenmesi AYRI
   * transaction'lara BÖLÜNMEZ: bölünseydi ya stok düşüp at beslenmemiş
   * olabilirdi ya da at beslenip stok düşmemiş olabilirdi.
   */
  feedWithLock<T>(
    playerId: string,
    horseId: string,
    feedType: FeedType,
    windowStart: Date,
    mutate: (context: FeedContext) => FeedMutationResult<T>,
  ): Promise<T | null>;
}

/** Envantere yazılacak MUTLAK adet (hediye/başlangıç stoğu). */
export interface FeedGrant {
  type: FeedType;
  /** Hediyeden SONRA envanterde olacak adet — `quantity += count` DEĞİL. */
  quantity: number;
}

/** Kayan pencere içindeki besleme kullanımı. */
export interface FeedWindowUsage {
  /** Pencerede verilen adet. */
  fedInWindow: number;
  /**
   * Penceredeki EN ESKİ besleme zamanı; hiç kayıt yoksa `null`. Sınır
   * dolduğunda yeni hakkın ne zaman açılacağını YALNIZCA bu değer söyler
   * (bkz. `evaluateFeedAllowance` doc yorumu).
   */
  oldestInWindowAt: Date | null;
}

/** `feedWithLock`'un `mutate` callback'ine verilen KİLİTLİ bağlam. */
export interface FeedContext {
  player: Player;
  horse: Horse;
  /** Kalemin envanterdeki mevcut adedi; stoklanmayan kalemlerde `0`. */
  quantity: number;
  usage: FeedWindowUsage;
}

/** `feedWithLock` `mutate` sonucu. */
export interface FeedMutationResult<T> {
  /** Besleme SONRASI at (vitals güncellenmiş hâli) — repository bunu yazar. */
  horse: Horse;
  /**
   * Envantere yazılacak YENİ adet. `null` = envantere HİÇ DOKUNMA
   * (stoklanmayan kalem — `player_feed_inventory`'ye satır açılmaz).
   */
  quantity: number | null;
  result: T;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const FEED_INVENTORY_REPOSITORY = Symbol('FEED_INVENTORY_REPOSITORY');
