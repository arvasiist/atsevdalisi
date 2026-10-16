/**
 * HİPODROM SEÇİMİ (08.10.2026, sahibinin isteği: "sadece Veliefendi değil
 * başka koşu alanları da"). Sunucu yarışın hipodrom ANAHTARINI verir
 * (`RaceLobbyView.hippodrome`, `RaceTimelineView.hippodrome`, …); ölçü ve
 * görsel kimlik `config/hippodromes.config.json`dadır. Bilinmeyen/eksik anahtar
 * varsayılan hipodroma (Veliefendi) düşer — sahne asla kırılmaz. Salt sunum:
 * pist ölçüsü motora girmez, sonuç değişmez. three.js içe aktarmaz.
 */
import { loadHippodromesConfig, type HippodromeConfig } from '@at-sevdalisi/game-config';
import { createStadiumTrackGeometry, type StadiumTrackGeometry } from './track-path';

const CONFIG = loadHippodromesConfig();

export const DEFAULT_HIPPODROME_KEY = CONFIG.defaultKey;

/** Seçim listesi (lobi formu) — config sırası. */
export const HIPPODROME_OPTIONS: ReadonlyArray<Pick<HippodromeConfig, 'key' | 'name' | 'shortName' | 'city'>> =
  CONFIG.hippodromes.map(({ key, name, shortName, city }) => ({ key, name, shortName, city }));

export function resolveHippodrome(key?: string | null): HippodromeConfig {
  return (
    CONFIG.hippodromes.find((hippodrome) => hippodrome.key === key) ??
    CONFIG.hippodromes.find((hippodrome) => hippodrome.key === CONFIG.defaultKey) ??
    CONFIG.hippodromes[0]!
  );
}

/** Hipodromun pist geometrisi (tur uzunluğu + viraj yarıçapı). */
export function hippodromeTrackGeometry(hippodrome: HippodromeConfig): StadiumTrackGeometry {
  return createStadiumTrackGeometry(hippodrome.lapLengthMeters, hippodrome.turnRadiusMeters);
}

/** HUD alt satırı için kısa ad: "İzmir Şirinyer Hipodromu". */
export function hippodromeLabel(key?: string | null): string {
  return resolveHippodrome(key).name;
}
