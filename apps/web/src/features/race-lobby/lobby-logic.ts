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

import type {
  RaceEntryStatus,
  RaceLobbyListItem,
  RaceSurface,
  RaceWeather,
} from '@at-sevdalisi/shared-types';
import type { RaceLobbyConfig, RaceTierConfig } from '@at-sevdalisi/game-config';
import type { CreateLobbyRaceBody } from '../../lib/api-client';
import { loadEconomyConfig, loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { breedLabel, findRaceClass, horseFitsRaceClass } from '../breeds/breed-catalog';
import { DEFAULT_HIPPODROME_KEY, hippodromeLabel } from '../race-viewer/hippodrome-theme';

const lobbyConfig = loadRaceLobbyConfig();

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

export const SURFACE_LABELS: Record<RaceSurface, string> = {
  grass: 'Çim',
  dirt: 'Kum',
  synthetic: 'Sentetik',
};

/** Turnuva kademe adları (30.09.2026, migration 0045). */
export const TOURNAMENT_TIER_LABELS: Record<'bronze' | 'silver' | 'gold', string> = {
  bronze: 'Bronz Kupa',
  silver: 'Gümüş Kupa',
  gold: 'Altın Kupa',
};

/**
 * Turnuva satırının açıklaması — kurallar SUNUCUDAN gelen alanlardan
 * kurulur (`race.tournament`); istemci ödül hesaplamaz.
 */
export function describeTournament(race: RaceLobbyListItem): string | null {
  if (race.tournament === null) {
    return null;
  }
  return `${TOURNAMENT_TIER_LABELS[race.tournament.tier]} · Seviye ${race.tournament.minPlayerLevel}+ · Botsuz final, ödül ilk üçe`;
}

/**
 * Takvim yarışı (01.10.2026, migration 0052) — sunucunun programla açtığı
 * sıradan lobi yarışı; kuralı oyuncunun açtığı yarışla aynıdır.
 */
export function describeCalendar(race: RaceLobbyListItem): string | null {
  if (race.calendar === null) return null;
  // 02.10.2026 (Faz 11) — öne çıkan program (ör. haftalık Pazar Derbisi).
  if (race.calendar.featured) {
    const program = lobbyConfig.calendar.programs.find((candidate) => candidate.id === race.calendar?.programId);
    return `⭐ Özel yarış · ${program?.name ?? 'takvim'}`;
  }
  return 'Takvim yarışı · sunucu açtı';
}

/** 01.10.2026 — kontrollü yarış etiketi. */
export function describePlayerControl(
  race: Pick<RaceLobbyListItem, 'playerControl'>,
): string | null {
  return race.playerControl ? 'Kontrollü · atı sen sürersin (kırbaç, yön)' : null;
}

/** 08.10.2026 — hipodrom rozeti ("📍 İzmir Şirinyer Hipodromu"); alan yoksa (eski sunucu) `null`. */
export function describeHippodrome(race: Pick<RaceLobbyListItem, 'hippodrome'>): string | null {
  if (race.hippodrome === null || race.hippodrome === undefined) {
    return null;
  }
  return `📍 ${hippodromeLabel(race.hippodrome)}`;
}

/**
 * 08.10.2026 — ırk sınıfı rozeti ("Yerli Irklar · Hınıs, Malakan, …").
 * Sınıf adı ve ırk adları `config/breeds.config.json`dan; katalogda olmayan
 * sınıf anahtarı olduğu gibi gösterilir (sessizce "açık" denmez).
 */
export function describeBreedClass(race: Pick<RaceLobbyListItem, 'breedClass'>): string | null {
  if (race.breedClass === null || race.breedClass === undefined) {
    return null;
  }
  const raceClass = findRaceClass(race.breedClass);
  if (raceClass === null) {
    return `Irk sınıfı: ${race.breedClass}`;
  }
  return `Yalnızca ${raceClass.name} · ${raceClass.breeds.map(breedLabel).join(', ')}`;
}

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
  /** 01.10.2026 — atı oyuncular sürer (kırbaç/yön); yarış kilitten sonra canlı akar. */
  playerControl: boolean;
  /** 08.10.2026 — ırk sınıfı anahtarı; `''` = her ırka açık. */
  breedClass: string;
  /** 08.10.2026 — hipodrom anahtarı (`hippodromes.config.json`). */
  hippodrome: string;
  /** 08.10.2026 — at seviyesi aralığı anahtarı; `''` = her seviyeye açık. */
  horseLevelBracket: string;
  /** 09.10.2026 — masa (`raceTiers[].id`); `''` = serbest (masasız). */
  tableId?: string;
  /** 09.10.2026 — yalnızca kulübüm (kulübü sunucu bulur). */
  clubOnly?: boolean;
  /** 15.10.2026 — `false` = botsuz yarış; verilmezse boş koltuklar botla dolar. */
  aiFill?: boolean;
}

/**
 * 15.10.2026 (Aşama 3) — yarışın koşması için gereken en az gerçek oyuncu.
 * Sunucudaki `defaultFieldRule` ile AYNI kural (aynı config); kural yine
 * sunucuda denetlenir, bu yalnızca oyuncuyu gereksiz bir 400'den korur.
 */
export function minRealPlayersFor(entryFee: number, aiFill: boolean, config: RaceLobbyConfig): number {
  const rules = config.fieldRules;
  const base = entryFee > 0 ? rules.paidMinRealPlayers : rules.freeMinRealPlayers;
  return aiFill ? base : Math.max(base, rules.botlessMinRealPlayers);
}

/**
 * 15.10.2026 (Aşama 3) — listede yetersiz oyuncu kuralı: "👥 En az 2 oyuncu ·
 * yoksa iptal + iade". Alan yoksa (eski sunucu) `null`.
 */
export function describeFieldRule(race: Pick<RaceLobbyListItem, 'fieldRule'>): string | null {
  const rule = race.fieldRule;
  if (rule === undefined || rule === null) return null;
  const bots = rule.aiFill ? 'boş koltuklar botla dolar' : 'botsuz';
  if (rule.minRealPlayers <= 1) return `👥 ${bots}`;
  return `👥 En az ${rule.minRealPlayers} oyuncu · ${bots} · yoksa iptal + iade`;
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
    // 01.10.2026 — alt sınır TAM dakikaya denk gelirse (60 sn) form değeri
    // sunucuya varana kadar 59,x saniyeye düşüp reddediliyordu; varsayılan
    // ayarlarla yarış açılamıyordu. Sınırın bir saniye üstü yuvarlanır.
    min: Math.ceil((config.startDelaySeconds.min + 1) / SECONDS_PER_MINUTE),
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
    playerControl: false,
    breedClass: '',
    hippodrome: DEFAULT_HIPPODROME_KEY,
    horseLevelBracket: '',
  };
}

export type BuildCreateRaceResult =
  { ok: true; body: CreateLobbyRaceBody } | { ok: false; problem: string };

/**
 * Formu `POST /races` gövdesine çevirir. İstemci tarafı kontroller yalnızca
 * oyuncuyu gereksiz bir 400'den korumak içindir; sunucu aynılarını ayrıca
 * yapar. `startTime` = `now + startDelayMinutes` — sunucu en az
 * `startDelaySeconds.min` ileri bir zaman ister.
 */
export function buildCreateRaceBody(
  form: LobbyRaceForm,
  now: Date,
  config: RaceLobbyConfig,
): BuildCreateRaceResult {
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
  if (
    form.distanceMeters < config.distanceMeters.min ||
    form.distanceMeters > config.distanceMeters.max
  ) {
    return {
      ok: false,
      problem: `Mesafe ${config.distanceMeters.min}–${config.distanceMeters.max} m arasında olmalıdır.`,
    };
  }
  const delaySeconds = form.startDelayMinutes * SECONDS_PER_MINUTE;
  const bounds = startDelayMinuteBounds(config);
  if (form.startDelayMinutes < bounds.min || form.startDelayMinutes > bounds.max) {
    return { ok: false, problem: `Başlangıç ${bounds.min}–${bounds.max} dakika sonra olmalıdır.` };
  }
  const table = form.tableId ? RACE_TABLES.find((candidate) => candidate.id === form.tableId) : undefined;
  if (form.tableId && table === undefined) {
    return { ok: false, problem: 'Seçilen masa bulunamadı.' };
  }
  if (table !== undefined && (form.fieldSize !== table.fieldSize || form.entryFee !== table.entryFee)) {
    return { ok: false, problem: `${table.label} masasında ${table.fieldSize} at ve ${table.entryFee} çip giriş bedeli zorunludur.` };
  }
  const minReal = minRealPlayersFor(form.entryFee, form.aiFill !== false, config);
  if (minReal > form.maxPlayers) {
    return { ok: false, problem: `Bu yarış en az ${minReal} gerçek oyuncuyla koşar; oyuncu tavanını artır.` };
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
      playerControl: form.playerControl,
      // Boş = açık yarış: alan hiç GÖNDERİLMEZ (sunucu `null` kabul eder).
      ...(form.breedClass !== '' ? { breedClass: form.breedClass } : {}),
      hippodrome: form.hippodrome,
      ...(form.horseLevelBracket !== '' ? { horseLevelBracket: form.horseLevelBracket } : {}),
      ...(table !== undefined ? { tableId: table.id } : {}),
      // Kulübün kimliği GÖNDERİLMEZ — sunucu açanın üyeliğinden bulur.
      ...(form.clubOnly === true ? { clubOnly: true } : {}),
      // Varsayılan (botla dolar) için alan GÖNDERİLMEZ.
      ...(form.aiFill === false ? { aiFill: false } : {}),
    },
  };
}

/**
 * 09.10.2026 — MASALAR (`economy.raceTiers`, sunucu ile AYNI dosya). Masa
 * seçilince at sayısı ve giriş bedeli masanınkine çekilir; oyuncu tavanı
 * yeni at sayısına sığdırılır. Kural sunucuda yeniden denetlenir.
 */
export const RACE_TABLES: readonly RaceTierConfig[] = loadEconomyConfig().raceTiers;

export function applyRaceTable(form: LobbyRaceForm, tableId: string, config: RaceLobbyConfig): LobbyRaceForm {
  const table = RACE_TABLES.find((candidate) => candidate.id === tableId);
  if (table === undefined) return { ...form, tableId: '' };
  const caps = maxPlayersOptions(table.fieldSize, config);
  return {
    ...form,
    tableId,
    fieldSize: table.fieldSize,
    entryFee: table.entryFee,
    maxPlayers: caps.includes(form.maxPlayers) ? form.maxPlayers : (caps.at(-1) ?? form.maxPlayers),
  };
}

/** Masanın oyuncuya gösterilen kural özeti (sunucunun `RaceTableView`i ya da config'ten). */
export interface TableRulesSummary {
  feeTiming: 'on_join' | 'on_start';
  paidPlaces: number;
  rakePercent: number;
  loserRefund: { percent: number; maxPosition: number };
}

/** Form için: config'teki masadan özet (dağılım payları `prizeDistributions`tan). */
export function tableRulesFromConfig(table: RaceTierConfig): TableRulesSummary {
  const economy = loadEconomyConfig();
  const shares = economy.prizeDistributions.find((distribution) => distribution.id === table.distributionId)?.shares ?? [];
  const total = shares.reduce((sum, share) => sum + share, 0);
  return {
    feeTiming: table.feeTiming,
    paidPlaces: shares.length,
    rakePercent: Math.round((1 - total) * 100),
    loserRefund: { ...table.loserRefund },
  };
}

/** Kural satırları — yön/tutar sunucu kuralıyla aynı dilde. */
export function describeTableRules(rules: TableRulesSummary): string[] {
  const fee =
    rules.feeTiming === 'on_start'
      ? 'Giriş bedeli start anında kesilir (o an bakiyesi yetmeyen yarıştan düşer)'
      : 'Giriş bedeli katılırken kesilir (start öncesi ayrılırsan iade)';
  const prize = `Ödül: ilk ${rules.paidPlaces} sıra · komisyon %${rules.rakePercent}`;
  const { percent, maxPosition } = rules.loserRefund;
  const firstRefunded = rules.paidPlaces + 1;
  const refund =
    percent > 0
      ? `Kaybedene: ${firstRefunded === maxPosition ? `${maxPosition}.` : `${firstRefunded}–${maxPosition}.`} sıraya giriş bedelinin %${percent} iadesi`
      : 'Kaybedene iade yok';
  return [fee, prize, refund];
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

/**
 * 14.10.2026 — "Yarışı iptal et" düğmesi: yarışı BU oyuncu açtıysa, yarış
 * açıksa ve aktif katılımı yoksa (katıldıysan önce "Ayrıl" — iade ayrılma
 * yolundadır). Sunucu kuralının (`checkOwnRaceCancelable`) aynısı; karar yine
 * sunucudadır, bu yalnızca düğmeyi gösterir.
 */
export function canCancelOwnRace(race: RaceLobbyListItem, playerId: string | null): boolean {
  return (
    playerId !== null &&
    race.createdBy === playerId &&
    race.status === 'scheduled' &&
    race.joinedPlayers === 0
  );
}

/** "12 dk sonra" / "1 sa 5 dk sonra" / "başlıyor". Saniye hassasiyeti bilinçli olarak yok. */
export function formatStartsIn(startTime: string, now: Date): string {
  const minutes = Math.floor(
    (new Date(startTime).getTime() - now.getTime()) / (SECONDS_PER_MINUTE * MS_PER_SECOND),
  );
  if (minutes <= 0) {
    return 'başlıyor';
  }
  const hours = Math.floor(minutes / SECONDS_PER_MINUTE);
  const rest = minutes % SECONDS_PER_MINUTE;
  return hours > 0 ? `${hours} sa ${rest} dk sonra` : `${rest} dk sonra`;
}

// ---------------------------------------------------------------------------
// 08.10.2026 — AT SEVİYESİNE GÖRE YARIŞLAR + HEMEN KATIL (sahibinin isteği).
// Kural sunucudadır (`HORSE_LEVEL_NOT_ALLOWED`); burası yalnızca gösterir,
// sıralar ve "hemen katıl" için en uygun yarışı ÖNERİR.
// ---------------------------------------------------------------------------

/** Seçim listesi: "Çaylak (Sv 1–4)". */
export const LEVEL_BRACKET_OPTIONS = (lobbyConfig.horseLevelBrackets ?? []).map((bracket) => ({
  key: bracket.key,
  label: `${bracket.name} (Sv ${bracket.minLevel}–${bracket.maxLevel})`,
}));

function findBracket(key: string | null | undefined) {
  return (lobbyConfig.horseLevelBrackets ?? []).find((bracket) => bracket.key === key) ?? null;
}

/** Rozet: "🎯 Çaylak atlar · Sv 1–4"; aralıksız yarışta `null`. */
export function describeLevelBracket(race: Pick<RaceLobbyListItem, 'horseLevelBracket'>): string | null {
  if (race.horseLevelBracket === null || race.horseLevelBracket === undefined) return null;
  const bracket = findBracket(race.horseLevelBracket);
  return bracket
    ? `🎯 ${bracket.name} atlar · Sv ${bracket.minLevel}–${bracket.maxLevel}`
    : `🎯 Seviye aralığı: ${race.horseLevelBracket}`;
}

/** Sunucu kuralının aynısı: aralıksız yarış açık, bilinmeyen aralık kapalı. */
export function horseFitsLevelBracket(bracketKey: string | null | undefined, horseLevel: number): boolean {
  if (bracketKey === null || bracketKey === undefined) return true;
  const bracket = findBracket(bracketKey);
  return bracket !== null && horseLevel >= bracket.minLevel && horseLevel <= bracket.maxLevel;
}

export interface LobbyHorse {
  id: string;
  breed: string;
  level: number;
}

/**
 * Yarışın seçili ata uygunluğu: 0 = atın seviyesine ÖZEL yarış (en uygun),
 * 1 = herkese açık yarış, 2 = at giremez (ırk ya da seviye dışı).
 */
export function raceFitForHorse(
  race: Pick<RaceLobbyListItem, 'breedClass' | 'horseLevelBracket'>,
  horse: LobbyHorse,
): 0 | 1 | 2 {
  if (!horseFitsRaceClass(race.breedClass ?? null, horse.breed)) return 2;
  if (!horseFitsLevelBracket(race.horseLevelBracket, horse.level)) return 2;
  return race.horseLevelBracket ? 0 : 1;
}

/** Listeyi seçili ata göre sıralar (uygun olan önce); eşitlikte sunucunun sırası korunur. */
export function sortRacesForHorse<T extends Pick<RaceLobbyListItem, 'breedClass' | 'horseLevelBracket'>>(
  races: readonly T[],
  horse: LobbyHorse | null,
): T[] {
  if (horse === null) return [...races];
  return races
    .map((race, index) => ({ race, index, fit: raceFitForHorse(race, horse) }))
    .sort((a, b) => a.fit - b.fit || a.index - b.index)
    .map((item) => item.race);
}

/**
 * HEMEN KATIL — seçili at için katılınabilir en uygun yarış: katılımı yok,
 * dolu değil, ırk + seviye uygun, ücret bakiyeye yetiyor, başlamasına en az
 * `minLeadMs` var (katıl + hazırım sığsın). Önce ata özel aralık, sonra en
 * yakın başlangıç, sonra düşük ücret. At zaten açık bir yarıştaysa `null`.
 */
export function pickQuickJoinRace(
  races: readonly RaceLobbyListItem[],
  horse: LobbyHorse | null,
  money: number,
  now: Date,
  minLeadMs: number,
): RaceLobbyListItem | null {
  if (horse === null) return null;
  const horseBusy = races.some(
    (race) => race.myEntry !== null && race.myEntry.horseId === horse.id && race.myEntry.status !== 'cancelled',
  );
  if (horseBusy) return null;
  const candidates = races.filter(
    (race) =>
      lobbyEntryActions(race).canJoin &&
      raceFitForHorse(race, horse) < 2 &&
      race.entryFee <= money &&
      new Date(race.startTime).getTime() - now.getTime() >= minLeadMs,
  );
  candidates.sort(
    (a, b) =>
      raceFitForHorse(a, horse) - raceFitForHorse(b, horse) ||
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime() ||
      a.entryFee - b.entryFee,
  );
  return candidates[0] ?? null;
}
