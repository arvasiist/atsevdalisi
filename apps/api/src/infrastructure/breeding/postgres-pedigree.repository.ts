import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { HorsePedigreeView, Pedigree } from '@at-sevdalisi/shared-types';
import type { PedigreeRepository } from '../../application/ports/pedigree.repository';
import { PG_POOL } from '../database/database.module';

/**
 * Soy ağacı OKUMA yolu — `horses` + `pedigrees` (migration 0008) tek
 * sorguda birleştirilir.
 *
 * **İKİ KAYNAK SORUNU (bilinçli tasarım kararı, brief §29 "duplicate
 * implementation oluşturma"):** şemada ebeveyn bilgisi İKİ yerde durur:
 *   - `horses.sire_id`/`dam_id` (migration 0002) — at oluşturulurken yazılan
 *     DÜZ ebeveyn bağlantısı; `Horse` tipinde karşılığı vardır,
 *   - `pedigrees` (migration 0008) — 2 nesil + kan hattı tutan ZENGİN kayıt;
 *     `Pedigree` tipiyle 1:1 eşleşir ve `domain/breeding/pedigree.ts`
 *     `createFoalPedigree`'nin ÜRETTİĞİ şeydir.
 *
 * Bu repository `pedigrees`'i **ÖNCELİKLİ** kabul eder (zengin olan ve
 * `PedigreeTree`'nin beklediği şekil), `pedigrees` satırı YOKKEN
 * `horses.sire_id`/`dam_id`'ye düşer. Böylece hiçbir veri kaynağı
 * yok sayılmaz ve hiçbir şey UYDURULMAZ: düşülen yolda büyükebeveyn
 * alanları şemada O SATIRDA olmadığı için `null` kalır (bkz.
 * `packages/shared-types/src/breeding.ts` — `Pedigree`'nin asimetrik
 * 2-nesil şekli).
 */
@Injectable()
export class PostgresPedigreeRepository implements PedigreeRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByHorseId(horseId: string): Promise<HorsePedigreeView | null> {
    // `horses`'tan başlanır (LEFT JOIN) — böylece "at yok" ile "at var ama
    // soy kaydı yok" tek sorguda ayırt edilir: ilkinde HİÇ satır dönmez,
    // ikincisinde `pedigree_horse_id` NULL olan bir satır döner.
    const result = await this.pool.query<HorseWithPedigreeRow>(
      `SELECT
         p.horse_id       AS pedigree_horse_id,
         p.sire_id        AS pedigree_sire_id,
         p.dam_id         AS pedigree_dam_id,
         p.grand_sire_id  AS pedigree_grand_sire_id,
         p.grand_dam_id   AS pedigree_grand_dam_id,
         p.bloodline      AS pedigree_bloodline,
         h.sire_id        AS horse_sire_id,
         h.dam_id         AS horse_dam_id
       FROM horses h
       LEFT JOIN pedigrees p ON p.horse_id = h.id
       WHERE h.id = $1`,
      [horseId],
    );

    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }

    const pedigree = row.pedigree_horse_id === null ? this.fromHorseColumns(horseId, row) : this.fromPedigreeRow(horseId, row);
    const horseNamesById = await this.findNamesByIds(collectReferencedIds(pedigree));
    return { pedigree, horseNamesById };
  }

  /** `pedigrees` satırı VAR — zengin kaynak kullanılır. */
  private fromPedigreeRow(horseId: string, row: HorseWithPedigreeRow): Pedigree {
    return {
      horseId,
      sireId: row.pedigree_sire_id,
      damId: row.pedigree_dam_id,
      grandSireId: row.pedigree_grand_sire_id,
      grandDamId: row.pedigree_grand_dam_id,
      bloodline: row.pedigree_bloodline,
    };
  }

  /** `pedigrees` satırı YOK — yalnızca düz ebeveyn bağlantısına düşülür. */
  private fromHorseColumns(horseId: string, row: HorseWithPedigreeRow): Pedigree {
    return {
      horseId,
      sireId: row.horse_sire_id,
      damId: row.horse_dam_id,
      grandSireId: null,
      grandDamId: null,
      bloodline: null,
    };
  }

  /**
   * Verilen ID'ler için at ADLARINI okur. Bulunamayan ID sonuca GİRMEZ
   * (uydurma ad yok — `pedigree-tree.ts` eksik olanı ham ID olarak gösterir).
   *
   * `$1::uuid[]` cast'i AÇIKÇA yazılır: `node-postgres` parametreleri
   * `unknown` olarak gönderir ve `ANY($1)` içinde tip çıkarımı yapılamaz —
   * bu projede daha önce `$2 * interval '1 hour'` ile AYNI sınıfta bir
   * hata yaşandı (bkz. `postgres-gift.repository.ts`). Cast ayrıca bu
   * kalıbın projedeki YERLEŞİK halidir (`postgres-race.repository.ts`
   * `WHERE race_entry_id = ANY($1::uuid[])`).
   */
  private async findNamesByIds(ids: readonly string[]): Promise<Record<string, string>> {
    if (ids.length === 0) {
      return {};
    }
    const result = await this.pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM horses WHERE id = ANY($1::uuid[])',
      [ids],
    );
    const names: Record<string, string> = {};
    for (const row of result.rows) {
      names[row.id] = row.name;
    }
    return names;
  }
}

/** `pedigrees` satırı + `horses`'ın düz ebeveyn sütunları (snake_case). */
interface HorseWithPedigreeRow {
  pedigree_horse_id: string | null;
  pedigree_sire_id: string | null;
  pedigree_dam_id: string | null;
  pedigree_grand_sire_id: string | null;
  pedigree_grand_dam_id: string | null;
  pedigree_bloodline: string | null;
  horse_sire_id: string | null;
  horse_dam_id: string | null;
}

/**
 * Soy ağacında GÖSTERİLECEK tüm at ID'leri (kendisi + bilinen atalar),
 * tekrarsız. `PedigreeTree` "Bu At" düğümünü de adıyla gösterdiği için
 * `horseId` de dahildir.
 */
function collectReferencedIds(pedigree: Pedigree): string[] {
  const ids = new Set<string>([pedigree.horseId]);
  for (const ancestorId of [pedigree.sireId, pedigree.damId, pedigree.grandSireId, pedigree.grandDamId]) {
    if (ancestorId !== null) {
      ids.add(ancestorId);
    }
  }
  return [...ids];
}
