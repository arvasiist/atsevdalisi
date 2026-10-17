import { loadCareerConfig, loadEconomyConfig, loadHippodromesConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { describe, expect, it } from 'vitest';
import { buildHippodromeCatalog, HIPPODROME_NEXT_SLOT_COUNT } from '../../../src/domain/race/hippodrome-catalog';
import { computeCalendarSlotTimes } from '../../../src/domain/race/race-calendar';

/**
 * HİPODROM KATALOĞU (16.10.2026, brief §9). Kilitlenenler: her pist bir kez
 * ve masaları economy'deki bedel/at sayısıyla; her takvim programı TAM BİR
 * pistte; sıradaki saatler zamanlayıcının fonksiyonuyla birebir.
 */
describe('hipodrom kataloğu', () => {
  const hippodromes = loadHippodromesConfig();
  const economy = loadEconomyConfig();
  const programs = loadRaceLobbyConfig().calendar.programs;
  const now = new Date(Date.UTC(2026, 9, 16, 9, 41, 0));
  const catalog = buildHippodromeCatalog(
    now,
    hippodromes,
    economy.raceTiers,
    economy.prizeDistributions,
    programs,
    loadCareerConfig(),
  );

  it('her pist bir kez; masalar economy kademeleriyle birebir', () => {
    expect(catalog.hippodromes.map((h) => h.key)).toEqual(hippodromes.hippodromes.map((h) => h.key));
    for (const view of catalog.hippodromes) {
      const config = hippodromes.hippodromes.find((h) => h.key === view.key)!;
      expect(view.tables.map((t) => t.id)).toEqual(config.tables);
      for (const table of view.tables) {
        const tier = economy.raceTiers.find((t) => t.id === table.id)!;
        expect(table).toMatchObject({ entryFee: tier.entryFee, fieldSize: tier.fieldSize, label: tier.label });
        expect(table.winnerSharePercent).toBeGreaterThan(0);
      }
    }
  });

  it('her takvim programı tam bir pistte görünür', () => {
    const shown = catalog.hippodromes.flatMap((h) => h.programs.map((p) => p.id)).sort();
    expect(shown).toEqual(programs.map((p) => p.id).sort());
  });

  it('sıradaki saatler takvim zamanlayıcısının yuvalarıyla aynı; şimdiden sonra ve artan', () => {
    for (const view of catalog.hippodromes) {
      for (const program of view.programs) {
        const config = programs.find((p) => p.id === program.id)!;
        expect(program.nextStartTimes).toHaveLength(HIPPODROME_NEXT_SLOT_COUNT);
        const expected = computeCalendarSlotTimes(now, config, {
          minLeadMinutes: 0,
          horizonHours: (config.intervalMinutes * HIPPODROME_NEXT_SLOT_COUNT) / 60,
        })
          .slice(0, HIPPODROME_NEXT_SLOT_COUNT)
          .map((slot) => slot.toISOString());
        expect(program.nextStartTimes).toEqual(expected);
        for (const iso of program.nextStartTimes) expect(Date.parse(iso)).toBeGreaterThanOrEqual(now.getTime());
      }
    }
  });
});
