/**
 * Ücretli lobi yarışı — ekranın SAF mantığı (30.09.2026). React'ten bağımsız
 * tutulur ki kuralları DOM olmadan test edilebilsin
 * (`test/features/race-lobby/lobby-logic.spec.ts`).
 *
 * **HİÇBİR ŞEY OTORİTE DEĞİLDİR.** Seçenek listeleri ve sınırlar sunucuyla
 * AYNI dosyadan (`config/race-lobby.config.json`) okunur, ama sunucu
 * `validateRaceCreation` ile bağımsız doğrular; burada yakalanmayan bir
 * hata sunucudan 400 olarak döner ve olduğu gibi gösterilir. Giriş ücreti,
 * havuz ve çarpan HER ZAMAN sunucunun lobi satırından okunur.
 */

import type { RaceEntryStatus, RaceLobbyListItem, RaceSurface, RaceWeather } from '@at-sevdalisi/shared-types';
import type { RaceLobbyConfig } from '@at-sevdalisi/game-config';
import type { CreateLobbyRaceBody } from '../../lib/api-client';

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

export const SURFACE_LABELS: Record<RaceSurface, string> = {
  grass: 'Çim',
  dirt: 'Kum',
  synthetic: 'Sentetik',
};

export const WEATHER_LABELS: Record<RaceWeather, string> = {
  sunny: 'Güneşli',
  rainy: 'Yağmurlu',
  windy: 'Rüzgârlı',
  cloudy: 'Bulutlu',
  hot: 'Sıcak',
  cold: 'Soğuk',
};

export const ENTRY_STATUS_LABELS: Record<RaceEntryStatus, string> = {
  waiting: 'Katıldın — hazır değilsin',
  ready: 'Hazırsın',
  not_ready: 'Katıldın — hazır değilsin',
  cancelled: 'Ayrıldın',
};

/** Yarış oluşturma formunun ham alanları (tümü `<select>`/`<input>`tan). */
export interface LobbyRaceForm {
  name: string;
  fieldSize: number;
  maxPlayers: number;
  /** `0` = ücretsiz yarış; aksi hâlde `paidEntryFeeOptions`tan biri. */
  entryFee: number;
  startDelayMinutes: number;
  surface: RaceSurface;
  weather: RaceWeather;
  distanceMeters: number;
  tribuneFee: number;
  spectatorCapacity: number;
}

/**
 * Seçilen at sayısı için geçerli oyuncu tavanları. Sunucu kuralı
 * (`validateRaceCreation`): `minPlayers ≤ maxPlayers ≤ min(fieldSize,
 * config.maxPlayers)`. Alt sınırın gerekçesi sunucudadır: altında bir tavan
 * yarışın hiç başlayamamasına yol açar.
 */
export function maxPlayersOptions(fieldSize: number, config: RaceLobbyConfig): number[] {
  const upper = Math.min(fieldSize, config.maxPlayers);
  const options: number[] = [];
  for (let value = config.minPlayers; value <= upper; value += 1) {
    options.push(value);
  }
  return options;
}

/** Başlangıç gecikmesinin dakika cinsinden sınırları — `startDelaySeconds`ten türetilir. */
export function startDelayMinuteBounds(config: RaceLobbyConfig): { min: number; max: number } {
  return {
    min: Math.ceil(config.startDelaySeconds.min / SECONDS_PER_MINUTE),
    max: Math.floor(config.startDelaySeconds.max / SECONDS_PER_MINUTE),
  };
}

/** Formun başlangıç değerleri — hepsi config listelerinin İLK elemanı; uydurma sabit yok. */
export function defaultLobbyRaceForm(config: RaceLobbyConfig): LobbyRaceForm {
  const fieldSize = config.fieldSizes[0] ?? config.minPlayers;
  return {
    name: '',
    fieldSize,
    maxPlayers: maxPlayersOptions(fieldSize, config).at(-1) ?? config.minPlayers,
    entryFee: config.paidEntryFeeOptions[0] ?? 0,
    startDelayMinutes: startDelayMinuteBounds(config).min,
    surface: (config.allowedSurfaces[0] ?? 'grass') as RaceSurface,
    weather: (config.allowedWeather[0] ?? 'sunny') as RaceWeather,
    distanceMeters: config.distanceMeters.min,
    tribuneFee: config.tribuneFeeOptions[0] ?? 0,
    spectatorCapacity: config.spectatorCapacityOptions[0] ?? 0,
  };
}

export type BuildCreateRaceResult = { ok: true; body: CreateLobbyRaceBody } | { ok: false; problem: string };

/**
 * Formu `POST /races` gövdesine çevirir. İstemci tarafı kontroller yalnızca
 * oyuncuyu gereksiz bir 400'den korumak içindir; sunucu aynılarını ayrıca
 * yapar. `startTime` = `now + startDelayMinutes` — sunucu en az
 * `startDelaySeconds.min` ileri bir zaman ister.
 */
export function buildCreateRaceBody(form: LobbyRaceForm, now: Date, config: RaceLobbyConfig): BuildCreateRaceResult {
  const name = form.name.trim();
  if (name.length < config.nameLength.min || name.length > config.nameLength.max) {
    return {
      ok: false,
      problem: `Yarış adı ${config.nameLength.min}–${config.nameLength.max} karakter olmalıdır.`,
    };
  }
  if (!maxPlayersOptions(form.fieldSize, config).includes(form.maxPlayers)) {
    return { ok: false, problem: 'Oyuncu tavanı at sayısıyla uyumlu değil.' };
  }
  if (form.distanceMeters < config.distanceMeters.min || form.distanceMeters > config.distanceMeters.max) {
    return {
      ok: false,
      problem: `Mesafe ${config.distanceMeters.min}–${config.distanceMeters.max} m arasında olmalıdır.`,
    };
  }
  const delaySeconds = form.startDelayMinutes * SECONDS_PER_MINUTE;
  if (delaySeconds < config.startDelaySeconds.min || delaySeconds > config.startDelaySeconds.max) {
    const bounds = startDelayMinuteBounds(config);
    return { ok: false, problem: `Başlangıç ${bounds.min}–${bounds.max} dakika sonra olmalıdır.` };
  }
  return {
    ok: true,
    body: {
      name,
      fieldSize: form.fieldSize,
      maxPlayers: form.maxPlayers,
      entryFee: form.entryFee,
      raceType: form.entryFee > 0 ? 'paid' : 'free',
      startTime: new Date(now.getTime() + delaySeconds * MS_PER_SECOND).toISOString(),
      surface: form.surface,
      weather: form.weather,
      distanceMeters: form.distanceMeters,
      tribuneFee: form.tribuneFee,
      spectatorCapacity: form.spectatorCapacity,
    },
  };
}

/** Bir lobi satırında oyuncuya hangi düğmelerin açık olduğu — TEK kaynak. */
export interface LobbyEntryActions {
  canJoin: boolean;
  canMarkReady: boolean;
  canMarkNotReady: boolean;
  canLeave: boolean;
}

/**
 * `myEntry`den düğme durumunu türetir. Kurallar sunucununkilerin aynısıdır:
 *  - katılım yoksa yalnızca "Katıl" (dolu yarışta kapalı);
 *  - `waiting`/`not_ready` → "Hazırım" + "Ayrıl";
 *  - `ready` → "Hazır değilim" + "Ayrıl";
 *  - `cancelled` → hiçbir düğme: aynı yarışa yeniden katılınamaz
 *    (`RACE_ENTRY_CANCELLED`).
 */
export function lobbyEntryActions(race: RaceLobbyListItem): LobbyEntryActions {
  const entry = race.myEntry;
  if (entry === null) {
    return {
      canJoin: race.joinedPlayers < race.maxPlayers,
      canMarkReady: false,
      canMarkNotReady: false,
      canLeave: false,
    };
  }
  if (entry.status === 'cancelled') {
    return { canJoin: false, canMarkReady: false, canMarkNotReady: false, canLeave: false };
  }
  return {
    canJoin: false,
    canMarkReady: entry.status !== 'ready',
    canMarkNotReady: entry.status === 'ready',
    canLeave: true,
  };
}

/** "12 dk sonra" / "1 sa 5 dk sonra" / "başlıyor". Saniye hassasiyeti bilinçli olarak yok. */
export function formatStartsIn(startTime: string, now: Date): string {
  const minutes = Math.floor((new Date(startTime).getTime() - now.getTime()) / (SECONDS_PER_MINUTE * MS_PER_SECOND));
  if (minutes <= 0) {
    return 'başlıyor';
  }
  const hours = Math.floor(minutes / SECONDS_PER_MINUTE);
  const rest = minutes % SECONDS_PER_MINUTE;
  return hours > 0 ? `${hours} sa ${rest} dk sonra` : `${rest} dk sonra`;
}
