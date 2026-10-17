import type {
  CareerConfig,
  HippodromesConfig,
  PrizeDistributionConfig,
  RaceCalendarProgram,
  RaceTierConfig,
} from '@at-sevdalisi/game-config';
import type { HippodromeCatalogView, HippodromeProgramView, HippodromeView } from '@at-sevdalisi/shared-types';
import { computeCalendarSlotTimes } from './race-calendar';
import { requiredCareerTierFor } from '../career/career';

/** Programın gösterilen sıradaki yuva sayısı. */
export const HIPPODROME_NEXT_SLOT_COUNT = 3;

/**
 * HİPODROM KATALOĞU (16.10.2026, brief §9) — saf. Pist (config) + ağırladığı
 * masaların bedeli/at sayısı/kazanan payı (`economy`) + pistin takvim
 * programları. Sıradaki saatler takvim zamanlayıcısının AYNI fonksiyonuyla
 * (`computeCalendarSlotTimes`) hesaplanır — ekranda görünen saat ile açılan
 * yarış ayrışamaz. Hipodromu yazılmamış program varsayılan pistte görünür
 * (yarışı da orada koşulur: `resolveHippodromeKey`).
 */
export function buildHippodromeCatalog(
  now: Date,
  hippodromes: HippodromesConfig,
  raceTiers: readonly RaceTierConfig[],
  prizeDistributions: readonly PrizeDistributionConfig[],
  programs: readonly RaceCalendarProgram[],
  career: CareerConfig,
): HippodromeCatalogView {
  const tierRef = (race: Parameters<typeof requiredCareerTierFor>[0]) => {
    const tier = requiredCareerTierFor(race, career);
    return { key: tier.key, name: tier.name };
  };
  const views: HippodromeView[] = hippodromes.hippodromes.map((hippodrome) => ({
    key: hippodrome.key,
    name: hippodrome.name,
    shortName: hippodrome.shortName,
    country: hippodrome.country,
    countryCode: hippodrome.countryCode,
    city: hippodrome.city,
    level: hippodrome.level,
    prestige: hippodrome.prestige,
    surfaces: [...hippodrome.surfaces],
    distancesMeters: [...hippodrome.distancesMeters],
    lapLengthMeters: hippodrome.lapLengthMeters,
    requiredCareerTier: tierRef({ tableId: null, hippodromeLevel: hippodrome.level }),
    tables: hippodrome.tables.flatMap((tableId) => {
      const tier = raceTiers.find((candidate) => candidate.id === tableId);
      if (!tier) return [];
      const shares = prizeDistributions.find((distribution) => distribution.id === tier.distributionId)?.shares ?? [];
      return [
        {
          id: tier.id,
          label: tier.label,
          entryFee: tier.entryFee,
          fieldSize: tier.fieldSize,
          winnerSharePercent: Math.round((shares[0] ?? 0) * 1000) / 10,
          requiredCareerTier: tierRef({ tableId: tier.id, hippodromeLevel: hippodrome.level }),
        },
      ];
    }),
    programs: programs
      .filter((program) => (program.hippodrome ?? hippodromes.defaultKey) === hippodrome.key)
      .map((program): HippodromeProgramView => ({
        id: program.id,
        name: program.name,
        surface: program.surface,
        distanceMeters: program.distanceMeters,
        entryFee: program.entryFee,
        fieldSize: program.fieldSize,
        intervalMinutes: program.intervalMinutes,
        featured: program.featured === true,
        tableId: program.tableId ?? null,
        breedClass: program.breedClass ?? null,
        horseLevelBracket: program.horseLevelBracket ?? null,
        nextStartTimes: computeCalendarSlotTimes(now, program, {
          minLeadMinutes: 0,
          horizonHours: (program.intervalMinutes * HIPPODROME_NEXT_SLOT_COUNT) / 60,
        })
          .slice(0, HIPPODROME_NEXT_SLOT_COUNT)
          .map((slot) => slot.toISOString()),
      })),
  }));
  return { hippodromes: views, generatedAt: now.toISOString() };
}
