import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProgressionConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { describe, expect, it } from 'vitest';
import {
  bracketForLevel,
  combineBotStatRanges,
  isHorseLevelAllowed,
  levelBracketBotStatRange,
  validateHorseLevelBrackets,
} from '../../../src/domain/race/level-bracket';
import { validateRaceCreation } from '../../../src/domain/race/lobby';

/**
 * AT SEVİYESİ ARALIKLI YARIŞLAR (08.10.2026, migration 0073). Kanıtlananlar:
 * config aralıkları 1..maxLevel boşluksuz; migration CHECK'i config
 * anahtarlarıyla BİREBİR (ayrışırsa yarış açılışı çalışma anında reddedilir);
 * katılım kuralı; bot gücü; yarış açma doğrulaması.
 */
const lobby = loadRaceLobbyConfig();
const brackets = lobby.horseLevelBrackets;
const MIGRATIONS = join(__dirname, '../../../../../database/migrations');

describe('at seviyesi aralıkları — config', () => {
  it('gerçek config geçerli: 1..maxLevel boşluksuz, çakışmasız', () => {
    expect(validateHorseLevelBrackets(brackets, loadProgressionConfig().maxLevel)).toEqual([]);
    expect(brackets.length).toBeGreaterThanOrEqual(3);
  });

  it('CHECK kısıtını yazan EN SON migration config anahtarlarıyla birebir', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.up.sql'))
      .sort()
      .filter((file) => readFileSync(join(MIGRATIONS, file), 'utf8').includes('races_horse_level_bracket_valid'));
    const latest = readFileSync(join(MIGRATIONS, files.at(-1)!), 'utf8');
    const listed = [...latest.matchAll(/horse_level_bracket IN \(([^)]*)\)/g)].at(-1)![1]!;
    const keys = [...listed.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(keys).toEqual(brackets.map((bracket) => bracket.key));
  });

  it('bozuk config yakalanır: boşluk, çakışma, ters aralık, son seviye eksik, bot aralığı', () => {
    const maxLevel = 50;
    const ok = [
      { key: 'a', name: 'A', minLevel: 1, maxLevel: 10, botStatRange: [30, 50] as [number, number] },
      { key: 'b', name: 'B', minLevel: 11, maxLevel: 50, botStatRange: [40, 60] as [number, number] },
    ];
    expect(validateHorseLevelBrackets(ok, maxLevel)).toEqual([]);
    expect(validateHorseLevelBrackets([ok[0]!, { ...ok[1]!, minLevel: 13 }], maxLevel).length).toBeGreaterThan(0);
    expect(validateHorseLevelBrackets([ok[0]!, { ...ok[1]!, minLevel: 9 }], maxLevel).length).toBeGreaterThan(0);
    expect(validateHorseLevelBrackets([ok[0]!, { ...ok[1]!, maxLevel: 40 }], maxLevel).length).toBeGreaterThan(0);
    expect(validateHorseLevelBrackets([ok[0]!, { ...ok[1]!, botStatRange: [70, 60] }], maxLevel).length).toBeGreaterThan(0);
    expect(validateHorseLevelBrackets([ok[0]!, { ...ok[1]!, key: 'a' }], maxLevel).length).toBeGreaterThan(0);
  });
});

describe('at seviyesi aralıkları — kural', () => {
  it('aralıksız yarış herkese açık; aralıklı yarış yalnızca aralıktaki ata; bilinmeyen aralık kapalı', () => {
    const rookie = brackets[0]!;
    expect(isHorseLevelAllowed(brackets, null, 37)).toBe(true);
    expect(isHorseLevelAllowed(brackets, rookie.key, rookie.minLevel)).toBe(true);
    expect(isHorseLevelAllowed(brackets, rookie.key, rookie.maxLevel)).toBe(true);
    expect(isHorseLevelAllowed(brackets, rookie.key, rookie.maxLevel + 1)).toBe(false);
    expect(isHorseLevelAllowed(brackets, 'uydurma', 1)).toBe(false);
  });

  it('her seviye tam bir aralığa düşer', () => {
    for (let level = 1; level <= loadProgressionConfig().maxLevel; level += 1) {
      const owners = brackets.filter((bracket) => level >= bracket.minLevel && level <= bracket.maxLevel);
      expect(owners, `seviye ${level}`).toHaveLength(1);
      expect(bracketForLevel(brackets, level)?.key).toBe(owners[0]!.key);
    }
  });

  it('bot gücü: aralık yoksa null (açık yarış botları değişmez); ırk sınıfıyla kesişim', () => {
    expect(levelBracketBotStatRange(brackets, null)).toBeNull();
    expect(levelBracketBotStatRange(brackets, brackets[0]!.key)).toEqual(brackets[0]!.botStatRange);
    expect(combineBotStatRanges(null, null)).toBeNull();
    expect(combineBotStatRanges([40, 60], null)).toEqual([40, 60]);
    expect(combineBotStatRanges(null, [30, 50])).toEqual([30, 50]);
    expect(combineBotStatRanges([40, 60], [30, 50])).toEqual([40, 50]);
    // Kesişim boşsa ırk sınıfı geçerli.
    expect(combineBotStatRanges([60, 80], [30, 50])).toEqual([60, 80]);
  });

  it('çaylak botları açık yarış botlarından zayıf (yeni at adil yarışsın)', () => {
    const [low, high] = brackets[0]!.botStatRange;
    expect(high).toBeLessThan(75);
    expect(low).toBeLessThan(45);
  });
});

describe('at seviyesi aralıkları — yarış açma doğrulaması', () => {
  const now = new Date('2026-10-08T10:00:00Z');
  const input = {
    name: 'Çaylak Kupası',
    fieldSize: 8,
    maxPlayers: 8,
    entryFee: 0,
    raceType: 'free',
    startTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    surface: 'dirt',
    weather: 'sunny',
    distanceMeters: 1200,
    tribuneFee: 0,
    spectatorCapacity: 500,
  };

  it('geçerli aralık kabul; verilmezse null; bilinmeyen ya da metin olmayan sorun', () => {
    expect(validateRaceCreation({ ...input, horseLevelBracket: 'rookie' }, lobby, now).value?.horseLevelBracket).toBe(
      'rookie',
    );
    expect(validateRaceCreation(input, lobby, now).value?.horseLevelBracket).toBeNull();
    expect(validateRaceCreation({ ...input, horseLevelBracket: 'efsane' }, lobby, now).problems).toHaveLength(1);
    expect(validateRaceCreation({ ...input, horseLevelBracket: 3 }, lobby, now).value).toBeNull();
  });
});
