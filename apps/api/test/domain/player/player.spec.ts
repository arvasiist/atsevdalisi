import { describe, expect, it } from 'vitest';
import { createNewPlayer } from '../../../src/domain/player/player';
import {
  assertPasswordIsStrong,
  checkPasswordStrength,
  validateDisplayName,
  validateUsername,
} from '../../../src/domain/player/validation';
import { InvalidDisplayNameError, InvalidUsernameError, WeakPasswordError } from '../../../src/domain/player/errors';
import economyConfigJson from '../../../../../config/economy.config.json';
import type { EconomyConfig } from '@at-sevdalisi/game-config';

const economyConfig = economyConfigJson as unknown as EconomyConfig;

describe('createNewPlayer', () => {
  it('config’teki başlangıç bakiyesiyle level 1 bir oyuncu oluşturur', () => {
    const player = createNewPlayer({ id: 'uuid-1', username: 'omer_arvas', displayName: 'Ömer' }, economyConfig);
    expect(player.level).toBe(1);
    expect(player.xp).toBe(0);
    expect(player.money).toBe(economyConfig.newPlayerStartingBalance.money);
    expect(player.gems).toBe(economyConfig.newPlayerStartingBalance.gems);
  });

  it('geçersiz username ile InvalidUsernameError fırlatır', () => {
    expect(() => createNewPlayer({ id: 'uuid-1', username: 'AB', displayName: 'Ömer' }, economyConfig)).toThrow(
      InvalidUsernameError,
    );
  });
});

describe('validateUsername', () => {
  it('kısa veya özel karakter içeren username reddedilir', () => {
    expect(() => validateUsername('ab')).toThrow(InvalidUsernameError);
    expect(() => validateUsername('geçersiz!')).toThrow(InvalidUsernameError);
  });

  it('geçerli username kabul edilir', () => {
    expect(() => validateUsername('valid_user_123')).not.toThrow();
  });
});

describe('validateDisplayName', () => {
  it('çok kısa görünen ad reddedilir', () => {
    expect(() => validateDisplayName('a')).toThrow(InvalidDisplayNameError);
  });

  it('Türkçe karakterli görünen ad kabul edilir', () => {
    expect(() => validateDisplayName('Ömer Arvas')).not.toThrow();
  });
});

describe('checkPasswordStrength / assertPasswordIsStrong', () => {
  it('zayıf şifreler geçersiz sayılır', () => {
    expect(checkPasswordStrength('abc').valid).toBe(false);
    expect(() => assertPasswordIsStrong('short1')).toThrow(WeakPasswordError);
  });

  it('harf + rakam + 8 karakter üstü şifreler geçerli sayılır', () => {
    expect(checkPasswordStrength('gucluSifre123').valid).toBe(true);
    expect(() => assertPasswordIsStrong('gucluSifre123')).not.toThrow();
  });
});
