import { describe, expect, it } from 'vitest';
import { loadHippodromesConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import {
  RACE_TABLES,
  applyHippodrome,
  applyRaceTable,
  buildCreateRaceBody,
  defaultLobbyRaceForm,
  hippodromeFormProblem,
} from '../../../src/features/race-lobby/lobby-logic';

/**
 * PİST KURALI — lobi formu (16.10.2026, brief §9). Sunucu `hippodromeRaceProblems`
 * ile aynı config'i uygular; form her zaman geçerli bir zemin/mesafe/masa tutmalı,
 * yoksa varsayılan form 400 alırdı (yeni kuraldan önce varsayılan 800 m idi ve
 * Veliefendi'de 800 m koşulmaz).
 */
describe('lobi formu — pist kuralı', () => {
  const lobby = loadRaceLobbyConfig();
  const hippodromes = loadHippodromesConfig().hippodromes;

  it('varsayılan form ve masalı ilk form pistin kuralına uyar', () => {
    const base = defaultLobbyRaceForm(lobby);
    expect(hippodromeFormProblem(base, lobby)).toBeNull();
    const initial = applyRaceTable(base, RACE_TABLES[0]!.id, lobby);
    expect(hippodromeFormProblem(initial, lobby)).toBeNull();
    expect(initial.entryFee).toBe(RACE_TABLES[0]!.entryFee);
  });

  it('her pist seçimi formu geçerli tutar (zemin, mesafe, masa)', () => {
    const initial = applyRaceTable(defaultLobbyRaceForm(lobby), RACE_TABLES[0]!.id, lobby);
    for (const hippodrome of hippodromes) {
      const form = applyHippodrome(initial, hippodrome.key, lobby);
      expect(form.hippodrome).toBe(hippodrome.key);
      expect(hippodromeFormProblem(form, lobby), hippodrome.key).toBeNull();
      expect(buildCreateRaceBody({ ...form, name: 'Pist Kupası' }, new Date(), lobby).ok, hippodrome.key).toBe(true);
    }
  });

  it('pistin ağırlamadığı masa seçilince masayı ağırlayan piste geçilir', () => {
    const atAnkara = applyHippodrome(defaultLobbyRaceForm(lobby), 'ankara', lobby);
    const championship = applyRaceTable(atAnkara, 'championship', lobby);
    expect(championship.tableId).toBe('championship');
    expect(hippodromes.find((h) => h.key === championship.hippodrome)!.tables).toContain('championship');
    expect(hippodromeFormProblem(championship, lobby)).toBeNull();
  });

  it('kurala uymayan form gönderilmez', () => {
    const form = { ...applyHippodrome(defaultLobbyRaceForm(lobby), 'paris', lobby), name: 'Paris Kupası', surface: 'dirt' as const };
    const result = buildCreateRaceBody(form, new Date(), lobby);
    expect(result.ok).toBe(false);
  });
});
