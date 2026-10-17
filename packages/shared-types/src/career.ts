/**
 * KARİYER (16.10.2026, brief §10) — `GET /career`. Puan bitmiş yarış
 * sonuçlarından TÜRETİLİR (sayaç yok); kademe masaları ve pist seviyelerini
 * birikimli açar. Kademe ödülleri başarım olarak alınır (`career_points`).
 */

export interface CareerTierRef {
  key: string;
  name: string;
}

export interface CareerTierView extends CareerTierRef {
  requiredPoints: number;
  description: string;
  unlocksTables: Array<{ id: string; label: string }>;
  unlocksHippodromes: Array<{ key: string; name: string }>;
  reached: boolean;
}

export interface CareerRaceView {
  raceId: string;
  raceName: string;
  startTime: string;
  hippodrome: string;
  classKey: string;
  classLabel: string;
  finishPosition: number;
  fieldSize: number;
  points: number;
}

export interface CareerPointsRowView {
  classKey: string;
  classLabel: string;
  /** [1., 2., 3., diğer bitiriş]. */
  points: [number, number, number, number];
}

export interface CareerView {
  points: number;
  tier: CareerTierRef & { index: number };
  next: (CareerTierRef & { requiredPoints: number; pointsToNext: number }) | null;
  tiers: CareerTierView[];
  racePoints: CareerPointsRowView[];
  history: CareerRaceView[];
}

/** Lobi satırı: çağıranın kademesi bu yarışa yetmiyorsa gereken kademe. */
export interface CareerRequirementView extends CareerTierRef {
  pointsToRequired: number;
}
