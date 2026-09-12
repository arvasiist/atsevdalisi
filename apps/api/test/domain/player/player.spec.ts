import { describe, expect, it } from 'vitest';
import { createNewPlayer } from '../../../src/domain/player/player';
import { validateDisplayName, validateUsername } from '../../../src/domain/player/validation';
import { createPlayerAuthProviderLink } from '../../../src/domain/player/auth-provider';
import {
  InvalidAuthProviderTokenError,
  InvalidDisplayNameError,
  InvalidUsernameError,
} from '../../../src/domain/player/errors';
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

/** Karar: Google/Apple Sign-In (docs/ARCHITECTURE.md §10 madde 1). */
describe('createPlayerAuthProviderLink', () => {
  it('geçerli bir Google kimliği için bağlantı kaydı oluşturur', () => {
    const link = createPlayerAuthProviderLink('uuid-1', {
      provider: 'google',
      providerUserId: 'g-12345',
      email: 'omer@example.com',
    });
    expect(link).toEqual({
      playerId: 'uuid-1',
      provider: 'google',
      providerUserId: 'g-12345',
      email: 'omer@example.com',
    });
  });

  it('boş providerUserId ile InvalidAuthProviderTokenError fırlatır', () => {
    expect(() =>
      createPlayerAuthProviderLink('uuid-1', { provider: 'apple', providerUserId: '   ', email: null }),
    ).toThrow(InvalidAuthProviderTokenError);
  });
});
