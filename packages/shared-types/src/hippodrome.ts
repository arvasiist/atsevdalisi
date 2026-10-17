/**
 * HİPODROM KATALOĞU (16.10.2026, brief §9) — `GET /hippodromes`.
 *
 * Kaynak `config/hippodromes.config.json` (pistler) + `economy.raceTiers`
 * (masaların bedeli/at sayısı) + `race-lobby.calendar.programs` (pistin
 * takvimi). Sıradaki yarış saatleri SUNUCUDA, takvim zamanlayıcısının
 * kullandığı aynı saf fonksiyonla hesaplanır — ekran ile açılan yarış
 * ayrışamaz. Salt okuma; para/sonuç etkisi YOK.
 */

export type HippodromeLevelKey = 'local' | 'regional' | 'national' | 'international';

export interface HippodromeTableView {
  id: string;
  label: string;
  entryFee: number;
  fieldSize: number;
  /** Kazananın havuzdan aldığı pay (yüzde, dağılımın ilk payı). */
  winnerSharePercent: number;
}

export interface HippodromeProgramView {
  id: string;
  name: string;
  surface: string;
  distanceMeters: number;
  entryFee: number;
  fieldSize: number;
  intervalMinutes: number;
  featured: boolean;
  tableId: string | null;
  breedClass: string | null;
  horseLevelBracket: string | null;
  /** Sıradaki yuvalar (ISO), en fazla üç. */
  nextStartTimes: string[];
}

export interface HippodromeView {
  key: string;
  name: string;
  shortName: string;
  country: string;
  countryCode: string;
  city: string;
  level: HippodromeLevelKey;
  /** 1–5. */
  prestige: number;
  surfaces: string[];
  distancesMeters: number[];
  lapLengthMeters: number;
  tables: HippodromeTableView[];
  programs: HippodromeProgramView[];
}

export interface HippodromeCatalogView {
  hippodromes: HippodromeView[];
  /** Kataloğun hesaplandığı sunucu saati (ISO). */
  generatedAt: string;
}
