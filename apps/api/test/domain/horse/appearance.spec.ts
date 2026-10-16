import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHorseAppearanceConfig, type HorseAppearanceConfig } from '@at-sevdalisi/game-config';
import {
  HORSE_COAT_COLORS,
  HORSE_FACE_MARKINGS,
  HORSE_LEG_MARKINGS,
} from '@at-sevdalisi/shared-types';
import {
  deriveAppearance,
  inheritAppearance,
  pickWeighted,
} from '../../../src/domain/horse/appearance';

const config = loadHorseAppearanceConfig();

describe('deriveAppearance (01.10.2026)', () => {
  it('determinist: aynı kimlik = aynı görünüş', () => {
    expect(deriveAppearance('at-1', config)).toEqual(deriveAppearance('at-1', config));
  });

  it('yalnızca geçerli değerler üretir ve çeşitlilik vardır (herkes "bay" doğmaz)', () => {
    const coats = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const appearance = deriveAppearance(`at-${i}`, config);
      expect(HORSE_COAT_COLORS).toContain(appearance.coatColor);
      expect(HORSE_FACE_MARKINGS).toContain(appearance.faceMarking);
      expect(HORSE_LEG_MARKINGS).toContain(appearance.legMarking);
      coats.add(appearance.coatColor);
    }
    expect(coats.size).toBeGreaterThanOrEqual(4);
  });

  it('config ağırlıkları gerçekten okunur: tek don ağırlıklıysa hep o don', () => {
    const onlyGrey: HorseAppearanceConfig = {
      ...config,
      coatWeights: { bay: 0, dark_bay: 0, chestnut: 0, black: 0, grey: 1, palomino: 0 },
    };
    for (let i = 0; i < 50; i += 1) {
      expect(deriveAppearance(`x-${i}`, onlyGrey).coatColor).toBe('grey');
    }
  });
});

describe('pickWeighted', () => {
  it('sıfır ağırlıklı anahtar asla seçilmez; ağırlık yoksa hata', () => {
    for (const roll of [0, 0.3, 0.6, 0.999]) {
      expect(pickWeighted({ a: 0, b: 5 }, ['a', 'b'] as const, roll)).toBe('b');
    }
    expect(() => pickWeighted({ a: 0 }, ['a'] as const, 0.5)).toThrow();
  });
});

describe('inheritAppearance', () => {
  it('parentCoatChance=1 → don HER ZAMAN bir ebeveynden; sireCoatShare uç değerleri yönü belirler', () => {
    const always = { ...config, inheritance: { parentCoatChance: 1, sireCoatShare: 1 } };
    const fromDam = { ...config, inheritance: { parentCoatChance: 1, sireCoatShare: 0 } };
    for (let i = 0; i < 30; i += 1) {
      expect(inheritAppearance(`tay-${i}`, 'black', 'palomino', always).coatColor).toBe('black');
      expect(inheritAppearance(`tay-${i}`, 'black', 'palomino', fromDam).coatColor).toBe(
        'palomino',
      );
    }
  });

  it('parentCoatChance=0 → ebeveynden bağımsız (ağırlıklı türetme ile aynı)', () => {
    const never = { ...config, inheritance: { parentCoatChance: 0, sireCoatShare: 0.5 } };
    expect(inheritAppearance('tay-x', 'black', 'black', never)).toEqual(
      deriveAppearance('tay-x', never),
    );
  });
});

describe('migration 0051 CHECK kümeleri = shared-types sabitleri', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../../database/migrations/0051_add_horse_appearance.up.sql'),
    'utf8',
  );
  const checkValues = (column: string): string[] => {
    const match = new RegExp(`CHECK \\(${column} IN \\(([^)]*)\\)\\)`).exec(sql);
    return (match?.[1] ?? '').split(',').map((value) => value.trim().replace(/'/g, ''));
  };
  it('don/yüz/bacak değerleri birebir aynı', () => {
    expect(checkValues('coat_color')).toEqual([...HORSE_COAT_COLORS]);
    expect(checkValues('face_marking')).toEqual([...HORSE_FACE_MARKINGS]);
    expect(checkValues('leg_marking')).toEqual([...HORSE_LEG_MARKINGS]);
  });
  it('config ağırlık anahtarları geçerli değerlerdir', () => {
    expect(Object.keys(config.coatWeights).sort()).toEqual([...HORSE_COAT_COLORS].sort());
    expect(Object.keys(config.faceMarkingWeights).sort()).toEqual([...HORSE_FACE_MARKINGS].sort());
    expect(Object.keys(config.legMarkingWeights).sort()).toEqual([...HORSE_LEG_MARKINGS].sort());
  });
});
