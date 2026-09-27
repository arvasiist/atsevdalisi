import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * SOY AĞACI OKUMA YOLU — `GET /horses/:id/pedigree` (bu dilimde EKLENDİ).
 *
 * **BU DOSYANIN ASIL KANITLADIĞI ŞEYLER:**
 *   (1) ŞEMANIN ASİMETRİK ŞEKLİ: yalnızca `grandSireId` (baba hattı
 *       büyükbaba) ve `grandDamId` (anne hattı büyükanne) vardır — diğer
 *       iki büyükebeveyn slotu ŞEMADA YOKTUR, bu yüzden yanıtta da YOKTUR
 *       (uydurulmuş bir alan eklenmez),
 *   (2) İKİ KAYNAK ÖNCELİĞİ: `pedigrees` satırı varsa O kazanır; yoksa
 *       `horses.sire_id`/`dam_id`'ye düşülür ve büyükebeveyn alanları
 *       `null` kalır (bkz. `postgres-pedigree.repository.ts` doc yorumu),
 *   (3) "AT YOK" ≠ "SOY KAYDI YOK": ilki 404, ikincisi 200 + boş ağaç,
 *   (4) UYDURMA AD YOK: adı bulunamayan bir ata için ham ID gösterilir —
 *       bu yüzden `horseNamesById` yalnızca GERÇEKTEN var olan atları taşır.
 *
 * Gerçek PostgreSQL gerektirir (diğer e2e dosyalarıyla AYNI kısıt).
 */
describe('Soy ağacı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const pedigreeUrl = (horseId: string) => `/api/v1/horses/${horseId}/pedigree`;

  /**
   * Soy ağacında görünecek bir ATA atı yaratır. **Bu bir test kısayoludur,
   * üretim yolu DEĞİLDİR** — üretimde at yalnızca `RegisterPlayerUseCase`
   * (başlangıç atı) veya çiftleştirme akışıyla doğar. Burada doğrudan
   * INSERT edilir çünkü testin konusu atın NASIL doğduğu değil, soy
   * ağacının NASIL OKUNDUĞUDUR.
   */
  async function insertAncestorHorse(ownerId: string, name: string): Promise<string> {
    const horseId = randomUUID();
    await pool.query(
      `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, quality, potential)
       VALUES ($1, $2, $3, 'stallion', 'Arap', '2018-01-01', 70, 75)`,
      [horseId, ownerId, name],
    );
    return horseId;
  }

  /** `pedigrees` satırı yazar (zengin kaynak). */
  async function insertPedigreeRow(
    horseId: string,
    ancestors: { sireId: string | null; damId: string | null; grandSireId: string | null; grandDamId: string | null },
    bloodline: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO pedigrees (horse_id, sire_id, dam_id, grand_sire_id, grand_dam_id, bloodline)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [horseId, ancestors.sireId, ancestors.damId, ancestors.grandSireId, ancestors.grandDamId, bloodline],
    );
  }

  async function fetchPedigree(horseId: string): Promise<request.Response> {
    return request(app.getHttpServer()).get(pedigreeUrl(horseId)).expect(200);
  }

  describe('mutlu yol', () => {
    it('pedigrees satırı VARSA: 2 nesil + kan hattı döner ve TÜM ataların adı çözülür', async () => {
      const player: RegisteredTestPlayer & { horseId: string } = await registerTestPlayerWithStarterHorse(app, 'Soylu Yetiştirici');

      const grandSireId = await insertAncestorHorse(player.playerId, 'Dede Aygır');
      const grandDamId = await insertAncestorHorse(player.playerId, 'Nine Kısrak');
      const sireId = await insertAncestorHorse(player.playerId, 'Baba Aygır');
      const damId = await insertAncestorHorse(player.playerId, 'Anne Kısrak');
      await insertPedigreeRow(player.horseId, { sireId, damId, grandSireId, grandDamId }, 'Safkan Arap');

      const response = await fetchPedigree(player.horseId);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pedigree).toEqual({
        horseId: player.horseId,
        sireId,
        damId,
        grandSireId,
        grandDamId,
        bloodline: 'Safkan Arap',
      });
      expect(response.body.data.horseNamesById).toEqual({
        [player.horseId]: expect.any(String),
        [sireId]: 'Baba Aygır',
        [damId]: 'Anne Kısrak',
        [grandSireId]: 'Dede Aygır',
        [grandDamId]: 'Nine Kısrak',
      });
    });

    it('kimlik doğrulaması GEREKTİRMEZ (@Public — Pazar akışı başka oyuncunun atına bakabilmeli)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Herkese Açık Soy');
      // `.set('Authorization', ...)` BİLEREK çağrılmaz.
      const response = await request(app.getHttpServer()).get(pedigreeUrl(player.horseId)).expect(200);
      expect(response.body.data.pedigree.horseId).toBe(player.horseId);
    });
  });

  describe('soy kaydı olmayan atlar', () => {
    it('başlangıç atının soy kaydı YOKTUR: 404 DEĞİL, tüm ataları null olan bir ağaç döner', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Soyu Olmayan');

      const response = await fetchPedigree(player.horseId);

      expect(response.body.data.pedigree).toEqual({
        horseId: player.horseId,
        sireId: null,
        damId: null,
        grandSireId: null,
        grandDamId: null,
        bloodline: null,
      });
      // Yalnızca atın KENDİSİ — hiçbir ata ID'si uydurulmaz.
      expect(Object.keys(response.body.data.horseNamesById)).toEqual([player.horseId]);
    });

    it('pedigrees satırı YOKKEN horses.sire_id/dam_id DOLUYSA onlara düşülür (büyükebeveynler null kalır)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Düz Ebeveynli');
      const sireId = await insertAncestorHorse(player.playerId, 'Düz Baba');
      const damId = await insertAncestorHorse(player.playerId, 'Düz Anne');

      // Yalnızca `horses` sütunları yazılır — `pedigrees` satırı BİLEREK yok.
      await pool.query('UPDATE horses SET sire_id = $2, dam_id = $3 WHERE id = $1', [player.horseId, sireId, damId]);

      const response = await fetchPedigree(player.horseId);

      expect(response.body.data.pedigree).toEqual({
        horseId: player.horseId,
        sireId,
        damId,
        grandSireId: null,
        grandDamId: null,
        bloodline: null,
      });
      expect(response.body.data.horseNamesById[sireId]).toBe('Düz Baba');
      expect(response.body.data.horseNamesById[damId]).toBe('Düz Anne');
    });

    it('pedigrees satırı VARSA horses.sire_id/dam_id YOK SAYILIR (zengin kaynak önceliklidir)', async () => {
      const player = await registerTestPlayerWithStarterHorse(app, 'Çelişkili Kayıt');
      const columnSireId = await insertAncestorHorse(player.playerId, 'Sütundaki Baba');
      const columnDamId = await insertAncestorHorse(player.playerId, 'Sütundaki Anne');
      const pedigreeSireId = await insertAncestorHorse(player.playerId, 'Kayıttaki Baba');
      const pedigreeDamId = await insertAncestorHorse(player.playerId, 'Kayıttaki Anne');

      await pool.query('UPDATE horses SET sire_id = $2, dam_id = $3 WHERE id = $1', [player.horseId, columnSireId, columnDamId]);
      await insertPedigreeRow(player.horseId, { sireId: pedigreeSireId, damId: pedigreeDamId, grandSireId: null, grandDamId: null }, null);

      const response = await fetchPedigree(player.horseId);

      expect(response.body.data.pedigree.sireId).toBe(pedigreeSireId);
      expect(response.body.data.pedigree.damId).toBe(pedigreeDamId);
      // Çelişen sütunların atları ad haritasına HİÇ girmez (ağaçta görünmezler).
      expect(response.body.data.horseNamesById[columnSireId]).toBeUndefined();
      expect(response.body.data.horseNamesById[columnDamId]).toBeUndefined();
    });
  });

  describe('hata durumları', () => {
    it('var olmayan at: 404 HORSE_NOT_FOUND', async () => {
      const response = await request(app.getHttpServer()).get(pedigreeUrl(randomUUID())).expect(404);
      expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
    });

    it('UUID olmayan id: 400 (ParseUUIDPipe)', async () => {
      await request(app.getHttpServer()).get(pedigreeUrl('gecerli-degil')).expect(400);
    });
  });
});
