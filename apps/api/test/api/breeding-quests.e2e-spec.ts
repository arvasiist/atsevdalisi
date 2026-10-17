import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bootstrapBreedingApp, insertBreedingHorse, moneyOf, type BreedingKit } from './breeding-test-kit';
import { registerTestPlayer } from './test-helpers';

/**
 * ÇİFTLEŞTİRME + TAY GÖREVLERİ (16.10.2026, brief §18, migration 0099).
 * Kanıtlananlar: GERÇEK döllenme haftalık `breedings` görevini ilerletir ve
 * ödülü bir kez (defter satırıyla) alınır; GERÇEK doğum (zamanlayıcı) yaşam
 * boyu `foals_born` başarımını açar. Sayaç yok — gebelik satırlarından.
 */
describe('Çiftleştirme ve tay görevleri (e2e)', () => {
  let kit: BreedingKit;

  beforeAll(async () => {
    kit = await bootstrapBreedingApp();
  });

  afterAll(async () => {
    await kit.app.close();
  });

  it('döllenme haftalık görevi, doğum ilk-tay başarımını açar; ödüller tek sefer', async () => {
    const player = await registerTestPlayer(kit.app, 'Görevli Yetiştirici');
    await kit.pool.query('UPDATE players SET stable_level = 3 WHERE id = $1', [player.playerId]);
    const mareId = await insertBreedingHorse(kit.pool, player.playerId, 'Görev Kısrağı', 'mare');
    const stallionId = await insertBreedingHorse(kit.pool, player.playerId, 'Görev Aygırı', 'stallion');
    const quests = async () =>
      (await request(kit.app.getHttpServer()).get('/api/v1/quests').set('Authorization', player.authHeader).expect(200)).body
        .data;
    const breedQuest = async () =>
      (await quests()).weekly.quests.find((quest: { key: string }) => quest.key === 'weekly-breed-1');
    expect((await breedQuest()).progress).toBe(0);

    // Tutmayan deneme görevi ilerletmez (ücret + bekleme zaten bedeli).
    const failedMareId = await insertBreedingHorse(kit.pool, player.playerId, 'Görev Kısrağı İki', 'mare');
    kit.random.push(0.999_999);
    const failed = await api(kit, player)
      .post(`/players/${player.playerId}/breeding`, { mareId: failedMareId, stallionId, foalName: 'Olmayan Tay' }, randomUUID())
      .expect(201);
    expect(failed.body.data.outcome).toBe('not_conceived');
    expect((await breedQuest()).progress).toBe(0);

    kit.random.push(0); // zar tutar
    const attempt = await api(kit, player)
      .post(`/players/${player.playerId}/breeding`, { mareId, stallionId, foalName: 'Görev Tayı' }, randomUUID())
      .expect(201);
    expect((await breedQuest()).progress).toBe(1);

    const before = await moneyOf(kit.pool, player.playerId);
    const claimed = await api(kit, player).post('/quests/weekly-breed-1/claim', {}, null).expect(200);
    expect(await moneyOf(kit.pool, player.playerId)).toBe(before + claimed.body.data.rewardMoney);
    expect((await api(kit, player).post('/quests/weekly-breed-1/claim', {}, null)).status).toBe(409);

    // İlk tay başarımı doğumdan önce alınamaz.
    expect((await api(kit, player).post('/achievements/first-foal/claim', {}, null)).status).toBe(409);
    const pregnancyId = attempt.body.data.pregnancy.pregnancyId as string;
    await kit.pool.query(
      "UPDATE pregnancies SET expected_birth_at = now() - interval '1 minute', conceived_at = now() - interval '2 minutes' WHERE id = $1",
      [pregnancyId],
    );
    await kit.scheduler.tickNow(new Date());
    const born = await kit.pool.query<{ status: string }>('SELECT status FROM pregnancies WHERE id = $1', [pregnancyId]);
    expect(born.rows[0]!.status).toBe('born');

    const achievement = (
      await request(kit.app.getHttpServer()).get('/api/v1/achievements').set('Authorization', player.authHeader).expect(200)
    ).body.data.achievements.find((a: { key: string }) => a.key === 'first-foal');
    expect(achievement.progress).toBe(1);
    await api(kit, player).post('/achievements/first-foal/claim', {}, null).expect(200);
    expect((await api(kit, player).post('/achievements/first-foal/claim', {}, null)).status).toBe(409);
    const ledger = await kit.pool.query(
      "SELECT type FROM economy_transactions WHERE player_id = $1 AND type IN ('quest_reward', 'achievement_reward')",
      [player.playerId],
    );
    expect(ledger.rows.map((row) => row.type).sort()).toEqual(['achievement_reward', 'quest_reward']);
  });
});
