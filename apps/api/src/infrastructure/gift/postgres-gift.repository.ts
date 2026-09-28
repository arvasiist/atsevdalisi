import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Currency } from '@at-sevdalisi/shared-types';
import type {
  GiftCounterpartyFacts,
  GiftFacts,
  GiftRepository,
  SendGiftExecutionResult,
  SendGiftInput,
} from '../../application/ports/gift.repository';
import {
  assertGiftAllowedByFriendship,
  assertNotSelfGift,
  assertUnderDailyGiftLimit,
  assertValidGiftAmount,
  resolveGiftCurrency,
} from '../../domain/gift/gift';
import { transfer } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { canonicalPair } from '../../domain/social/friendship';
import { assertNoBlock } from '../../domain/social/moderation';
import { buildGiftReceivedPayload } from '../../domain/social/notification';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';

/** `players` satırının bu dosyanın İHTİYAÇ DUYDUĞU sütunları (bakiye + alıcı görünümü). */
interface PlayerBalanceRow {
  id: string;
  money: string;
  gems: string;
  display_name: string;
  level: number;
}

/** `gift_sends` + karşı tarafın JOIN'inden gelen görünür alanları. */
interface GiftListRow {
  id: string;
  sender_id: string;
  currency: string;
  amount: string;
  created_at: Date;
  counterparty_id: string;
  counterparty_display_name: string;
  counterparty_level: number;
}

function rowToGiftFacts(row: GiftListRow, playerId: string): GiftFacts {
  return {
    giftId: row.id,
    // `direction` SQL'de TÜRETİLİR ama TEK doğruluk kaynağı burasıdır:
    // sorgu zaten `sender_id = $1 OR recipient_id = $1` ile süzer, yani
    // `sender_id === playerId` değilse satır GELEN'dir.
    direction: row.sender_id === playerId ? 'outgoing' : 'incoming',
    counterparty: {
      playerId: row.counterparty_id,
      displayName: row.counterparty_display_name,
      level: row.counterparty_level,
    },
    currency: row.currency as Currency,
    amount: Number(row.amount),
    createdAt: row.created_at,
  };
}

/**
 * Hediye gönderimi — **PARA YOLU** (proje sahibinin açık talebi, 27.09.2026
 * — üç parçanın üçüncüsü). Bkz. `GiftRepository` port doc yorumundaki tam
 * gerekçe.
 *
 * **Bu sınıf `PostgresMarketPurchaseRepository`'nin İKİ-SATIRLI para yolu
 * şablonunun kardeşidir** (tek transaction, sözlüksel `players` kilidi, iki
 * ledger satırı) ama ÜÇ farkı vardır:
 *
 *   1. **Giriş noktası satırı YOKTUR.** Piyasa alımında önce `market_listings`
 *      satırı kilitlenir (işlemin giriş noktası); hediyede böyle bir satır
 *      yoktur — kilitlenen İKİ `players` satırının kendisidir.
 *   2. **Para yönü TEK:** transfer her zaman `sender → recipient`'tır
 *      (`market`'ta alıcı/satıcı ilandan gelir ve yön sabit değildir).
 *   3. **Ön koşul okuması vardır:** `friendships` satırı transaction'ın
 *      İÇİNDE okunur (kilit ALINMAZ — aşağıdaki nota bakın).
 *
 * **KİLİT SIRASI (deadlock'tan kaçınmak için — "her yerde AYNI global
 * sıra" ilkesi, `updateTwoWithLock`/`executePurchase` ile AYNI):** İKİ
 * `players` satırı id'lerin SÖZLÜKSEL sırasına göre `FOR UPDATE`. Bu sıra
 * kritiktir: A→B ve B→A hediyeleri (ya da bir hediye ile bir piyasa alımı)
 * aynı anda koşarsa, ikisi de aynı iki satırı AYNI sırada kilitler.
 *
 * **`friendships` satırı NEDEN KİLİTLENMEZ:** arkadaşlıktan çıkma
 * (`removeFriendship`) yalnızca `friendships` satırını alır ve HİÇBİR
 * `players` satırına dokunmaz — yani bu iki işlem arasında bir kilit
 * DÖNGÜSÜ kurulamaz. Kilit almak, hiçbir tutarlılık kazandırmadan yalnızca
 * bir kilit sırası daha eklerdi. Yarış koşulunun sonucu zararsızdır: hediye
 * ile eşzamanlı bir "arkadaşlıktan çık" isteği ya hediyeyi geçirir ya
 * `GIFT_REQUIRES_FRIENDSHIP` döndürür — ikisi de tutarlı bir sonuçtur.
 */
@Injectable()
export class PostgresGiftRepository implements GiftRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async sendGift(input: SendGiftInput): Promise<SendGiftExecutionResult> {
    // Saf kapılar EN BAŞTA, hiçbir sorgu çalışmadan: ucuzlar ve girdi
    // hatasıdırlar (DB durumuna bağlı değiller). Sıra, use-case'in
    // sırasıyla AYNIdır — burada TEKRARLANMALARININ sebebi, bu portun
    // use-case'ten bağımsız olarak da çağrılabilir olması ve
    // `gift_sends_not_self`/`amount > 0` CHECK'lerine varmadan anlaşılır
    // bir hata dönmesi gerektiğidir (son savunma hattı veritabanıdır).
    assertNotSelfGift(input.senderId, input.recipientId);
    assertValidGiftAmount(input.amount, { minAmount: input.minAmount, maxAmount: input.maxAmount });
    // `input.currency` port tipinde `Currency`'dir ama çalışma zamanında
    // öyle OLMAYABİLİR (`as any` ile geçilmiş bir değer) — `resolveGiftCurrency`
    // bunu `economy_transactions.currency` CHECK'inin (`IN ('money','gems')`)
    // anlaşılmaz bir `23514`'ü yerine 400'e çevirir.
    const currency = resolveGiftCurrency(input.currency, input.allowedCurrencies);

    const senderId = input.senderId;
    const recipientId = input.recipientId;
    // `noUncheckedIndexedAccess` altında dizi indekslemeden kaçınmak için
    // `updateTwoWithLock`/`executePurchase` ile AYNI doğrudan karşılaştırma.
    const firstId = senderId <= recipientId ? senderId : recipientId;
    const secondId = senderId <= recipientId ? recipientId : senderId;

    return withTransaction(this.pool, async (client) => {
      const balancesById = new Map<string, PlayerBalanceRow>();
      for (const id of [firstId, secondId]) {
        const result = await client.query<PlayerBalanceRow>(
          'SELECT id, money, gems, display_name, level FROM players WHERE id = $1 FOR UPDATE',
          [id],
        );
        const row = result.rows[0];
        if (row) {
          balancesById.set(id, row);
        }
      }

      const senderRow = balancesById.get(senderId);
      if (!senderRow) {
        throw new PlayerNotFoundError(senderId);
      }
      const recipientRow = balancesById.get(recipientId);
      if (!recipientRow) {
        // Gönderen zaten var olduğuna göre bu dal, `senderId !== recipientId`
        // (yukarıda garanti edildi) olmasına rağmen alıcının satırının
        // bulunamadığı anlamına gelir — `executePurchase`'ın "satıcı
        // bulunamadı" dalıyla AYNI veri bütünlüğü durumu.
        throw new PlayerNotFoundError(recipientId);
      }

      const senderBalance = { money: Number(senderRow.money), gems: Number(senderRow.gems) };
      const recipientBalance = { money: Number(recipientRow.money), gems: Number(recipientRow.gems) };

      // ARKADAŞLIK KAPISI — **yazma transaction'ının İÇİNDE**, kilitler
      // alındıktan SONRA. Use-case'teki ön kontrol yalnızca erken/anlaşılır
      // bir hata içindir; İKİNCİ bir savunma hattı yoktur (bu, iki tablo
      // arası bir "durum" kuralıdır, bir DB CHECK'i olamaz) — bu yüzden
      // kontrol burada, kilitle aynı transaction'da TEKRARLANIR.
      const { lowId, highId } = canonicalPair(senderId, recipientId);
      const friendshipResult = await client.query(
        `SELECT 1 FROM friendships
         WHERE player_low_id = $1 AND player_high_id = $2 AND status = 'accepted'
         LIMIT 1`,
        [lowId, highId],
      );
      assertGiftAllowedByFriendship(
        friendshipResult.rowCount !== null && friendshipResult.rowCount > 0,
        recipientId,
      );

      // ENGEL KAPISI — brief §33 (PHASE 15). Arkadaşlık kapısıyla AYNI
      // yerde ve AYNI gerekçeyle: engelleme arkadaşlık satırını SİLMEZ
      // (bkz. `BlockPlayerUseCase`), yani yukarıdaki arkadaşlık kontrolü
      // engelli bir çiftte GEÇER. Use-case'teki ön kontrol erken bir hata
      // içindir; para yolu olduğu için asıl kapı burada, kilitli
      // transaction'ın içinde TEKRARLANIR — arada konan bir engel parayı
      // durdurmalıdır.
      //
      // İKİ YÖN TEK SORGUDA: A, B'yi engellediyse B'nin A'ya hediye
      // gönderememesi gerekir (`isBlockedBetween` ile AYNI semantik).
      const blockResult = await client.query(
        `SELECT 1 FROM player_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
         LIMIT 1`,
        [senderId, recipientId],
      );
      assertNoBlock(blockResult.rowCount !== null && blockResult.rowCount > 0);

      // GÜNLÜK SAYIM — gönderenin satırı YUKARIDA `FOR UPDATE` ile
      // KİLİTLİ olduğundan, aynı gönderenin eşzamanlı iki isteği bu kilit
      // üzerinden SERİLEŞİR; sayım bu yüzden güvenle tutarlıdır
      // (`executePurchase`'ın "alıcının ahır sayımı" notuyla AYNI gerekçe).
      //
      // Pencere UZUNLUĞU config'ten gelir (`dailyWindowHours`) — sorguya
      // gömülü bir `interval '24 hours'` sihirli sayı olurdu. `$2::int`
      // AÇIK cast'i zorunludur: node-postgres parametreleri `unknown`
      // tipiyle gönderir ve çıplak `$2 * interval '1 hour'` ifadesi
      // PostgreSQL'de "operator is not unique: unknown * interval" ile
      // REDDEDİLİR (`make_interval(hours => $2)` de aynı belirsizliği
      // taşır — adlandırılmış argümanın tipi yine `unknown` kalır).
      const sentCountResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM gift_sends
         WHERE sender_id = $1 AND created_at >= now() - ($2::int * interval '1 hour')`,
        [senderId, input.dailyWindowHours],
      );
      const sentCount = Number(sentCountResult.rows[0]?.count ?? '0');
      assertUnderDailyGiftLimit(sentCount, input.dailyLimit);

      // PARA HESABI — satırlar HÂLÂ kilitliyken, EN GÜNCEL bakiyelerle
      // (docs/SECURITY.md §5). Yetersiz bakiyede `InsufficientFundsError`
      // fırlar (`domain/economy/errors.ts`) ve `withTransaction` ROLLBACK
      // yapar — hiçbir satır yazılmaz.
      const moved = transfer(senderBalance, recipientBalance, input.amount, currency);

      const now = new Date();
      await client.query('UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1', [
        senderId,
        moved.from.money,
        moved.from.gems,
        now,
      ]);
      await client.query('UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1', [
        recipientId,
        moved.to.money,
        moved.to.gems,
        now,
      ]);

      const giftResult = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO gift_sends (sender_id, recipient_id, currency, amount)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [senderId, recipientId, currency, input.amount],
      );
      const gift = giftResult.rows[0];
      if (!gift) {
        // `INSERT ... RETURNING` her zaman bir satır döner — buraya düşmek
        // şema/bağlantı seviyesinde beklenmedik bir durumdur. Sessizce
        // devam etmek, defter satırlarını `reference_id` olmadan (ya da
        // bozuk) yazardı (`postgres-grandstand.repository.ts` ile AYNI not).
        throw new Error(`Hediye kaydı yazılamadı (gönderen: ${senderId}, alıcı: ${recipientId}).`);
      }

      // DEFTER — AYNI transaction'da İKİ satır (gönderen borç, alıcı alacak).
      // Hediye bir TRANSFER olduğu için (SINK değil) iki satır ZORUNLUDUR:
      // yalnızca borç yazmak, toplam arzın azaldığını iddia ederdi.
      // `balanceBefore`/`balanceAfter` yalnızca HAREKET EDEN birim için
      // tutulur (`grandstand`/`savePracticeRaceWithStakes` ile AYNI kural).
      await writeLedgerEntries(client, [
        {
          playerId: senderId,
          // `type` serbest metindir (migration 0019) — yeni tür migration
          // GEREKTİRMEZ. Ters kayıt (`gift_send_credit`) AYNI `reference_id`'yi
          // taşıdığından iki satır `reference_type` + `reference_id` ile
          // birlikte okunabilir.
          type: 'gift_send_debit',
          // İMZALI: gönderen için bu bir ÇIKIŞtır, bu yüzden negatif.
          amount: -input.amount,
          currency,
          referenceType: 'gift_send',
          referenceId: gift.id,
          balanceBefore: senderBalance[currency],
          balanceAfter: moved.from[currency],
          idempotencyKey: input.idempotencyKey,
        },
        {
          playerId: recipientId,
          type: 'gift_send_credit',
          amount: input.amount,
          currency,
          referenceType: 'gift_send',
          referenceId: gift.id,
          balanceBefore: recipientBalance[currency],
          balanceAfter: moved.to[currency],
          idempotencyKey: input.idempotencyKey,
        },
      ]);

      // BİLDİRİM — `gift_received`, AYNI transaction'da (brief §28, §42
      // PHASE 13). `NotificationRepository` port doc yorumundaki kural:
      // üreten use-case/repository, kendi satırını ve bildirimi TEK
      // transaction'da yazar.
      //
      // **NEDEN TAM BURADA (defterden SONRA, `return`den ÖNCE):** para
      // yoluyla bildirim AYRILAMAZ. İki ayrı ifade olsalardı ikincisi
      // düşerse ortada GÖRÜNMEZ bir hediye kalırdı — alıcının bakiyesi
      // artmış ama haberi olmamış olurdu; ve bu, hiçbir yerde hata
      // üretmeyen sessiz bir tutarsızlık olurdu. Aynı transaction'da
      // olduğu için ya ikisi de yazılır ya hiçbiri.
      //
      // `displayName` GÖNDERENİN adıdır (bildirim alıcının satırıdır,
      // `playerId` karşı tarafı — yani göndereni — gösterir); `senderRow`
      // yukarıda kilit altında ZATEN okundu, ikinci bir sorgu gerekmez.
      await client.query(
        'INSERT INTO notifications (player_id, type, payload) VALUES ($1, $2, $3::jsonb)',
        [
          recipientId,
          'gift_received',
          JSON.stringify(
            buildGiftReceivedPayload({
              giftSendId: gift.id,
              playerId: senderId,
              displayName: senderRow.display_name,
              currency,
              amount: input.amount,
            }),
          ),
        ],
      );

      const recipient: GiftCounterpartyFacts = {
        playerId: recipientId,
        displayName: recipientRow.display_name,
        level: recipientRow.level,
      };

      return {
        giftId: gift.id,
        senderBalance: moved.from,
        recipient,
      };
    });
  }

  async listGifts(playerId: string, limit: number): Promise<GiftFacts[]> {
    // Karşı taraf `CASE WHEN` ile bulunur (satırda "kim ben" bilgisi
    // yoktur — `PostgresSocialRepository.findOverview` ile AYNI desen);
    // JOIN'in `ON` koşulu bu yüzden `CASE`'i TEKRARLAR.
    const result = await this.pool.query<GiftListRow>(
      `SELECT g.id, g.sender_id, g.currency, g.amount, g.created_at,
              p.id AS counterparty_id, p.display_name AS counterparty_display_name, p.level AS counterparty_level
       FROM gift_sends g
       JOIN players p
         ON p.id = CASE WHEN g.sender_id = $1 THEN g.recipient_id ELSE g.sender_id END
       WHERE g.sender_id = $1 OR g.recipient_id = $1
       ORDER BY g.created_at DESC
       LIMIT $2`,
      [playerId, limit],
    );
    return result.rows.map((row) => rowToGiftFacts(row, playerId));
  }
}
