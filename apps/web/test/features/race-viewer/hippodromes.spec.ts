import { loadHippodromesConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { describe, expect, it } from 'vitest';
import {
  BACKDROP_GROUND_HALF,
  BACKDROP_MIN_DISTANCE,
  PALM_REACH_METERS,
  SEA_SHORE_DISTANCE,
  computeBackdropLayout,
  treeLineMaxZ,
  type BackdropPiece,
} from '../../../src/features/race-viewer/hippodrome-backdrop';
import {
  DEFAULT_HIPPODROME_KEY,
  HIPPODROME_OPTIONS,
  hippodromeLabel,
  hippodromeTrackGeometry,
  resolveHippodrome,
} from '../../../src/features/race-viewer/hippodrome-theme';
import {
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
  type StadiumTrackGeometry,
} from '../../../src/features/race-viewer/track-path';
import {
  buildCreateRaceBody,
  defaultLobbyRaceForm,
  describeHippodrome,
} from '../../../src/features/race-lobby/lobby-logic';

/**
 * HİPODROMLAR (08.10.2026). Görsel doğrulama tarayıcıdadır; burada kırılmaması
 * gerekenler: bilinmeyen anahtar varsayılana düşer (sahne kırılmaz), varsayılan
 * hipodrom eski pist ölçüsündedir, uzak siluet parçalarının TABANI ağaç
 * halkasına/piste/tribüne girmez ve zemin düzleminin dışına taşmaz, siluet
 * determinist, lobi formu hipodromu gönderir.
 */
const CONFIG = loadHippodromesConfig();

/** Noktanın stadyum merkez çizgisine (iki düzlük + iki yarım daire) uzaklığı. */
function distanceToCenterline(x: number, z: number, geometry: StadiumTrackGeometry): number {
  const half = geometry.straightLengthMeters / 2;
  const nearestX = Math.max(-half, Math.min(half, x));
  return Math.abs(Math.hypot(x - nearestX, z) - geometry.turnRadiusMeters);
}

/** Parçanın tabanının yatay yarıçapı (merkezden en uzak taban noktası). */
function footprint(piece: BackdropPiece): number {
  switch (piece.kind) {
    case 'box':
      return Math.hypot(piece.sx, piece.sz) / 2;
    case 'palm':
      return PALM_REACH_METERS;
    default:
      return Math.max(piece.sx, piece.sz);
  }
}

describe('hipodrom seçimi', () => {
  it('bilinmeyen/eksik anahtar varsayılana düşer; varsayılan eski pist ölçüsünde', () => {
    expect(resolveHippodrome('izmir').key).toBe('izmir');
    expect(resolveHippodrome(null).key).toBe(DEFAULT_HIPPODROME_KEY);
    expect(resolveHippodrome(undefined).key).toBe(DEFAULT_HIPPODROME_KEY);
    expect(resolveHippodrome('ay-pisti').key).toBe(DEFAULT_HIPPODROME_KEY);
    const geometry = hippodromeTrackGeometry(resolveHippodrome(null));
    expect(geometry.lapLengthMeters).toBeCloseTo(DEFAULT_LAP_LENGTH_METERS, 6);
    expect(geometry.turnRadiusMeters).toBe(DEFAULT_TURN_RADIUS_METERS);
    expect(hippodromeLabel('bursa')).toBe(resolveHippodrome('bursa').name);
  });

  it("seçim listesi config'in bütün hipodromlarını taşır; beş farklı arka plan var", () => {
    expect(HIPPODROME_OPTIONS.map((option) => option.key)).toEqual(
      CONFIG.hippodromes.map((h) => h.key),
    );
    expect(new Set(CONFIG.hippodromes.map((h) => h.theme.backdrop)).size).toBe(5);
  });
});

describe('uzak siluet (arka plan)', () => {
  for (const hippodrome of CONFIG.hippodromes) {
    it(`${hippodrome.key} (${hippodrome.theme.backdrop}): parçalar ağaç halkasının ötesinde, zeminde, determinist`, () => {
      const geometry = hippodromeTrackGeometry(hippodrome);
      const layout = computeBackdropLayout(hippodrome.theme.backdrop, geometry);
      expect(layout.pieces.length).toBeGreaterThan(10);
      expect(computeBackdropLayout(hippodrome.theme.backdrop, geometry)).toEqual(layout);
      for (const piece of layout.pieces) {
        const clearance = distanceToCenterline(piece.x, piece.z, geometry) - footprint(piece);
        expect(
          clearance,
          `${piece.kind} @ ${piece.x.toFixed(0)},${piece.z.toFixed(0)}`,
        ).toBeGreaterThanOrEqual(BACKDROP_MIN_DISTANCE - 1e-6);
        expect(piece.sx).toBeGreaterThan(0);
        expect(piece.sy).toBeGreaterThan(0);
        expect(piece.sz).toBeGreaterThan(0);
        expect(piece.y).toBeGreaterThanOrEqual(0);
        expect(piece.color).toMatch(/^#[0-9a-f]{6}$/i);
        // Kara parçaları zemin düzleminin içinde; denizin karşı kıyısı ve uzak sıradağ deniz/sis üstündedir.
        if (piece.kind === 'hill' || piece.kind === 'box' || piece.kind === 'palm') {
          expect(Math.abs(piece.x) + footprint(piece)).toBeLessThanOrEqual(
            BACKDROP_GROUND_HALF + 1e-6,
          );
          expect(Math.abs(piece.z) + footprint(piece)).toBeLessThanOrEqual(
            BACKDROP_GROUND_HALF + 1e-6,
          );
        }
      }
      if (layout.sea) {
        // Kıyı pistin dış korkuluğundan uzakta ve kalan ağaçların (taç ~10 m) ötesinde;
        // denizde kara tepesi merkezi yok.
        expect(layout.sea.minZ - geometry.turnRadiusMeters).toBe(SEA_SHORE_DISTANCE);
        expect(SEA_SHORE_DISTANCE).toBeGreaterThanOrEqual(100);
        expect(layout.sea.minZ).toBeGreaterThan(treeLineMaxZ('sea', geometry)! + 30);
        for (const piece of layout.pieces.filter((p) => p.kind === 'hill')) {
          expect(piece.z).toBeLessThan(layout.sea.minZ);
        }
      } else {
        expect(treeLineMaxZ(hippodrome.theme.backdrop, geometry)).toBeNull();
      }
    });
  }

  it('karlı zirvede kar örtüsü zirvenin tepesine oturur', () => {
    const bursa = CONFIG.hippodromes.find((h) => h.theme.backdrop === 'mountains')!;
    const layout = computeBackdropLayout('mountains', hippodromeTrackGeometry(bursa));
    const snow = layout.pieces.filter((piece) => piece.kind === 'snow');
    expect(snow.length).toBeGreaterThan(0);
    for (const cap of snow) {
      const peak = layout.pieces.find(
        (piece) => piece.kind === 'peak' && piece.x === cap.x && piece.z === cap.z,
      )!;
      expect(cap.y + cap.sy).toBeGreaterThanOrEqual(peak.sy);
      expect(cap.y).toBeGreaterThan(peak.sy / 2);
    }
  });
});

describe('lobi formu', () => {
  it('varsayılan hipodromu gönderir, seçileni gönderir; rozet hipodrom adını yazar', () => {
    const lobby = loadRaceLobbyConfig();
    const form = { ...defaultLobbyRaceForm(lobby), name: 'Ege Kupası' };
    const now = new Date('2026-10-08T10:00:00Z');
    const plain = buildCreateRaceBody(form, now, lobby);
    expect(plain.ok && plain.body.hippodrome).toBe(DEFAULT_HIPPODROME_KEY);
    const izmir = buildCreateRaceBody({ ...form, hippodrome: 'izmir' }, now, lobby);
    expect(izmir.ok && izmir.body.hippodrome).toBe('izmir');
    expect(describeHippodrome({ hippodrome: 'izmir' })).toContain(resolveHippodrome('izmir').name);
    expect(describeHippodrome({ hippodrome: undefined as unknown as string })).toBeNull();
  });
});
