import {
  loadAchievementsConfig,
  loadCareerConfig,
  loadEconomyConfig,
  loadHippodromesConfig,
  type CareerConfig,
} from '@at-sevdalisi/game-config';
import { describe, expect, it } from 'vitest';
import {
  careerAccessProblem,
  careerPointsForPlace,
  careerRequirementForRace,
  requiredCareerTierFor,
  resolveCareerTier,
  validateCareerConfig,
} from '../../../src/domain/career/career';
import { HIPPODROME_LEVELS } from '../../../src/domain/race/hippodrome';

/**
 * KARİYER KADEMELERİ (16.10.2026, brief §10). Kilitlenenler: config tutarlı
 * (her masa ve pist seviyesi tam bir kademede, eşikler artan); ilk kademe
 * Türkiye pistlerinin masasız yarışlarını ve mahalli masayı açar (yeni oyuncu
 * kilitli kalmaz); bilinmeyen masa KAPALI; kademe ödülleri başarımlarla eş.
 */
describe('kariyer kademeleri', () => {
  const career = loadCareerConfig();
  const economy = loadEconomyConfig();
  const hippodromes = loadHippodromesConfig();
  const clone = (): CareerConfig => JSON.parse(JSON.stringify(career)) as CareerConfig;

  it('gerçek config geçerli', () => {
    expect(
      validateCareerConfig(
        career,
        economy.raceTiers.map((tier) => tier.id),
        HIPPODROME_LEVELS,
      ),
    ).toEqual([]);
  });

  it('kademe puan eşiğiyle; sıradaki hedef ve kalan puan', () => {
    expect(resolveCareerTier(0, career)).toMatchObject({ index: 0, pointsToNext: career.tiers[1]!.requiredPoints });
    const second = career.tiers[1]!;
    expect(resolveCareerTier(second.requiredPoints, career).tier.key).toBe(second.key);
    expect(resolveCareerTier(second.requiredPoints - 1, career).index).toBe(0);
    const last = career.tiers.length - 1;
    expect(resolveCareerTier(1_000_000, career)).toMatchObject({ index: last, next: null, pointsToNext: 0 });
  });

  it('derece puanı: 1-3 kendi değeri, sonrası dördüncü; bilinmeyen sınıf 0', () => {
    const table = career.racePoints.local!;
    expect([1, 2, 3, 4, 12].map((place) => careerPointsForPlace('local', place, career))).toEqual([
      table[0],
      table[1],
      table[2],
      table[3],
      table[3],
    ]);
    expect(careerPointsForPlace('ay-masasi', 1, career)).toBe(0);
  });

  it('yeni oyuncu: mahalli masa + masasız Türkiye pistleri açık; üst masalar ve yurt dışı kilitli', () => {
    const at = (tableId: string | null, hippodromeKey: string) =>
      careerRequirementForRace({ tableId, hippodromeKey }, 0, career, hippodromes);
    for (const key of ['veliefendi', 'ankara', 'izmir', 'adana', 'bursa']) expect(at(null, key)).toBeNull();
    expect(at('local', 'ankara')).toBeNull();
    expect(at('regional', 'izmir')?.key).toBe('regional');
    expect(at('championship', 'veliefendi')?.key).toBe('grand-championship');
    expect(at(null, 'paris')?.key).toBe('international');
    // Kentucky'nin elit masası: elit (ulusal şampiyona) + uluslararası → daha yükseği.
    expect(at('elite', 'kentucky')?.key).toBe('international');
  });

  it('bilinmeyen masa / pist seviyesi KAPALI (son kademe ister)', () => {
    const last = career.tiers[career.tiers.length - 1]!;
    expect(requiredCareerTierFor({ tableId: 'ay-masasi', hippodromeLevel: null }, career).key).toBe(last.key);
    expect(careerAccessProblem({ tableId: 'ay-masasi', hippodromeLevel: null }, 0, career)).not.toBeNull();
  });

  it('her kademe (ilki hariç) için aynı eşikte bir career_points başarımı var (kademe ödülü)', () => {
    const rewards = loadAchievementsConfig().achievements.filter((a) => a.metric === 'career_points');
    expect(rewards.map((a) => a.target).sort((a, b) => a - b)).toEqual(
      career.tiers.slice(1).map((tier) => tier.requiredPoints),
    );
  });

  it('bozuk config yakalanır', () => {
    const broken = clone();
    broken.tiers[0]!.requiredPoints = 5;
    broken.tiers[2]!.requiredPoints = broken.tiers[1]!.requiredPoints;
    broken.tiers[1]!.unlocksTables.push('local');
    broken.racePoints.open = [1, 2, 3, 4];
    delete broken.racePoints.practice;
    broken.tiers[4]!.unlocksHippodromeLevels = [];
    const problems = validateCareerConfig(broken, economy.raceTiers.map((t) => t.id), HIPPODROME_LEVELS);
    expect(problems.length).toBeGreaterThanOrEqual(6);
  });
});
