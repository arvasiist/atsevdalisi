/**
 * 16.10.2026 — S4 EKONOMİ ÖLÇÜMÜ (`docs/OYUN_DONGUSU_DENETIMI.md`).
 * Pratik yarışın kademe × at gücüne göre ve lobi yarışının gerçek oyuncu
 * sayısına göre beklenen netini ölçer; Markdown tablosu yazdırır
 * (`docs/RACE_BALANCE_REPORT.md` §11). Ölçüm kodu harness'tadır — burada
 * yalnızca senaryo ve biçim var.
 *
 *   npx tsx tools/economy-ev-report.ts [deneme=400]
 */
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { DEFAULT_RACE_TACTIC } from '../src/domain/race/validation';
import { computeWeightCompatibility } from '../src/domain/race/carried-weight';
import { HORSE_WEIGHT_POPULATION_MEAN_KG } from '../src/domain/horse/weight';
import { practiceBotStatRange } from '../src/domain/race/practice-class';
import { measureLobbyEv, measurePracticeEv } from '../test/domain/race/race-balance-harness';

const ECONOMY = loadEconomyConfig();
const TRIALS = Number(process.argv[2] ?? 400);
const WEIGHT = computeWeightCompatibility(HORSE_WEIGHT_POPULATION_MEAN_KG);

function entrant(id: string, power: number): RaceEntrantSnapshot {
  return {
    horseId: id,
    speed: power,
    stamina: power,
    acceleration: power,
    fitness: 50,
    fatigue: 0,
    health: 100,
    morale: 80,
    surfaceCompatibility: 50,
    distanceCompatibility: 50,
    jockeySkillComposite: 50,
    form: 50,
    weightCompatibility: WEIGHT,
    temperament: 50,
    tactic: DEFAULT_RACE_TACTIC,
    equipmentModifier: 1,
  } as RaceEntrantSnapshot;
}

const pct = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(0)}%`;

console.log('### Pratik yarış — net / giriş (kademe × at gücü)\n');
const powers = [50, 55, 60, 65, 70, 75, 80, 85, 90];
console.log(`| Kademe (ücret, tavan) | ${powers.join(' | ')} |`);
console.log(`|---|${powers.map(() => '---').join('|')}|`);
for (const tier of ECONOMY.raceTiers) {
  const raceClass = ECONOMY.practiceRaceClasses.find((entry) => entry.tierId === tier.id)!;
  const cells = powers.map((power) => {
    const botStatRange = practiceBotStatRange(raceClass, power);
    if (raceClass.maxHorsePower !== null && power >= raceClass.maxHorsePower) return '—';
    const result = measurePracticeEv({
      player: entrant('player', power),
      botStatRange,
      tier,
      economy: ECONOMY,
      trials: TRIALS,
      seedPrefix: `s4-${tier.id}-${power}`,
    });
    return pct(result.meanNet / tier.entryFee);
  });
  console.log(`| ${tier.id} (${tier.entryFee}, ${raceClass.maxHorsePower ?? 'yok'}) | ${cells.join(' | ')} |`);
}

console.log('\n### Lobi (masalı) — eşit güçte (60) oyuncu başına net / giriş, bota yanan pay\n');
const counts = [2, 3, 4, 6, 8];
console.log(`| Masa | Botlu: ${counts.join(' / ')} | Botsuz: ${counts.join(' / ')} |`);
console.log('|---|---|---|');
for (const table of ECONOMY.raceTiers) {
  const cells = [true, false].map((aiFill) =>
    counts
      .filter((count) => count <= table.fieldSize)
      .map((count) => {
        const players = Array.from({ length: count }, (_, index) => entrant(`player-${index}`, 60));
        const result = measureLobbyEv({
          players,
          table,
          economy: ECONOMY,
          aiFill,
          botStatRange: null,
          trials: TRIALS,
          seedPrefix: `s4-lobby-${table.id}-${count}-${aiFill}`,
        });
        const burned = aiFill ? ` (yanan ${(result.burnedShare * 100).toFixed(0)}%)` : '';
        return `${pct(result.meanNetPerPlayer / table.entryFee)}${burned}`;
      })
      .join(' / '),
  );
  console.log(`| ${table.id} (${table.entryFee}) | ${cells[0]} | ${cells[1]} |`);
}
