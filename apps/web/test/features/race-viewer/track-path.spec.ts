import { describe, expect, it } from 'vitest';
import {
  createStadiumTrackGeometry,
  getHorseTrackPosition,
  getOutwardBoundaryPoint,
  getPointOnStadiumTrack,
  getPointOnStraightTrack,
  isOnTrackTurn,
  DEFAULT_LAP_LENGTH_METERS,
  DEFAULT_TURN_RADIUS_METERS,
} from '../../../src/features/race-viewer/track-path';

describe('createStadiumTrackGeometry', () => {
  it('düz kenar + viraj çevresi toplamı lapLengthMeters ile tutarlıdır', () => {
    const geometry = createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS);
    const turnsLength = 2 * Math.PI * geometry.turnRadiusMeters;
    expect(geometry.lapLengthMeters).toBeCloseTo(2 * geometry.straightLengthMeters + turnsLength, 6);
  });

  it('viraj çevresi tur uzunluğunu aşarsa düz kenar 0 olur, negatif olmaz', () => {
    const geometry = createStadiumTrackGeometry(10, 1000);
    expect(geometry.straightLengthMeters).toBe(0);
  });

  it('negatif girdi verilse bile geçerli (negatif olmayan) bir geometri üretir', () => {
    const geometry = createStadiumTrackGeometry(-500, -10);
    expect(geometry.straightLengthMeters).toBeGreaterThanOrEqual(0);
    expect(geometry.turnRadiusMeters).toBeGreaterThanOrEqual(0);
    expect(geometry.lapLengthMeters).toBeGreaterThanOrEqual(0);
  });
});

describe('getPointOnStadiumTrack', () => {
  const geometry = createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS);

  it('tur başlangıcı, alt düz kenarın en sol noktasıdır (z = -radius)', () => {
    const point = getPointOnStadiumTrack(0, geometry);
    expect(point.z).toBeCloseTo(-geometry.turnRadiusMeters, 6);
    expect(point.headingRadians).toBeCloseTo(0, 6);
  });

  it('alt düz kenar boyunca sadece x değişir, z ve heading sabit kalır', () => {
    const start = getPointOnStadiumTrack(0, geometry);
    const mid = getPointOnStadiumTrack(geometry.straightLengthMeters / 2, geometry);
    expect(mid.z).toBeCloseTo(start.z, 6);
    expect(mid.headingRadians).toBeCloseTo(start.headingRadians, 6);
    expect(mid.x).toBeGreaterThan(start.x);
  });

  it('tam bir tur sonunda başlangıç noktasına döner (wrap-around)', () => {
    const start = getPointOnStadiumTrack(0, geometry);
    const afterOneLap = getPointOnStadiumTrack(geometry.lapLengthMeters, geometry);
    expect(afterOneLap.x).toBeCloseTo(start.x, 6);
    expect(afterOneLap.z).toBeCloseTo(start.z, 6);
  });

  it('negatif mesafe de geçerli bir noktaya sarılır (negatif wrap)', () => {
    const point = getPointOnStadiumTrack(-10, geometry);
    const equivalent = getPointOnStadiumTrack(geometry.lapLengthMeters - 10, geometry);
    expect(point.x).toBeCloseTo(equivalent.x, 6);
    expect(point.z).toBeCloseTo(equivalent.z, 6);
  });

  it('virajdaki her nokta merkeze radius kadar uzaklıktadır', () => {
    const afterBottomStraight = geometry.straightLengthMeters + 5;
    const point = getPointOnStadiumTrack(afterBottomStraight, geometry);
    const centerX = geometry.straightLengthMeters / 2;
    const distanceFromCenter = Math.sqrt((point.x - centerX) ** 2 + point.z ** 2);
    expect(distanceFromCenter).toBeCloseTo(geometry.turnRadiusMeters, 6);
  });

  it('üst düz kenarda heading yaklaşık π (ters yön) olur', () => {
    const intoTopStraight = geometry.straightLengthMeters + Math.PI * geometry.turnRadiusMeters + 5;
    const point = getPointOnStadiumTrack(intoTopStraight, geometry);
    expect(point.headingRadians).toBeCloseTo(Math.PI, 6);
    expect(point.z).toBeCloseTo(geometry.turnRadiusMeters, 6);
  });
});

describe('getPointOnStraightTrack', () => {
  it('z her zaman 0 ve x mesafeye eşittir', () => {
    const point = getPointOnStraightTrack(742);
    expect(point.x).toBe(742);
    expect(point.z).toBe(0);
    expect(point.headingRadians).toBe(0);
  });
});

describe('getHorseTrackPosition', () => {
  const geometry = createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS);

  it('turnCount 0 ise düz pist mantığını kullanır', () => {
    const point = getHorseTrackPosition(300, 0, geometry);
    expect(point.z).toBe(0);
    expect(point.x).toBe(300);
  });

  it('turnCount pozitifse stadyum pist mantığını kullanır', () => {
    const point = getHorseTrackPosition(300, 2, geometry);
    const direct = getPointOnStadiumTrack(300, geometry);
    expect(point).toEqual(direct);
  });
});

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §18 "HOOF_TURN" (bu
 * turda EKLENDİ) — `getPointOnStadiumTrack`'in İÇSEL segment mantığının
 * dışarıya açılan `boolean` özeti, ses katmanının GERÇEK bir pist
 * geometrisi sinyaline dayanabilmesi için.
 */
describe('isOnTrackTurn', () => {
  const geometry = createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS);

  it('turnCount 0 ise (düz sprint pisti) HER ZAMAN false döner', () => {
    expect(isOnTrackTurn(500, 0, geometry)).toBe(false);
    expect(isOnTrackTurn(0, 0, geometry)).toBe(false);
  });

  it('alt düz kenardayken false döner', () => {
    expect(isOnTrackTurn(0, 2, geometry)).toBe(false);
    expect(isOnTrackTurn(geometry.straightLengthMeters - 1, 2, geometry)).toBe(false);
  });

  it('sağ virajdayken true döner', () => {
    const midRightTurn = geometry.straightLengthMeters + (Math.PI * geometry.turnRadiusMeters) / 2;
    expect(isOnTrackTurn(midRightTurn, 2, geometry)).toBe(true);
  });

  it('üst düz kenardayken false döner', () => {
    const midTopStraight = geometry.straightLengthMeters + Math.PI * geometry.turnRadiusMeters + geometry.straightLengthMeters / 2;
    expect(isOnTrackTurn(midTopStraight, 2, geometry)).toBe(false);
  });

  it('sol virajdayken (tur kapanışı) true döner', () => {
    const midLeftTurn = 2 * geometry.straightLengthMeters + Math.PI * geometry.turnRadiusMeters * 1.5;
    expect(isOnTrackTurn(midLeftTurn, 2, geometry)).toBe(true);
  });

  it('distanceMeters tur uzunluğunu aşarsa (ikinci tur) doğru sarılır (wrap)', () => {
    const midRightTurn = geometry.straightLengthMeters + (Math.PI * geometry.turnRadiusMeters) / 2;
    expect(isOnTrackTurn(midRightTurn + geometry.lapLengthMeters, 2, geometry)).toBe(true);
  });

  it('lapLengthMeters 0 ise false döner (bölme hatası oluşturmaz)', () => {
    // NOT: turnRadiusMeters=1000 verilse bile lapLengthMeters SIFIR
    // OLMAZ (viraj çevresi TEK BAŞINA ~6283m üretir, bkz.
    // `createStadiumTrackGeometry`) — GERÇEKTEN dejenere (lapLengthMeters
    // === 0) bir geometri için turnRadiusMeters'IN DA 0 olması gerekir.
    const degenerate = createStadiumTrackGeometry(0, 0);
    expect(degenerate.lapLengthMeters).toBe(0);
    expect(isOnTrackTurn(50, 2, degenerate)).toBe(false);
  });

  it('getPointOnStadiumTrack ile AYNI segment sınırlarını kullanır (viraj noktasında yarıçap tutarlılığı üzerinden dolaylı doğrulama)', () => {
    // isOnTrackTurn true dediği bir noktada, getPointOnStadiumTrack'in
    // döndürdüğü konum GERÇEKTEN merkeze turnRadiusMeters uzaklıkta olmalı
    // (düz kenarda bu KESİNLİKLE yanlış olurdu, viraj merkezine göre
    // ölçüldüğünde) — iki fonksiyonun AYNI segment mantığını paylaştığının
    // dolaylı kanıtı.
    const midRightTurn = geometry.straightLengthMeters + (Math.PI * geometry.turnRadiusMeters) / 2;
    expect(isOnTrackTurn(midRightTurn, 2, geometry)).toBe(true);
    const point = getPointOnStadiumTrack(midRightTurn, geometry);
    const centerX = geometry.straightLengthMeters / 2;
    const distanceFromCenter = Math.sqrt((point.x - centerX) ** 2 + point.z ** 2);
    expect(distanceFromCenter).toBeCloseTo(geometry.turnRadiusMeters, 6);
  });
});

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §9 "Tribün/kalabalık" (bu
 * turda EKLENDİ) — `getOutwardBoundaryPoint`in dört pist segmentinin
 * (alt düz kenar, sağ viraj, üst düz kenar, sol viraj) HER BİRİNDE
 * pistin GERÇEKTEN dışına (merkeze DEĞİL) doğru bir nokta ürettiğini
 * doğrular — fonksiyonun kendi doc yorumundaki elle yapılan türev
 * analizinin GERÇEK kod üzerinde çalıştırılmış hâli.
 */
describe('getOutwardBoundaryPoint', () => {
  const geometry = createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS);
  const OFFSET_METERS = 25;

  it('alt düz kenarda dışa (daha negatif z) doğru kayar, x değişmez', () => {
    const base = getPointOnStadiumTrack(0, geometry);
    const outward = getOutwardBoundaryPoint(0, 2, geometry, OFFSET_METERS);
    expect(outward.x).toBeCloseTo(base.x, 6);
    expect(outward.z).toBeCloseTo(base.z - OFFSET_METERS, 6);
  });

  it('üst düz kenarda dışa (daha pozitif z) doğru kayar, x değişmez', () => {
    const midTopStraight = geometry.straightLengthMeters + Math.PI * geometry.turnRadiusMeters + geometry.straightLengthMeters / 2;
    const base = getPointOnStadiumTrack(midTopStraight, geometry);
    const outward = getOutwardBoundaryPoint(midTopStraight, 2, geometry, OFFSET_METERS);
    expect(outward.x).toBeCloseTo(base.x, 6);
    expect(outward.z).toBeCloseTo(base.z + OFFSET_METERS, 6);
  });

  /**
   * NOT: `getOutwardBoundaryPoint` teğeti NÜMERİK bir türevle (sonlu fark,
   * `TANGENT_EPSILON_METERS = 0.5`) hesaplar — virajın (eğrisel) kısmında
   * bu, GERÇEK radyal yöne göre epsilon büyüklüğünde küçük bir sapma
   * üretir (düz kenarlarda YOKTUR, çünkü teğet zaten SABİTTİR). Bu YANLIŞ
   * bir hesaplama DEĞİL, ayrık örnekleme yönteminin BEKLENEN matematiksel
   * davranışıdır — bu yüzden burada `toBeCloseTo(..., 6)` yerine daha
   * gevşek bir hassasiyet (3 ondalık, epsilon'un KENDİSİNDEN çok daha
   * sıkı) kullanılır.
   */
  it('sağ virajda merkezden (halfStraight, 0) UZAKLAŞACAK yönde kayar (merkeze olan mesafe artar)', () => {
    const midRightTurn = geometry.straightLengthMeters + (Math.PI * geometry.turnRadiusMeters) / 2;
    const centerX = geometry.straightLengthMeters / 2;
    const base = getPointOnStadiumTrack(midRightTurn, geometry);
    const outward = getOutwardBoundaryPoint(midRightTurn, 2, geometry, OFFSET_METERS);
    const baseDistance = Math.sqrt((base.x - centerX) ** 2 + base.z ** 2);
    const outwardDistance = Math.sqrt((outward.x - centerX) ** 2 + outward.z ** 2);
    expect(outwardDistance).toBeCloseTo(baseDistance + OFFSET_METERS, 3);
  });

  it('sol virajda merkezden (-halfStraight, 0) UZAKLAŞACAK yönde kayar (merkeze olan mesafe artar)', () => {
    const midLeftTurn = 2 * geometry.straightLengthMeters + Math.PI * geometry.turnRadiusMeters * 1.5;
    const centerX = -(geometry.straightLengthMeters / 2);
    const base = getPointOnStadiumTrack(midLeftTurn, geometry);
    const outward = getOutwardBoundaryPoint(midLeftTurn, 2, geometry, OFFSET_METERS);
    const baseDistance = Math.sqrt((base.x - centerX) ** 2 + base.z ** 2);
    const outwardDistance = Math.sqrt((outward.x - centerX) ** 2 + outward.z ** 2);
    expect(outwardDistance).toBeCloseTo(baseDistance + OFFSET_METERS, 3);
  });

  it('headingRadians orijinal noktadan DEĞİŞMEZ (sadece konum kayar)', () => {
    const base = getPointOnStadiumTrack(0, geometry);
    const outward = getOutwardBoundaryPoint(0, 2, geometry, OFFSET_METERS);
    expect(outward.headingRadians).toBeCloseTo(base.headingRadians, 6);
  });

  it('offsetMeters=0 iken orijinal noktayla BİREBİR aynıdır', () => {
    const base = getPointOnStadiumTrack(300, geometry);
    const outward = getOutwardBoundaryPoint(300, 2, geometry, 0);
    expect(outward.x).toBeCloseTo(base.x, 6);
    expect(outward.z).toBeCloseTo(base.z, 6);
  });

  it('dejenere geometride (lapLengthMeters=0) çökmez, offsetsiz noktayı döner', () => {
    const degenerate = createStadiumTrackGeometry(0, 0);
    const outward = getOutwardBoundaryPoint(50, 2, degenerate, OFFSET_METERS);
    expect(outward.x).toBe(0);
    expect(outward.z).toBe(0);
  });

  it('turnCount 0 ise (düz sprint pisti) tek taraflı ama tutarlı bir offset üretir, çökmez', () => {
    const straightGeometry = createStadiumTrackGeometry(DEFAULT_LAP_LENGTH_METERS, DEFAULT_TURN_RADIUS_METERS);
    const outward = getOutwardBoundaryPoint(500, 0, straightGeometry, OFFSET_METERS);
    expect(outward.x).toBeCloseTo(500, 6);
    expect(Math.abs(outward.z)).toBeCloseTo(OFFSET_METERS, 6);
  });
});
