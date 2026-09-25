/**
 * Pist geometrisi — brief §22-23, `docs/GAME_DESIGN.md` §6 (Yarış ekranı).
 *
 * Bu modül SAF, framework'ten bağımsız matematik içerir: bir "stadyum"
 * (iki düz kenar + iki yarım daire viraj) şekli tanımlar ve yarış
 * mesafesindeki (metre) herhangi bir noktayı, bu şeklin üzerindeki bir
 * 3D (x, z) koordinatına ve bakış açısına (headingRadians) çevirir.
 *
 * FAZ 6 kapsamında GERÇEK bir pist modeli (brief'teki `Track.turnCount`,
 * `trackWidthMeters` gibi alanlardan tam ölçekli bir 3D pist üretmek)
 * KAPSAM DIŞIDIR — bunun yerine görsel iskelet için tek, sabit bir
 * "varsayılan tur uzunluğu" (bkz. `DEFAULT_LAP_LENGTH_METERS`) kullanılır.
 * Gerçek pist boyutlarının (`Track.lengthMeters`) sahneye yansıtılması,
 * gerçek 3D pist modelleri eklendiğinde ele alınacaktır (bkz. README.md
 * "Kapsam dışı" bölümü).
 *
 * Three.js ekseni kuralı: Y yukarıdır; pist XZ düzlemindedir (Y=0).
 */

export const DEFAULT_LAP_LENGTH_METERS = 2000;
export const DEFAULT_TURN_RADIUS_METERS = 60;

export interface StadiumTrackGeometry {
  /** Her bir düz kenarın uzunluğu (metre). */
  straightLengthMeters: number;
  /** Her bir yarım daire virajın yarıçapı (metre). */
  turnRadiusMeters: number;
  /** Toplam tur uzunluğu (metre) — iki düz kenar + iki viraj çevresi. */
  lapLengthMeters: number;
}

/**
 * Verilen tur uzunluğu ve viraj yarıçapından bir stadyum geometrisi üretir.
 * `turnRadiusMeters` çok büyükse (virajların çevresi tur uzunluğunu
 * aşıyorsa) düz kenar uzunluğu 0'a sabitlenir (dejenere ama geçerli bir
 * "tam yuvarlak" pist üretir) — asla negatif olmaz.
 */
export function createStadiumTrackGeometry(
  lapLengthMeters: number,
  turnRadiusMeters: number = DEFAULT_TURN_RADIUS_METERS,
): StadiumTrackGeometry {
  const safeLapLength = Math.max(0, lapLengthMeters);
  const safeTurnRadius = Math.max(0, turnRadiusMeters);
  const turnsLengthMeters = 2 * Math.PI * safeTurnRadius;
  const straightLengthMeters = Math.max(0, (safeLapLength - turnsLengthMeters) / 2);
  return {
    straightLengthMeters,
    turnRadiusMeters: safeTurnRadius,
    lapLengthMeters: 2 * straightLengthMeters + turnsLengthMeters,
  };
}

export interface TrackPathPoint {
  x: number;
  z: number;
  /** Radyan cinsinden bakış açısı (0 = +X yönü). */
  headingRadians: number;
}

/**
 * Stadyum pisti üzerinde, tur başlangıcından itibaren `distanceMeters`
 * kadar ilerlemiş bir noktanın (x, z, heading) değerini döner.
 * `distanceMeters`, tur uzunluğunu aşarsa veya negatifse otomatik olarak
 * `[0, lapLengthMeters)` aralığına sarılır (bkz. `wrapDistance`) — böylece
 * tek turdan uzun mesafeli yarışlar (örn. 2400m'lik yarış, 2000m'lik tur)
 * pist üzerinde doğal olarak ikinci bir tura devam eder.
 */
export function getPointOnStadiumTrack(distanceMeters: number, geometry: StadiumTrackGeometry): TrackPathPoint {
  const { straightLengthMeters: straight, turnRadiusMeters: radius, lapLengthMeters } = geometry;

  if (lapLengthMeters <= 0) {
    return { x: 0, z: 0, headingRadians: 0 };
  }

  const distance = wrapDistance(distanceMeters, lapLengthMeters);
  const halfStraight = straight / 2;
  const turnArcLength = Math.PI * radius;

  if (distance < straight) {
    // Alt düz kenar: soldan sağa (+X yönünde).
    return { x: -halfStraight + distance, z: -radius, headingRadians: 0 };
  }

  const afterBottomStraight = distance - straight;
  if (afterBottomStraight < turnArcLength) {
    // Sağ viraj (merkezi (halfStraight, 0), alt düzden üst düze).
    const angle = -Math.PI / 2 + (radius > 0 ? afterBottomStraight / radius : 0);
    return pointOnTurn(halfStraight, 0, radius, angle);
  }

  const afterRightTurn = afterBottomStraight - turnArcLength;
  if (afterRightTurn < straight) {
    // Üst düz kenar: sağdan sola (-X yönünde).
    return { x: halfStraight - afterRightTurn, z: radius, headingRadians: Math.PI };
  }

  // Sol viraj (merkezi (-halfStraight, 0), üst düzden alt düze — tur kapanır).
  const afterTopStraight = afterRightTurn - straight;
  const angle = Math.PI / 2 + (radius > 0 ? afterTopStraight / radius : 0);
  return pointOnTurn(-halfStraight, 0, radius, angle);
}

/**
 * Viraj yoksa (brief'teki `Track.turnCount === 0` — düz sprint pisti),
 * pist eğrisi yerine düz bir çizgi kullanılır: `x = distanceMeters, z = 0`.
 */
export function getPointOnStraightTrack(distanceMeters: number): TrackPathPoint {
  return { x: distanceMeters, z: 0, headingRadians: 0 };
}

/**
 * `Track.turnCount`'a göre düz veya stadyum pist noktası seçer — brief'in
 * hem düz sprint pistlerini hem de virajlı pistleri tanımlamasına
 * (`Track.turnCount`) karşılık gelir.
 */
export function getHorseTrackPosition(
  distanceMeters: number,
  turnCount: number,
  geometry: StadiumTrackGeometry,
): TrackPathPoint {
  if (turnCount <= 0) {
    return getPointOnStraightTrack(distanceMeters);
  }
  return getPointOnStadiumTrack(distanceMeters, geometry);
}

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §18 "HOOF_TURN" (bu
 * turda EKLENDİ) — `getPointOnStadiumTrack`'in İÇİNDE ZATEN hesaplanan
 * "hangi segmentteyim" mantığının (düz kenar / viraj) `boolean` bir
 * ÖZETİ. Bu, at sesi katmanının viraj sırasında farklı bir nal sesi
 * çalması için GEREKEN GERÇEK, spekülatif OLMAYAN bir sinyaldir —
 * `getPointOnStadiumTrack`'İ ÇAĞIRAN taraf zaten `distanceMeters`e
 * sahip olduğundan, aynı geometriyle AYNI segment sınırlarını (düz
 * kenar uzunluğu + viraj yay uzunluğu) kullanır, YENİ bir hesaplama
 * İCAT ETMEZ. `turnCount <= 0` (düz sprint pisti) için HER ZAMAN
 * `false` döner — viraj YOKTUR.
 */
export function isOnTrackTurn(distanceMeters: number, turnCount: number, geometry: StadiumTrackGeometry): boolean {
  if (turnCount <= 0 || geometry.lapLengthMeters <= 0) {
    return false;
  }
  const { straightLengthMeters: straight, turnRadiusMeters: radius, lapLengthMeters } = geometry;
  const distance = wrapDistance(distanceMeters, lapLengthMeters);
  const turnArcLength = Math.PI * radius;

  if (distance < straight) {
    return false; // Alt düz kenar.
  }
  const afterBottomStraight = distance - straight;
  if (afterBottomStraight < turnArcLength) {
    return true; // Sağ viraj.
  }
  const afterRightTurn = afterBottomStraight - turnArcLength;
  if (afterRightTurn < straight) {
    return false; // Üst düz kenar.
  }
  return true; // Sol viraj (tur kapanışı).
}

/**
 * "REALISTIC 3D ASSET & AUDIO PRODUCTION BRIEF" §9 "Tribün/kalabalık"
 * (bu turda EKLENDİ) — pist ORTA HATTINDAN (`getHorseTrackPosition`in
 * döndürdüğü nokta) `offsetMeters` kadar PİSTİN DIŞINA doğru kaydırılmış
 * bir nokta. Tribün billboard'larının (`RaceScene3D.tsx`teki
 * `CrowdBillboards`, bu turda EKLENDİ) pist boyunca, pistin İÇİNE
 * TAŞMADAN yerleştirilebilmesi için gerekli GERÇEK bir geometri
 * hesabıdır — `TrackSurface`'ın tile'ları GİBİ SAF ve bu ortamda `tsc`/
 * `tsx` ile GERÇEKTEN doğrulanabilir (üç.js'e bağımlı DEĞİLDİR).
 *
 * Yöntem: `distanceMeters` ve `distanceMeters + epsilon`'daki iki merkez
 * hattı noktası arasındaki teğet (tangent) vektör çıkarılır, bu vektör
 * 90° döndürülerek pistin dışına bakan normal ELDE EDİLİR — bu, düz
 * kenarlarda VE virajlarda AYNI kod yoluyla çalışır, virajın merkez
 * noktasını (`pointOnTurn`in `centerX`/`centerZ`si) AYRICA BİLMEYE
 * GEREK DUYMAZ. Döndürme yönü (teğeti SAAT YÖNÜNDE 90° çevirmek —
 * `(dx,dz) → (dz,-dx)`), bu pistin KENDİ traversal yönüyle (bkz.
 * `getPointOnStadiumTrack`in sağ viraj → üst düz → sol viraj sıralaması)
 * TUTARLI olacak şekilde alt düz kenar (z=-radius, dışı DAHA NEGATİF z),
 * üst düz kenar (z=+radius, dışı DAHA POZİTİF z) VE her iki viraj için
 * elle DOĞRULANMIŞTIR (bkz. `track-path.spec.ts`teki test'ler — dört
 * segmentin HER BİRİNDE beklenen yöne göre bir nokta üretir).
 *
 * Dejenere geometri (`lapLengthMeters <= 0`) veya teğet sıfır çıkarsa
 * (teorik olarak imkansız ama savunmacı programlama) OFFSET UYGULANMADAN
 * orijinal nokta döner — `isOnTrackTurn`in "bölme hatası oluşturmaz"
 * disipliniyle AYNI.
 */
export function getOutwardBoundaryPoint(
  distanceMeters: number,
  turnCount: number,
  geometry: StadiumTrackGeometry,
  offsetMeters: number,
): TrackPathPoint {
  const TANGENT_EPSILON_METERS = 0.5;
  const point = getHorseTrackPosition(distanceMeters, turnCount, geometry);
  const ahead = getHorseTrackPosition(distanceMeters + TANGENT_EPSILON_METERS, turnCount, geometry);
  const tangentX = ahead.x - point.x;
  const tangentZ = ahead.z - point.z;
  const tangentLength = Math.sqrt(tangentX * tangentX + tangentZ * tangentZ);
  if (tangentLength === 0) {
    return point;
  }
  const normalizedTangentX = tangentX / tangentLength;
  const normalizedTangentZ = tangentZ / tangentLength;
  const outwardX = normalizedTangentZ;
  const outwardZ = -normalizedTangentX;
  return {
    x: point.x + outwardX * offsetMeters,
    z: point.z + outwardZ * offsetMeters,
    headingRadians: point.headingRadians,
  };
}

function pointOnTurn(centerX: number, centerZ: number, radius: number, angleRadians: number): TrackPathPoint {
  const x = centerX + radius * Math.cos(angleRadians);
  const z = centerZ + radius * Math.sin(angleRadians);
  const headingRadians = Math.atan2(Math.cos(angleRadians), -Math.sin(angleRadians));
  return { x, z, headingRadians };
}

function wrapDistance(distance: number, lapLengthMeters: number): number {
  const wrapped = distance % lapLengthMeters;
  return wrapped < 0 ? wrapped + lapLengthMeters : wrapped;
}
