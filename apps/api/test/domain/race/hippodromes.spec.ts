import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadHippodromesConfig,
  loadRaceLobbyConfig,
  type HippodromesConfig,
} from '@at-sevdalisi/game-config';
import { describe, expect, it } from 'vitest';
import {
  findHippodrome,
  hippodromeKeyForTrack,
  hippodromeKeys,
  pickHippodromeForRace,
  resolveHippodromeKey,
  trackIdForHippodrome,
  validateHippodromesConfig,
} from '../../../src/domain/race/hippodrome';
import { validateRaceCreation } from '../../../src/domain/race/lobby';

/**
 * HİPODROMLAR (08.10.2026, migration 0072). Kanıtlananlar: config ile
 * migration'ın yazdığı `tracks` satırları BİREBİR aynı (kimlik ↔ anahtar
 * ayrışırsa yarış yanlış sahnede görünür ve bu hiçbir yerde hata üretmez);
 * yarış açma doğrulaması bilinmeyen hipodromu reddeder; oyuncunun seçmediği
 * yarışın hipodromu kimlikten determinist.
 */
const config = loadHippodromesConfig();
const MIGRATION = join(__dirname, '../../../../../database/migrations/0072_add_hippodromes.up.sql');

function clone(): HippodromesConfig {
  return JSON.parse(JSON.stringify(config)) as HippodromesConfig;
}

describe('hipodromlar — config ↔ migration', () => {
  it('gerçek config geçerli; Veliefendi varsayılan ve eski pist ölçüsünde', () => {
    expect(validateHippodromesConfig(config)).toEqual([]);
    expect(config.defaultKey).toBe('veliefendi');
    const veliefendi = findHippodrome(config, 'veliefendi')!;
    // Eski sahne 2000 m tur / 60 m viraj kullanıyordu — varsayılan hipodrom görüntüyü değiştirmez.
    expect([veliefendi.lapLengthMeters, veliefendi.turnRadiusMeters]).toEqual([2000, 60]);
    expect(config.hippodromes.length).toBeGreaterThanOrEqual(5);
  });

  it("migration 0072 config'teki (kimlik, anahtar) çiftlerini BİREBİR yazar", () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const rows = [...sql.matchAll(/\('([0-9a-f-]{36})',\s*'([a-z0-9-]+)'/g)].map((match) => [
      match[1],
      match[2],
    ]);
    expect(rows).toEqual(
      config.hippodromes.map((hippodrome) => [hippodrome.trackId, hippodrome.key]),
    );
  });

  it('bozuk config yakalanır: tekrarlı anahtar/kimlik, tanımsız varsayılan, geçersiz ölçü, boş liste', () => {
    const duplicated = clone();
    duplicated.hippodromes.push({ ...duplicated.hippodromes[0]! });
    expect(validateHippodromesConfig(duplicated)).toHaveLength(2);

    const missingDefault = clone();
    missingDefault.defaultKey = 'yok';
    expect(validateHippodromesConfig(missingDefault)).toHaveLength(1);

    const badSize = clone();
    badSize.hippodromes[1]!.turnRadiusMeters = 0;
    expect(validateHippodromesConfig(badSize)).toHaveLength(1);

    expect(validateHippodromesConfig({ defaultKey: 'x', hippodromes: [] }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('hipodromlar — eşleme', () => {
  it('anahtar ↔ pist kimliği iki yönde tutarlı; NULL/bilinmeyen kimlik varsayılana düşer', () => {
    for (const hippodrome of config.hippodromes) {
      expect(trackIdForHippodrome(config, hippodrome.key)).toBe(hippodrome.trackId);
      expect(hippodromeKeyForTrack(config, hippodrome.trackId)).toBe(hippodrome.key);
    }
    expect(trackIdForHippodrome(config, null)).toBeNull();
    expect(trackIdForHippodrome(config, 'yok')).toBeNull();
    expect(resolveHippodromeKey(config, null)).toBe(config.defaultKey);
    expect(resolveHippodromeKey(config, '00000000-0000-0000-0000-000000000000')).toBe(
      config.defaultKey,
    );
  });

  it('seçilmeyen yarışın hipodromu kimlikten determinist ve bütün hipodromlara dağılır', () => {
    const ids = Array.from(
      { length: 400 },
      (_, i) => `6f1c2d3e-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
    );
    const first = ids.map((id) => pickHippodromeForRace(config, id).key);
    expect(ids.map((id) => pickHippodromeForRace(config, id).key)).toEqual(first);
    expect(new Set(first)).toEqual(new Set(hippodromeKeys(config)));
  });
});

describe('hipodromlar — yarış açma doğrulaması', () => {
  const lobby = loadRaceLobbyConfig();
  const now = new Date('2026-10-08T10:00:00Z');
  const input = {
    name: 'Ankara Koşusu',
    fieldSize: 8,
    maxPlayers: 8,
    entryFee: 0,
    raceType: 'free',
    startTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    surface: 'dirt',
    weather: 'sunny',
    distanceMeters: 1400,
    tribuneFee: 0,
    spectatorCapacity: 500,
  };
  const keys = hippodromeKeys(config);

  it('geçerli anahtar kabul; verilmeyen null (varsayılan); bilinmeyen ya da metin olmayan sorun', () => {
    expect(
      validateRaceCreation({ ...input, hippodrome: 'ankara' }, lobby, now, [], keys).value
        ?.hippodrome,
    ).toBe('ankara');
    expect(validateRaceCreation(input, lobby, now, [], keys).value?.hippodrome).toBeNull();
    expect(
      validateRaceCreation({ ...input, hippodrome: null }, lobby, now, [], keys).value?.hippodrome,
    ).toBeNull();
    expect(
      validateRaceCreation({ ...input, hippodrome: 'ay-pisti' }, lobby, now, [], keys).problems,
    ).toHaveLength(1);
    expect(
      validateRaceCreation({ ...input, hippodrome: 7 }, lobby, now, [], keys).value,
    ).toBeNull();
  });

  it('hipodrom listesi verilmeyen çağıran hipodrom SEÇEMEZ (sessizce varsayılana dönmez)', () => {
    expect(validateRaceCreation({ ...input, hippodrome: 'ankara' }, lobby, now).value).toBeNull();
  });
});
