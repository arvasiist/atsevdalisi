import type { WalletView } from '@at-sevdalisi/shared-types';

/**
 * `WalletRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). `pedigree.repository.ts` ile AYNI desen
 * (docs/ARCHITECTURE.md §4).
 *
 * ## Neden AYRI BİR PORT (mevcut `PlayerRepository`'ye eklenmedi)
 *
 * `PlayerRepository`'nin tamamı **YAZMA** yoludur: her metodu `FOR UPDATE`
 * kilidi alır, `mutate` callback'i çalıştırır ve `economy_transactions`
 * defter kaydını AYNI transaction'da yazar (`updateWithLock`/
 * `updateTwoWithLock`). Cüzdan okuması ise tam tersidir: kilit ALMAZ,
 * hiçbir şey yazmaz, defteri SAYFALAYARAK okur. İkisini aynı portta
 * birleştirmek, "bu metot kilitsiz" bilgisini portun kendi dokümantasyonuna
 * gömmek zorunda bırakırdı — ve `player.repository.ts`'in başındaki
 * "PARA/MUTASYON YOLU" uyarısını okuyan birinin o metodu yanlışlıkla
 * mutasyon bağlamında kullanması kolaylaşırdı.
 *
 * ## SALT OKUMA (read-only) — brief §22
 *
 * Bu portun hiçbir metodu bakiye DEĞİŞTİREMEZ. Bakiye yalnızca
 * `PlayerRepository`'nin kilitli mutasyonlarıyla değişir; istemci
 * `GET /players/:id/wallet` ile okuduğu değeri geri göndererek hiçbir şeyi
 * değiştiremez (brief §22 "Client balance/prize/multiplier/entry fee
 * hesaplayamamalı").
 */
export interface WalletRepository {
  /**
   * Bir oyuncunun bakiyesini (`players.money`/`players.gems`) ve defter
   * geçmişinin EN YENİ `limit` satırını okur.
   *
   * **Oyuncu YOKSA `null` döner** — use-case bundan 404 üretir. Bu ayrım
   * önemlidir: "bakiyesi 0 olan oyuncu" (geçerli) ile "olmayan oyuncu"
   * (404) aynı şeye indirgenmemelidir.
   *
   * `hasMore` alanını doldurmak için repository `limit + 1` satır okur ve
   * fazlalığı düşer — istemcinin "length === limit ise daha vardır"
   * tahminine bırakılmaz (tam bölünen sonuçlarda bu tahmin yanlış çıkar).
   */
  findWallet(playerId: string, limit: number, before?: string | null): Promise<Omit<WalletView, 'depositAvailable'> | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');
