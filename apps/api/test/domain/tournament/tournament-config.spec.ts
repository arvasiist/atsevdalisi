import { describe, expect, it } from 'vitest';
import { loadOnlineConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { tournamentShares } from '../../../src/application/use-cases/settle-race.use-case';

/**
 * Turnuva config'i lobi kurallarıyla ÇELİŞEMEZ (30.09.2026, migration 0045).
 * Turnuva finali bir lobi yarışıdır: saha boyutu, tribün ücreti/kapasitesi
 * ve mesafe `race-lobby.config.json`un izin verdiği kümelerin İÇİNDE
 * olmalıdır — yoksa kilit/kesinleşme (`resolveFieldComposition`) çalışma
 * anında reddeder ve bunu hiçbir derleyici söylemez.
 */
describe('online.tournament config tutarlılığı', () => {
  const online = loadOnlineConfig();
  const lobby = loadRaceLobbyConfig();

  it('her kademenin oyuncu tavanı geçerli bir saha boyutudur', () => {
    for (const tier of Object.values(online.tournament.tiers)) {
      expect(lobby.fieldSizes).toContain(tier.maxParticipants);
    }
  });

  it('final yarış ayarları lobi kümelerinin içindedir', () => {
    const race = online.tournament.race;
    expect(lobby.tribuneFeeOptions).toContain(race.tribuneFee);
    expect(lobby.spectatorCapacityOptions).toContain(race.spectatorCapacity);
    expect(lobby.allowedSurfaces).toContain(race.surface);
    expect(lobby.allowedWeather).toContain(race.weather);
    expect(race.distanceMeters).toBeGreaterThanOrEqual(lobby.distanceMeters.min);
    expect(race.distanceMeters).toBeLessThanOrEqual(lobby.distanceMeters.max);
  });

  it('minParticipants en az 2 ve en küçük kademe tavanını aşmaz', () => {
    const smallest = Math.min(...Object.values(online.tournament.tiers).map((tier) => tier.maxParticipants));
    expect(online.tournament.minParticipants).toBeGreaterThanOrEqual(2);
    expect(online.tournament.minParticipants).toBeLessThanOrEqual(smallest);
  });

  it('ödül payları 1..N ardışık ve toplamı 1.0ı aşmaz; tournamentShares hepsini okur', () => {
    const byPlacement = online.tournament.prizeDistributionByPlacement;
    const shares = tournamentShares(byPlacement);
    expect(shares).toHaveLength(Object.keys(byPlacement).length);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('tournamentShares boşlukta keser (eksik sıra ödül almaz)', () => {
    expect(tournamentShares({ '1': 0.6, '3': 0.4 })).toEqual([0.6]);
  });
});
