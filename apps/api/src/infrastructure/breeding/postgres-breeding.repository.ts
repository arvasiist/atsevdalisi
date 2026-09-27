import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { BreedingResultView, Horse, Pedigree } from '@at-sevdalisi/shared-types';
import type { BreedingRepository, ExecuteBreedingInput } from '../../application/ports/breeding.repository';
import { breedHorses, calculateStudFee, type BreedingCandidate } from '../../domain/breeding/breeding';
import { BreedingHorseListedError, MareNotOwnedError } from '../../domain/breeding/errors';
import { HorseNotFoundError } from '../../domain/horse/errors';
import { calculateAgeInMonths } from '../../domain/horse/age-curve';
import { transfer } from '../../domain/economy/wallet';
import { PlayerNotFoundError } from '../../domain/player/errors';
import { assertCanAddHorseToStable, getStableCapacity } from '../../domain/stable/stable';
import { AppConfigService } from '../config/config.service';
import { PG_POOL, withTransaction } from '../database/database.module';
import { writeLedgerEntries } from '../player/player-row';

/**
 * `horse_stats`'tan KALITILAN sütunlar. `stride_length`/`stride_frequency`
 * BİLİNÇLİ OLARAK DIŞARIDA: DEFAULT'suz ve `NULL` olabilen sütunlardır
 * (migration 0003), `calculateChildStat` ise 0-100 ölçekli bir sayı bekler.
 * Sıra sabittir ve hem okuma hem yazma sorgusunda AYNI dizi kullanılır.
 */
const INHERITED_STAT_COLUMNS = [
  'speed',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'balance',
  'start_speed',
  'early_speed',
  'mid_speed',
  'finish_speed',
  'sprint',
  'endurance',
  'cornering',
  'positioning',
  'temperament',
  'focus',
  'courage',
  'competitiveness',
  'stress_resistance',
  'obedience',
] as const;

/** `horses` satırının bu dosyanın ihtiyaç duyduğu sütunları (+ pazarda aktif ilan var mı). */
interface BreedableHorseRow {
  id: string;
  owner_id: string;
  name: string;
  gender: string;
  breed: string;
  birth_date: Date;
  quality: string;
  potential: string;
  health: string;
  weight_kg: string | null;
  status: string;
  is_listed: boolean;
}

/** `pedigrees` satırı (yoksa `null` sütunlarla döner). */
interface PedigreeRow {
  sire_id: string | null;
  dam_id: string | null;
  grand_sire_id: string | null;
  grand_dam_id: string | null;
  bloodline: string | null;
}

interface PlayerRow {
  id: string;
  money: string;
  gems: string;
  stable_level: number;
}

function rowToCandidate(row: BreedableHorseRow, stats: Record<string, number>, now: Date): BreedingCandidate {
  return {
    id: row.id,
    gender: row.gender as BreedingCandidate['gender'],
    status: row.status as BreedingCandidate['status'],
    ageMonths: calculateAgeInMonths(row.birth_date, now),
    health: Number(row.health),
    quality: Number(row.quality),
    potential: Number(row.potential),
    stats,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
  };
}

/**
 * Çiftleştirme YAZMA yolu — soy ağacı veri zincirinin ÜÇÜNCÜ parçası.
 * **BU SINIF BİR PARA YOLUDUR** (bkz. `BreedingRepository` port doc
 * yorumu: kilit sırası, transaction sahipliği ve domain kararının neden
 * transaction İÇİNDE verildiği orada gerekçelendirilmiştir).
 *
 * `PostgresMarketPurchaseRepository`/`PostgresGiftRepository` ile AYNI
 * iki-satırlı şablon; farkı: burada kilitlenen ve YAZILAN tablo sayısı
 * daha fazladır (iki at + tay + soy + istatistik + sağlık + çift kaydı).
 */
@Injectable()
export class PostgresBreedingRepository implements BreedingRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async breed(input: ExecuteBreedingInput): Promise<BreedingResultView> {
    // `noUncheckedIndexedAccess` altında dizi indekslemeden kaçınmak için
    // `updateTwoWithLock`/`executePurchase` ile AYNI doğrudan karşılaştırma.
    const firstHorseId = input.mareId <= input.stallionId ? input.mareId : input.stallionId;
    const secondHorseId = input.mareId <= input.stallionId ? input.stallionId : input.mareId;

    return withTransaction(this.pool, async (client) => {
      const horsesById = new Map<string, BreedableHorseRow>();
      for (const horseId of [firstHorseId, secondHorseId]) {
        const result = await client.query<BreedableHorseRow>(
          `SELECT h.id, h.owner_id, h.name, h.gender, h.breed, h.birth_date, h.quality, h.potential,
                  h.health, h.weight_kg, h.status,
                  EXISTS (
                    SELECT 1 FROM market_listings ml
                    WHERE ml.horse_id = h.id AND ml.status = 'active'
                  ) AS is_listed
           FROM horses h
           WHERE h.id = $1
           FOR UPDATE OF h`,
          [horseId],
        );
        const row = result.rows[0];
        if (row) {
          horsesById.set(horseId, row);
        }
      }

      const mareRow = horsesById.get(input.mareId);
      if (!mareRow) {
        throw new HorseNotFoundError(input.mareId);
      }
      const stallionRow = horsesById.get(input.stallionId);
      if (!stallionRow) {
        throw new HorseNotFoundError(input.stallionId);
      }

      // SAHİPLİK — satır KİLİTLİYKEN. Kısrak çağıranın olmalı (tay onun
      // ahırına doğar, ücreti o öder); aygır başkasının olabilir.
      if (mareRow.owner_id !== input.playerId) {
        throw new MareNotOwnedError(input.mareId);
      }
      // Pazarda aktif ilanı olan bir at çiftleştirilemez — aksi halde
      // satıştan hemen önce yapılan bir çiftleştirme, alıcıya sürpriz bir
      // tay ve soy kaydı devrederdi (`HorseListedInMarketError` ile AYNI
      // gerekçe, antrenman/yarış yollarında zaten uygulanıyor).
      if (mareRow.is_listed) {
        throw new BreedingHorseListedError(input.mareId);
      }
      if (stallionRow.is_listed) {
        throw new BreedingHorseListedError(input.stallionId);
      }

      const now = input.now;

      // KISRAK COOLDOWN'I — son DOĞUM (`foal_id IS NOT NULL`) tarihinden
      // ölçülür. Tay bu projede ANINDA doğduğu için gebelik süresi
      // modellenmez; `breedingCooldownDays` iki çiftleştirme arası bekleme
      // süresidir (bkz. `assertBreedingEligibility`).
      const lastFoaledResult = await client.query<{ last_foaled_at: Date | null }>(
        `SELECT MAX(created_at) AS last_foaled_at FROM breeding_pairs
         WHERE mare_id = $1 AND foal_id IS NOT NULL`,
        [input.mareId],
      );
      const mareLastFoaledAt = lastFoaledResult.rows[0]?.last_foaled_at ?? null;

      // SOY — domain'in inbreeding kontrolü ve tayın pedigrisi için.
      const pedigreeByHorseId = new Map<string, Pedigree | null>();
      for (const horseId of [input.mareId, input.stallionId]) {
        const result = await client.query<PedigreeRow>(
          'SELECT sire_id, dam_id, grand_sire_id, grand_dam_id, bloodline FROM pedigrees WHERE horse_id = $1',
          [horseId],
        );
        const row = result.rows[0];
        pedigreeByHorseId.set(
          horseId,
          row
            ? {
                horseId,
                sireId: row.sire_id,
                damId: row.dam_id,
                grandSireId: row.grand_sire_id,
                grandDamId: row.grand_dam_id,
                bloodline: row.bloodline,
              }
            : null,
        );
      }

      // KALITILAN STATLAR — iki ebeveyn için AYNI anahtar kümesi
      // (`breedHorses` her ortak anahtar için ayrı bir çekiliş yapar).
      const mareStats = await this.readStats(client, input.mareId);
      const stallionStats = await this.readStats(client, input.stallionId);

      const mare = rowToCandidate(mareRow, mareStats, now);
      const stallion = rowToCandidate(stallionRow, stallionStats, now);

      // OYUNCULAR — horses'tan SONRA (global sıra: horses → players).
      const stallionOwnerId = stallionRow.owner_id;
      const firstPlayerId = input.playerId <= stallionOwnerId ? input.playerId : stallionOwnerId;
      const secondPlayerId = input.playerId <= stallionOwnerId ? stallionOwnerId : input.playerId;

      const playersById = new Map<string, PlayerRow>();
      for (const playerId of [firstPlayerId, secondPlayerId]) {
        const result = await client.query<PlayerRow>(
          'SELECT id, money, gems, stable_level FROM players WHERE id = $1 FOR UPDATE',
          [playerId],
        );
        const row = result.rows[0];
        if (row) {
          playersById.set(playerId, row);
        }
      }

      const payerRow = playersById.get(input.playerId);
      if (!payerRow) {
        throw new PlayerNotFoundError(input.playerId);
      }
      const stallionOwnerRow = playersById.get(stallionOwnerId);
      if (!stallionOwnerRow) {
        throw new PlayerNotFoundError(stallionOwnerId);
      }

      // AHIR KAPASİTESİ — tay KISRAK SAHİBİNİN ahırına doğar. Ödeyenin
      // `players` satırı yukarıda ZATEN kilitli olduğundan, aynı oyuncunun
      // eşzamanlı iki çiftleştirmesi bu kilit üzerinden SERİLEŞİR; sayım bu
      // yüzden güvenle tutarlıdır (`executePurchase`'ın "alıcının ahır
      // sayımı" notuyla AYNI gerekçe).
      const horseCountResult = await client.query<{ count: string }>(
        'SELECT COUNT(*) FROM horses WHERE owner_id = $1',
        [input.playerId],
      );
      const horseCount = Number(horseCountResult.rows[0]?.count ?? '0');
      assertCanAddHorseToStable(horseCount, getStableCapacity(payerRow.stable_level, this.config.stable));

      // ÜCRET — yalnızca AYGIR BAŞKASININSA. Kendi atlarını çiftleştiren
      // oyuncu kendine ödeme yapmaz (bkz. `BreedingResultView.fee` doc
      // yorumu); bu durumda `breeding_pairs.fee` de 0 kalır.
      const sameOwner = stallionOwnerId === input.playerId;
      const fee = sameOwner ? 0 : calculateStudFee(stallion, this.config.genetics);

      const payerBalance = { money: Number(payerRow.money), gems: Number(payerRow.gems) };
      const stallionOwnerBalance = { money: Number(stallionOwnerRow.money), gems: Number(stallionOwnerRow.gems) };
      const moved =
        fee > 0 ? transfer(payerBalance, stallionOwnerBalance, fee, 'money') : { from: payerBalance, to: stallionOwnerBalance };

      // DOMAIN — satırlar HÂLÂ kilitliyken, EN GÜNCEL değerlerle.
      // `NotEligibleForBreedingError` (yaş/cinsiyet/durum/cooldown) burada
      // fırlar ve `withTransaction` ROLLBACK yapar.
      const result = breedHorses(
        {
          foalId: input.foalId,
          mare,
          stallion,
          marePedigree: pedigreeByHorseId.get(input.mareId) ?? null,
          stallionPedigree: pedigreeByHorseId.get(input.stallionId) ?? null,
          mareLastFoaledAt,
          now,
          // SEED = pairId (bkz. `ExecuteBreedingInput` doc yorumu): kayıt
          // satırı elde olduğu sürece tayın statları yeniden üretilebilir.
          seed: input.pairId,
        },
        this.config.genetics,
        this.config.horseGrowth,
      );

      // ---- YAZMA ----
      if (fee > 0) {
        await client.query('UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1', [
          input.playerId,
          moved.from.money,
          moved.from.gems,
          now,
        ]);
        await client.query('UPDATE players SET money = $2, gems = $3, updated_at = $4 WHERE id = $1', [
          stallionOwnerId,
          moved.to.money,
          moved.to.gems,
          now,
        ]);
      }

      const foal = this.buildFoal(input, result, mareRow.breed, now);
      await client.query(
        `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, level, xp, quality, potential,
                             health, fitness, fatigue, energy, morale, weight_kg, status, sire_id, dam_id,
                             created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          foal.id,
          foal.ownerId,
          foal.name,
          foal.gender,
          foal.breed,
          foal.birthDate.slice(0, 10),
          foal.level,
          foal.xp,
          foal.quality,
          foal.potential,
          foal.health,
          foal.fitness,
          foal.fatigue,
          foal.energy,
          foal.morale,
          foal.weightKg,
          foal.status,
          foal.sireId,
          foal.damId,
          new Date(foal.createdAt),
          new Date(foal.updatedAt),
        ],
      );

      const statColumns = INHERITED_STAT_COLUMNS.join(', ');
      const statPlaceholders = INHERITED_STAT_COLUMNS.map((_, index) => `$${index + 2}`).join(', ');
      await client.query(
        `INSERT INTO horse_stats (horse_id, ${statColumns}) VALUES ($1, ${statPlaceholders})`,
        [foal.id, ...INHERITED_STAT_COLUMNS.map((column) => result.foalStats[column] ?? 50)],
      );
      // DOĞUM SAĞLIK RİSKİ burada gerçek bir sütuna yazılır: domain'in
      // hesapladığı `birthHealthRisk` [0,1], `horse_health.injury_risk`
      // [0,100] ölçeğine çevrilir. Aksi halde hesaplanan ama hiçbir yere
      // yazılmayan bir değer olurdu.
      await client.query('INSERT INTO horse_health (horse_id, injury_risk) VALUES ($1, $2)', [
        foal.id,
        Math.round(result.birthHealthRisk * 100 * 100) / 100,
      ]);
      await client.query('INSERT INTO horse_surface_stats (horse_id) VALUES ($1)', [foal.id]);
      await client.query('INSERT INTO horse_distance_stats (horse_id) VALUES ($1)', [foal.id]);

      await client.query(
        `INSERT INTO pedigrees (horse_id, sire_id, dam_id, grand_sire_id, grand_dam_id, bloodline)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          result.foalPedigree.horseId,
          result.foalPedigree.sireId,
          result.foalPedigree.damId,
          result.foalPedigree.grandSireId,
          result.foalPedigree.grandDamId,
          result.foalPedigree.bloodline,
        ],
      );

      const pairResult = await client.query<{ id: string }>(
        `INSERT INTO breeding_pairs (id, mare_id, stallion_id, prediction, fee, foal_id, created_at)
         VALUES ($1, $2, $3, NULL, $4, $5, $6)
         RETURNING id`,
        [input.pairId, input.mareId, input.stallionId, fee, input.foalId, now],
      );
      if (!pairResult.rows[0]) {
        // `INSERT ... RETURNING` her zaman bir satır döner — buraya düşmek
        // şema/bağlantı seviyesinde beklenmedik bir durumdur. Sessizce devam
        // etmek, defter satırlarını `reference_id` olmadan yazardı
        // (`postgres-grandstand.repository.ts` ile AYNI not).
        throw new Error(`Çiftleştirme kaydı yazılamadı (kısrak: ${input.mareId}, aygır: ${input.stallionId}).`);
      }

      // DEFTER — AYNI transaction'da İKİ satır. Damızlık ücreti bir
      // TRANSFER'dir (SINK değil), bu yüzden iki satır ZORUNLUDUR: yalnızca
      // borç yazmak toplam arzın azaldığını iddia ederdi
      // (`PostgresGiftRepository` ile AYNI gerekçe).
      if (fee > 0) {
        await writeLedgerEntries(client, [
          {
            playerId: input.playerId,
            type: 'breeding_stud_fee_debit',
            amount: -fee,
            currency: 'money',
            referenceType: 'breeding_pair',
            referenceId: input.pairId,
            balanceBefore: payerBalance.money,
            balanceAfter: moved.from.money,
            idempotencyKey: input.idempotencyKey,
          },
          {
            playerId: stallionOwnerId,
            type: 'breeding_stud_fee_credit',
            amount: fee,
            currency: 'money',
            referenceType: 'breeding_pair',
            referenceId: input.pairId,
            balanceBefore: stallionOwnerBalance.money,
            balanceAfter: moved.to.money,
            idempotencyKey: input.idempotencyKey,
          },
        ]);
      }

      return {
        pairId: input.pairId,
        foalId: foal.id,
        foalName: foal.name,
        foalGender: input.foalGender,
        mareId: input.mareId,
        stallionId: input.stallionId,
        fee,
        inbreedingDetected: result.inbreedingDetected,
        birthHealthRisk: result.birthHealthRisk,
        payerBalance: fee > 0 ? moved.from : null,
      };
    });
  }

  /**
   * Tayın `horses` satırı. Başlangıç atıyla (`createStarterHorse`) AYNI
   * vital başlangıç değerleri kullanılır — tek fark, `birthDate`'in
   * "şimdi" olması (tay YENİ DOĞMUŞTUR, `getLifeStage` onu `foal` evresinde
   * görür ve bu yüzden henüz yarışamaz/antrenman yapamaz).
   */
  private buildFoal(
    input: ExecuteBreedingInput,
    result: { foalQuality: number; foalPotential: number; foalWeightKg: number; foalPedigree: Pedigree },
    breed: string,
    now: Date,
  ): Horse {
    return {
      id: input.foalId,
      ownerId: input.playerId,
      name: input.foalName.trim(),
      gender: input.foalGender,
      // Irk KISRAKTAN devralınır (gerçek atçılıkta tay, kısrağın kayıtlı
      // ırkıyla tescil edilir) — soy ağacı kan hattı da `createFoalPedigree`
      // içinde baba hattı öncelikli olarak ayrıca taşınır.
      breed,
      birthDate: now.toISOString(),
      level: 1,
      xp: 0,
      quality: result.foalQuality,
      potential: result.foalPotential,
      health: 100,
      fitness: 50,
      fatigue: 0,
      energy: 100,
      morale: 80,
      weightKg: result.foalWeightKg,
      status: 'active',
      sireId: input.stallionId,
      damId: input.mareId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Bir atın kalıtılabilir statlarını `Record<snake_case sütun, sayı>`
   * olarak okur. Anahtarlar DB sütun adlarıdır (camelCase'e ÇEVRİLMEZ):
   * aynı anahtar kümesi `breedHorses`'a girdi, `horse_stats` INSERT'ine de
   * sütun listesi olur — tek bir dönüşüm noktası kalır.
   */
  private async readStats(client: PoolClient, horseId: string): Promise<Record<string, number>> {
    const columns = INHERITED_STAT_COLUMNS.join(', ');
    const result = await client.query<Record<string, string>>(
      `SELECT ${columns} FROM horse_stats WHERE horse_id = $1`,
      [horseId],
    );
    const row = result.rows[0];
    if (!row) {
      // `horse_stats` satırı olmayan bir at `save()`/bu repository dışında
      // oluşturulamaz (bkz. `PostgresHorseRepository.save` doc yorumu) —
      // yine de savunma amaçlı: satır yoksa nüfus varsayılanı (50) kullanılır.
      return {};
    }
    const stats: Record<string, number> = {};
    for (const column of INHERITED_STAT_COLUMNS) {
      stats[column] = Number(row[column]);
    }
    return stats;
  }
}
