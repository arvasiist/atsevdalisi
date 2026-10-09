import { describe, expect, it } from 'vitest';
import { loadEconomyConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import {
  RACE_TABLES,
  applyRaceTable,
  buildCreateRaceBody,
  defaultLobbyRaceForm,
  describeTableRules,
  tableRulesFromConfig,
} from '../../../src/features/race-lobby/lobby-logic';

const config = loadRaceLobbyConfig();
const economy = loadEconomyConfig();
const now = new Date('2026-10-09T10:00:00Z');

describe('masa seçimi (09.10.2026)', () => {
  it('masalar sunucu config\'iyle aynı dosyadan', () => {
    expect(RACE_TABLES.map((table) => table.id)).toEqual(economy.raceTiers.map((tier) => tier.id));
  });

  it('masa seçilince at sayısı + bedel masanınkine çekilir, gövdede tableId gider', () => {
    const championship = RACE_TABLES.find((table) => table.id === 'championship')!;
    const form = applyRaceTable({ ...defaultLobbyRaceForm(config), name: 'Şampiyon Masası' }, 'championship', config);
    expect(form.fieldSize).toBe(championship.fieldSize);
    expect(form.entryFee).toBe(championship.entryFee);
    const result = buildCreateRaceBody(form, now, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toMatchObject({ tableId: 'championship', entryFee: championship.entryFee, raceType: 'paid' });
    }
  });

  it('masayla uyuşmayan bedel istemcide de reddedilir; "Serbest" masasız gövde üretir', () => {
    const form = applyRaceTable({ ...defaultLobbyRaceForm(config), name: 'Bozuk Masa' }, 'local', config);
    expect(buildCreateRaceBody({ ...form, entryFee: form.entryFee + 1 }, now, config).ok).toBe(false);
    const free = applyRaceTable(form, '', config);
    const result = buildCreateRaceBody(free, now, config);
    expect(result.ok && 'tableId' in result.body).toBe(false);
  });

  it('kural metni: ücret anı, ödül sırası + komisyon, kaybeden iadesi', () => {
    const local = RACE_TABLES.find((table) => table.id === 'local')!;
    const lines = describeTableRules(tableRulesFromConfig(local));
    expect(lines[0]).toMatch(/katılırken/);
    expect(lines[1]).toMatch(/ilk 5 sıra · komisyon %10/);
    expect(lines[2]).toBe(`Kaybedene: 6. sıraya giriş bedelinin %${local.loserRefund.percent} iadesi`);
    const national = RACE_TABLES.find((table) => table.id === 'national')!;
    expect(describeTableRules(tableRulesFromConfig(national))[0]).toMatch(/start anında/);
    const elite = RACE_TABLES.find((table) => table.id === 'elite')!;
    expect(describeTableRules(tableRulesFromConfig(elite))[2]).toBe('Kaybedene iade yok');
  });
});
