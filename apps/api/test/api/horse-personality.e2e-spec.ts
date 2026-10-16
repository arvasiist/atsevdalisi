import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHorsePersonalityConfig, loadTrainingConfig } from '@at-sevdalisi/game-config';
import {
  computePersonalityTrainingEffects,
  deriveBirthPersonality,
  describePersonality,
} from '../../src/domain/horse/personality';
import { calculateFatigueGain, calculateStatGain } from '../../src/domain/training/training';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * AT KİŞİLİĞİ (08.10.2026). Kanıtlananlar:
 *   (1) Yeni at gizli özellikleri at kimliğinden determinist alır
 *       (`deriveBirthPersonality`), `temperament` 50 kalır.
 *   (2) Sahibinin at listesi kişilik ETİKETİNİ taşır — DB'deki sayılardan
 *       türetilen etiketle birebir; ham değer yanıtta YOK. Herkese açık
 *       `GET /horses/:id` etiket taşımaz.
 *   (3) Antrenman: odak + rekabetçilik kazancı, stres dayanımı yorgunluğu
 *       domain formülüyle BİREBİR değiştirir.
 */
describe('At kişiliği (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const personality = loadHorsePersonalityConfig();
  const training = loadTrainingConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const readTraits = async (horseId: string) => {
    const row = (
      await pool.query<Record<string, string>>(
        'SELECT temperament, focus, courage, competitiveness, stress_resistance, obedience FROM horse_stats WHERE horse_id = $1',
        [horseId],
      )
    ).rows[0]!;
    return {
      temperament: Number(row.temperament),
      focus: Number(row.focus),
      courage: Number(row.courage),
      competitiveness: Number(row.competitiveness),
      stressResistance: Number(row.stress_resistance),
      obedience: Number(row.obedience),
    };
  };

  it('başlangıç atı kişiliğini kimliğinden alır; liste etiketi sayılardan türetilir, sayı sızmaz', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Huylu Sahip');
    const traits = await readTraits(player.horseId);
    expect(traits).toEqual({ temperament: personality.neutral, ...deriveBirthPersonality(player.horseId, personality) });

    const list = await http()
      .get(`/api/v1/horses?ownerId=${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const listed = list.body.data.find((horse: { id: string }) => horse.id === player.horseId);
    expect(listed.personality).toEqual(describePersonality(traits, personality));
    for (const key of ['temperament', 'focus', 'courage', 'competitiveness', 'stressResistance', 'obedience']) {
      expect(listed).not.toHaveProperty(key);
    }

    // Etiket SQL'deki değeri izler (ikinci doğruluk kaynağı yok).
    await pool.query('UPDATE horse_stats SET focus = 90, obedience = 10, courage = 50, competitiveness = 50, stress_resistance = 50 WHERE horse_id = $1', [
      player.horseId,
    ]);
    const relisted = await http()
      .get(`/api/v1/horses?ownerId=${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(relisted.body.data[0].personality.traits).toEqual([
      { trait: 'focus', pole: 'high' },
      { trait: 'obedience', pole: 'low' },
    ]);

    const publicView = await http().get(`/api/v1/horses/${player.horseId}`).expect(200);
    expect(publicView.body.data).not.toHaveProperty('personality');
  });

  it('antrenman kazancı ve yorgunluğu kişilik çarpanıyla domain formülüne birebir uyar', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Odaklı Sahip');
    const vitals = { health: 100, fitness: 0, fatigue: 0, energy: 100, morale: 0 };
    const reset = async (traits: { focus: number; competitiveness: number; stressResistance: number }) => {
      await pool.query(
        `UPDATE horse_stats SET speed = 50, focus = $2, competitiveness = $3, stress_resistance = $4, obedience = 50
          WHERE horse_id = $1`,
        [player.horseId, traits.focus, traits.competitiveness, traits.stressResistance],
      );
      // Sakatlık bu testin konusu değil; at her turda hazır hâle getirilir.
      await pool.query(
        "UPDATE horses SET potential = 90, health = 100, fatigue = 0, energy = 100, status = 'active' WHERE id = $1",
        [player.horseId],
      );
    };
    const train = async () =>
      (
        await http()
          .post(`/api/v1/horses/${player.horseId}/train`)
          .set('Authorization', player.authHeader)
          .send({ type: 'speed', intensity: 'high', durationMinutes: 30 })
          .expect(200)
      ).body.data;
    const ctx = {
      trainingType: 'speed' as const,
      intensity: 'high' as const,
      durationMinutes: 30,
      currentStatValue: 50,
      potential: 90,
      vitals,
    };

    await reset({ focus: 50, competitiveness: 50, stressResistance: 50 });
    const neutral = await train();
    expect(neutral.statChanges.speed).toBeCloseTo(calculateStatGain(training, ctx), 6);
    expect(neutral.fatigueGain).toBeCloseTo(calculateFatigueGain(training, ctx), 6);

    const strong = { focus: 80, competitiveness: 80, stressResistance: 80 };
    await reset(strong);
    const effects = computePersonalityTrainingEffects({ ...strong, obedience: 50 }, 'high', personality);
    expect(effects.gainMultiplier).toBeGreaterThan(1);
    expect(effects.fatigueMultiplier).toBeLessThan(1);
    const focused = await train();
    expect(focused.statChanges.speed).toBeCloseTo(
      calculateStatGain(training, { ...ctx, personalityFactor: effects.gainMultiplier }),
      6,
    );
    expect(focused.statChanges.speed).toBeGreaterThan(neutral.statChanges.speed);
    // Yorgunluk DB ölçeğine (2 ondalık) yuvarlanır.
    expect(focused.fatigueGain).toBeCloseTo(calculateFatigueGain(training, ctx) * effects.fatigueMultiplier, 2);
    expect(focused.fatigueGain).toBeLessThan(neutral.fatigueGain);
  });
});
