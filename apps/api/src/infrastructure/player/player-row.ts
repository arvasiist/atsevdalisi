import type { PoolClient } from 'pg';
import type { Player } from '@at-sevdalisi/shared-types';
import type { EconomyLedgerEntryInput } from '../../application/ports/economy-ledger';

/**
 * `players` satırının OKUNMASI ve YAZILMASI — tek yer.
 *
 * `PostgresPlayerRepository` (`updateWithLock`/`updateTwoWithLock`) ve
 * `PostgresFacilityRepository` (bu turda EKLENDİ) bu tanımları PAYLAŞIR.
 *
 * NEDEN PAYLAŞILIYOR: çiftlik tesisleri `facilities` tablosunda yaşar ama
 * parası `players` satırından düşer — yani bir tesis yükseltmesi de `players`
 * satırını okuyup yazmak ZORUNDADIR. `PlayerRow`/`rowToPlayer`/`UPDATE`
 * sorgusunu ikinci bir repository'ye KOPYALAMAK, `players`'a yeni bir kolon
 * eklendiğinde kopyalardan birinin sessizce eskimesi demekti (bu projede
 * daha önce yaşanmış bir hata sınıfı: bayat seed SQL'i). Bu yüzden tanımlar
 * TEK yerde durur ve iki çağıran da buradan okur.
 *
 * Katman notu: bu dosya Infrastructure'dadır ama Application katmanına ait
 * `EconomyLedgerEntryInput`'u import eder. Bu, `PostgresPlayerRepository`'nin
 * zaten yaptığı şeyin ta kendisidir — söz konusu tip API sınırını hiç geçmez,
 * yalnızca Application (`mutate` callback'i) ile Infrastructure arasında
 * TAŞINAN bir taşıyıcı (carrier) tiptir (bkz. `ports/economy-ledger.ts`).
 *
 * Yazma fonksiyonları çağıranın `PoolClient`'ını (yani AÇIK transaction'ı)
 * alır — kendi transaction'ını AÇMAZ. Böylece "oyuncu satırı + defter kaydı
 * + tesis satırı ya hep birlikte yazılır ya da hiçbiri yazılmaz" garantisi
 * çağıranın `withTransaction`'ına bağlı kalır (docs/SECURITY.md §5).
 */

/**
 * `players` tablosunun satır şekli (snake_case, `database/migrations/
 * 0001_create_extensions_and_players.up.sql`). `money`/`gems`/`xp`
 * PostgreSQL'de BIGINT'tir — `node-postgres` BIGINT'i (hassasiyet kaybını
 * önlemek için, JS `number`'ın güvenli tamsayı sınırını aşabileceğinden)
 * varsayılan olarak STRING döner; bu oyunun para/xp değerleri bu sınırı
 * pratikte aşmayacağı için `Number(...)`'a çevrilir (bkz. `Player.money`
 * tipi zaten `number`, `packages/shared-types/src/player.ts`).
 */
export interface PlayerRow {
  id: string;
  username: string;
  display_name: string;
  avatar_id: string | null;
  level: number;
  xp: string;
  money: string;
  gems: string;
  reputation: number;
  // FAZ 1 wiring, üçüncü dilim — `database/migrations/
  // 0012_create_staff_and_stable_level.up.sql`. INTEGER olduğundan (BIGINT/
  // NUMERIC'in aksine) `node-postgres` bunu doğrudan JS `number` döner.
  stable_level: number;
  // FAZ 1 wiring, yedinci dilim — `database/migrations/
  // 0016_add_last_daily_reward_claimed_at.up.sql`.
  last_daily_reward_claimed_at: Date | null;
  // FAZ 1 wiring, on dördüncü dilim — `database/migrations/
  // 0018_add_pvp_matchmaking.up.sql`. INTEGER olduğundan (BIGINT/NUMERIC'in
  // AKSİNE, `stable_level` ile AYNI gerekçe) doğrudan JS `number` döner.
  rating: number;
  // brief §34 yönetim rolü — `database/migrations/
  // 0041_create_admin_role_and_audit_log.up.sql`. BOOLEAN olduğundan
  // (BIGINT'in AKSİNE) `node-postgres` doğrudan JS `boolean` döner; burada
  // `Number(...)` YOKTUR ve olmamalıdır.
  is_admin: boolean;
  is_moderator: boolean;
  created_at: Date;
  updated_at: Date;
}

export function rowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarId: row.avatar_id,
    level: row.level,
    xp: Number(row.xp),
    money: Number(row.money),
    gems: Number(row.gems),
    reputation: row.reputation,
    stableLevel: row.stable_level,
    lastDailyRewardClaimedAt: row.last_daily_reward_claimed_at ? row.last_daily_reward_claimed_at.toISOString() : null,
    rating: row.rating,
    isAdmin: row.is_admin,
    isModerator: row.is_moderator,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * `updateWithLock`/`updateTwoWithLock`/tesis yükseltmesinin PAYLAŞTIĞI yazma
 * sorgusu (DRY). FAZ 1 wiring, on dördüncü dilim — `rating` da BURADAN
 * güncellenir (`JoinMatchmakingQueueUseCase`, `updateTwoWithLock` ile İKİ
 * oyuncunun Elo reytingini TEK transaction'da yazar —
 * `BuyMarketListingUseCase`'in `money` alanı için yaptığıyla AYNI desen).
 *
 * ⚠️ **`is_admin` BİLEREK YAZILMAZ ve yazılmamalıdır.** `Player.isAdmin`
 * taşır ama bu `UPDATE` onu `SET` etmez. Sebep: bu fonksiyonun çağıranları
 * "parayı/tesisi güncelle" derdindedir ve ellerindeki `Player` nesnesi
 * okuma anındaki BAYAT `is_admin` değerini taşır. `SET` listesine eklenmesi,
 * birbirinden habersiz iki yolun (rol verme + para harcama) yarıştığı anda
 * yönetici rolünü sessizce SİLEN bir kod üretirdi — ve bu hiçbir yerde hata
 * üretmezdi. Rol bugün yalnızca elle SQL ile verilir (§13.17); yazma yolu
 * açıldığında `admin_audit_log` satırıyla AYNI transaction'da, AYRI ve
 * AÇIK bir fonksiyon olmalıdır.
 */
export async function writePlayerRow(client: PoolClient, updated: Player): Promise<void> {
  await client.query(
    `UPDATE players
     SET display_name = $2, avatar_id = $3, level = $4, xp = $5,
         money = $6, gems = $7, reputation = $8, stable_level = $9,
         last_daily_reward_claimed_at = $10, rating = $11, updated_at = $12
     WHERE id = $1`,
    [
      updated.id,
      updated.displayName,
      updated.avatarId,
      updated.level,
      updated.xp,
      updated.money,
      updated.gems,
      updated.reputation,
      updated.stableLevel,
      updated.lastDailyRewardClaimedAt ? new Date(updated.lastDailyRewardClaimedAt) : null,
      updated.rating,
      new Date(updated.updatedAt),
    ],
  );
}

/**
 * AUDIT_AND_HARDENING Öncelik 2 (bu oturum) — para hareketi üreten HER
 * çağrının yazdığı `economy_transactions` satırları, bakiye değişikliğini
 * yazan `UPDATE` ile AYNI transaction'ın (AYNI `client`) içinde eklenir —
 * biri başarısız olursa (ör. bir sonraki `client.query` bir hata fırlatırsa)
 * `withTransaction` İKİSİNİ DE ROLLBACK eder, defter asla gerçek bakiye
 * değişikliğinden BAĞIMSIZ bir duruma düşemez. `entries` boş/`undefined` ise
 * (para hareketi üretmeyen bir `mutate`) hiçbir şey yazılmaz.
 */
export async function writeLedgerEntries(client: PoolClient, entries: EconomyLedgerEntryInput[] | undefined): Promise<void> {
  if (!entries || entries.length === 0) {
    return;
  }
  for (const entry of entries) {
    // `id` ÇAĞIRANDAN gelebilir (bkz. `EconomyLedgerEntryInput.id` doc
    // yorumu — brief §22'nin istediği "Transaction ID"nin yanıtta
    // dönebilmesi için); gelmezse `gen_random_uuid()` üretir, yani
    // eski çağrıların davranışı DEĞİŞMEZ. `COALESCE` bu iki yolu tek
    // INSERT'te birleştirir — ayrı bir "id var mı" dalı yoktur.
    await client.query(
      `INSERT INTO economy_transactions
         (id, player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after, idempotency_key)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.id ?? null,
        entry.playerId,
        entry.type,
        entry.amount,
        entry.currency,
        entry.referenceType,
        entry.referenceId,
        entry.balanceBefore,
        entry.balanceAfter,
        entry.idempotencyKey,
      ],
    );
  }
}
