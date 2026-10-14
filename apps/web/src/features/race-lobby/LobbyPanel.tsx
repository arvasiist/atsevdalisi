'use client';

/**
 * ÜCRETLİ LOBİ YARIŞI — ilk ve tek istemci yüzeyi (30.09.2026).
 *
 * Sunucuda `GET/POST /races`, `/join`, `/ready`, `/leave` 27–28.09.2026'dan
 * beri vardı; hiçbir ekran onları çağırmıyordu. Oyuncu burada: açık
 * yarışları görür, yarış açar, atıyla katılır, "Hazırım" der ya da ayrılır.
 * Kesinleşme ekrandan TETİKLENMEZ — başlangıç anında sunucunun zamanlayıcısı
 * kilitler ve kesinleştirir; sonuç bildirim olarak gelir.
 *
 * **`Idempotency-Key` YAŞAM DÖNGÜSÜ** (`BreedingPanel`/`wallet` deseni):
 * katılma ve ayrılma PARA YOLUDUR. Anahtar yarış başına tutulur, başarısız
 * denemede YAŞAR (yanıt ağda kaybolduysa aynı anahtarla yeniden denemek
 * sunucunun saklanan yanıtını döndürür, ikinci ücret/iade üretmez), başarıda
 * TÜKENİR. Anahtar yarış kimliğine bağlı olduğu için başka bir yarışa
 * sızamaz.
 *
 * **SUNUCU OTORİTESİ:** giriş ücreti, havuz, çarpan ve "katıldım mı" bilgisi
 * yalnızca lobi satırından okunur (`myEntry`). Her işlemden sonra liste
 * sunucudan YENİDEN çekilir; istemci kendi tahminini göstermez.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PublicHorse,
  RaceLobbyListItem,
  RaceSurface,
  RaceWeather,
} from '@at-sevdalisi/shared-types';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { formatRaceStart } from '../../lib/format-time';
import { formatMultiplier } from '../race/race-entry';
import { RACE_CLASSES, breedLabel, horseFitsRaceClass } from '../breeds/breed-catalog';
import { HIPPODROME_OPTIONS } from '../race-viewer/hippodrome-theme';
import { isClubOfficerOrLeader } from '../club/club-invite-logic';
import {
  ENTRY_STATUS_LABELS,
  describeBreedClass,
  describeCalendar,
  describeHippodrome,
  describePlayerControl,
  describeTournament,
  SURFACE_LABELS,
  WEATHER_LABELS,
  buildCreateRaceBody,
  defaultLobbyRaceForm,
  formatStartsIn,
  lobbyEntryActions,
  maxPlayersOptions,
  startDelayMinuteBounds,
  type LobbyRaceForm,
  LEVEL_BRACKET_OPTIONS,
  describeLevelBracket,
  horseFitsLevelBracket,
  pickQuickJoinRace,
  raceFitForHorse,
  sortRacesForHorse,
  canCancelOwnRace,
  RACE_TABLES,
  applyRaceTable,
  describeTableRules,
  tableRulesFromConfig,
} from './lobby-logic';

const LOBBY_CONFIG = loadRaceLobbyConfig();

/** Yeni yarış formu: ilk masa seçili gelir (masasız yarış listede "Serbest"). */
function initialLobbyForm(): LobbyRaceForm {
  return applyRaceTable(defaultLobbyRaceForm(LOBBY_CONFIG), RACE_TABLES[0]?.id ?? '', LOBBY_CONFIG);
}
/** Hemen katılda başlangıca en az bu kadar kalmalı (katıl + hazırım sığsın, kilit öncesi). */
const QUICK_JOIN_MIN_LEAD_MS = 45_000;
const START_DELAY_BOUNDS = startDelayMinuteBounds(LOBBY_CONFIG);

export interface LobbyPanelProps {
  /** Oyuncunun atları — katılım için seçim listesi. Sakat atlar sunucuda reddedilir. */
  horses: PublicHorse[];
  /** 08.10.2026 — bakiye (Hemen Katıl ücreti yetmeyen yarışı önermesin); bilinmiyorsa süzülmez, sunucu reddeder. */
  money?: number;
  /** Para hareketinden sonra üst bar bakiyesi tazelensin diye. */
  onBalanceChanged: () => Promise<void>;
  /** 14.10.2026 — oturumdaki oyuncu: kendi açtığı yarışta "Yarışı iptal et" düğmesi için. */
  playerId?: string | null;
}

export function LobbyPanel({ horses, money, onBalanceChanged, playerId = null }: LobbyPanelProps): React.ReactElement {
  const [races, setRaces] = useState<RaceLobbyListItem[] | null>(null);
  const [horseId, setHorseId] = useState('');
  const [busyRaceId, setBusyRaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  // 09.10.2026 — form ilk masayla açılır (sahibinin kararı: yarışı açan masa seçer).
  const [form, setForm] = useState<LobbyRaceForm>(() => initialLobbyForm());
  const [isCreating, setIsCreating] = useState(false);
  // 09.10.2026 — kulüp içi yarış: kulüp adı rozet için, rol formdaki seçenek için.
  // Yalnızca ipucu; kulübü ve yetkiyi sunucu belirler.
  const [myClub, setMyClub] = useState<{ id: string; name: string; canOpenRace: boolean } | null>(null);

  /** Yarış başına bekleyen para-yolu anahtarları — bkz. dosya başı doc yorumu. */
  const joinKeysRef = useRef(new Map<string, string>());
  const leaveKeysRef = useRef(new Map<string, string>());

  const effectiveHorseId = horseId !== '' ? horseId : (horses[0]?.id ?? '');
  const effectiveHorse = horses.find((horse) => horse.id === effectiveHorseId) ?? null;

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setRaces(await apiClient.listLobbyRaces());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lobi yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    apiClient
      .getMyClub()
      .then((detail) =>
        setMyClub(
          detail === null
            ? null
            : { id: detail.club.id, name: detail.club.name, canOpenRace: isClubOfficerOrLeader(detail.myRole) },
        ),
      )
      .catch(() => setMyClub(null));
  }, []);

  const runAction = useCallback(
    async (
      raceId: string,
      action: () => Promise<unknown>,
      successNotice: string,
      movesMoney: boolean,
    ) => {
      setBusyRaceId(raceId);
      setError(null);
      setNotice(null);
      try {
        await action();
        setNotice(successNotice);
        if (movesMoney) {
          await onBalanceChanged();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'İşlem başarısız.');
      } finally {
        setBusyRaceId(null);
        await refresh();
      }
    },
    [onBalanceChanged, refresh],
  );

  const join = useCallback(
    (race: RaceLobbyListItem) => {
      if (effectiveHorseId === '') {
        setError('Katılmak için ahırında bir at olmalı.');
        return;
      }
      const keys = joinKeysRef.current;
      const key = keys.get(race.id) ?? crypto.randomUUID();
      keys.set(race.id, key);
      void runAction(
        race.id,
        async () => {
          await apiClient.joinLobbyRace(race.id, { horseId: effectiveHorseId }, key);
          keys.delete(race.id);
        },
        `"${race.name}" yarışına katıldın. Başlangıçtan önce "Hazırım" demeyi unutma — hazır olmayanın ücreti iade edilir ve koşmaz.`,
        true,
      );
    },
    [effectiveHorseId, runAction],
  );

  // 08.10.2026 — HEMEN KATIL: seçili at için en uygun yarışa tek tuşla katıl +
  // hazır ol. Seçim önerisidir; kurallar (ırk, seviye, ücret, dolu) sunucuda.
  const quickJoinRace = useMemo(
    () =>
      races === null || effectiveHorse === null
        ? null
        : pickQuickJoinRace(races, effectiveHorse, money ?? Number.MAX_SAFE_INTEGER, new Date(), QUICK_JOIN_MIN_LEAD_MS),
    [races, effectiveHorse, money],
  );
  const quickJoin = useCallback(() => {
    if (quickJoinRace === null || effectiveHorseId === '') return;
    const race = quickJoinRace;
    const keys = joinKeysRef.current;
    const key = keys.get(race.id) ?? crypto.randomUUID();
    keys.set(race.id, key);
    void runAction(
      race.id,
      async () => {
        await apiClient.joinLobbyRace(race.id, { horseId: effectiveHorseId }, key);
        keys.delete(race.id);
        await apiClient.setLobbyEntryReady(race.id, 'ready');
      },
      `⚡ "${race.name}" yarışına katıldın ve hazırsın — ${formatStartsIn(race.startTime, new Date())} başlıyor.`,
      true,
    );
  }, [quickJoinRace, effectiveHorseId, runAction]);

  const leave = useCallback(
    (race: RaceLobbyListItem) => {
      const keys = leaveKeysRef.current;
      const key = keys.get(race.id) ?? crypto.randomUUID();
      keys.set(race.id, key);
      void runAction(
        race.id,
        async () => {
          await apiClient.leaveLobbyRace(race.id, key);
          keys.delete(race.id);
        },
        `"${race.name}" yarışından ayrıldın; giriş ücretin iade edildi.`,
        true,
      );
    },
    [runAction],
  );

  const cancelOwn = useCallback(
    (race: RaceLobbyListItem) => {
      if (!window.confirm(`"${race.name}" yarışını iptal etmek istiyor musun? Bu geri alınamaz.`)) return;
      void runAction(
        race.id,
        () => apiClient.cancelOwnLobbyRace(race.id),
        `"${race.name}" iptal edildi; yeni yarış açma hakkın geri geldi.`,
        false,
      );
    },
    [runAction],
  );

  const setReady = useCallback(
    (race: RaceLobbyListItem, status: 'ready' | 'not_ready') => {
      void runAction(
        race.id,
        () => apiClient.setLobbyEntryReady(race.id, status),
        status === 'ready'
          ? 'Hazırsın — başlangıçta yarışacaksın.'
          : 'Hazır değilsin — başlangıçta düşürülürsün.',
        false,
      );
    },
    [runAction],
  );

  const createRace = useCallback(async () => {
    const built = buildCreateRaceBody(form, new Date(), LOBBY_CONFIG);
    if (!built.ok) {
      setError(built.problem);
      return;
    }
    setIsCreating(true);
    setError(null);
    setNotice(null);
    try {
      const race = await apiClient.createLobbyRace(built.body);
      setNotice(`"${race.name}" açıldı. Açmak katılmak değildir — yarışmak için listeden "Katıl".`);
      setIsFormOpen(false);
      setForm(initialLobbyForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yarış açılamadı.');
    } finally {
      setIsCreating(false);
      await refresh();
    }
  }, [form, refresh]);

  const playerCapOptions = useMemo(
    () => maxPlayersOptions(form.fieldSize, LOBBY_CONFIG),
    [form.fieldSize],
  );
  const updateForm = (patch: Partial<LobbyRaceForm>): void =>
    setForm((current) => ({ ...current, ...patch }));
  const selectedTable = RACE_TABLES.find((table) => table.id === form.tableId);
  const now = new Date();

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-sm)',
        }}
      >
        <h2 style={titleStyle()}>Ücretli Yarış Lobisi</h2>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button type="button" onClick={() => void refresh()} style={secondaryButtonStyle()}>
            Yenile
          </button>
          <button
            type="button"
            onClick={() => setIsFormOpen((open) => !open)}
            style={secondaryButtonStyle()}
          >
            {isFormOpen ? 'Vazgeç' : 'Yarış Aç'}
          </button>
        </div>
      </div>
      <p style={mutedStyle()}>
        Giriş ücretleri ödül havuzunu oluşturur; kadro botlarla at sayısına tamamlanır. Yalnızca
        başlangıçta
        <strong> hazır</strong> olan oyuncular koşar — hazır olmayanın ücreti iade edilir.
      </p>

      {isFormOpen ? (
        <div style={formGridStyle()}>
          <label style={labelStyle()}>
            Yarış adı
            <input
              aria-label="Yarış adı"
              type="text"
              value={form.name}
              maxLength={LOBBY_CONFIG.nameLength.max}
              onChange={(event) => updateForm({ name: event.target.value })}
              style={inputStyle()}
            />
          </label>
          <label style={labelStyle()}>
            Masa
            <select
              aria-label="Masa"
              value={form.tableId ?? ''}
              onChange={(event) => setForm((current) => applyRaceTable(current, event.target.value, LOBBY_CONFIG))}
              style={inputStyle()}
            >
              {RACE_TABLES.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label} · {table.fieldSize} at · {formatCurrency('money', table.entryFee)}
                </option>
              ))}
              <option value="">Serbest (masasız)</option>
            </select>
          </label>
          {selectedTable !== undefined ? (
            <ul data-testid="table-rules" style={{ ...smallStyle(), margin: 0, paddingLeft: '18px', gridColumn: '1 / -1' }}>
              {describeTableRules(tableRulesFromConfig(selectedTable)).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {selectedTable === undefined ? (
          <label style={labelStyle()}>
            At sayısı
            <select
              aria-label="At sayısı"
              value={form.fieldSize}
              onChange={(event) => {
                const fieldSize = Number(event.target.value);
                const caps = maxPlayersOptions(fieldSize, LOBBY_CONFIG);
                updateForm({
                  fieldSize,
                  maxPlayers: caps.includes(form.maxPlayers)
                    ? form.maxPlayers
                    : (caps.at(-1) ?? form.maxPlayers),
                });
              }}
              style={inputStyle()}
            >
              {LOBBY_CONFIG.fieldSizes.map((size) => (
                <option key={size} value={size}>
                  {size} at
                </option>
              ))}
            </select>
          </label>
          ) : null}
          <label style={labelStyle()}>
            Oyuncu tavanı
            <select
              aria-label="Oyuncu tavanı"
              value={form.maxPlayers}
              onChange={(event) => updateForm({ maxPlayers: Number(event.target.value) })}
              style={inputStyle()}
            >
              {playerCapOptions.map((cap) => (
                <option key={cap} value={cap}>
                  {cap} oyuncu
                </option>
              ))}
            </select>
          </label>
          {selectedTable === undefined ? (
          <label style={labelStyle()}>
            Giriş ücreti
            <select
              aria-label="Giriş ücreti"
              value={form.entryFee}
              onChange={(event) => updateForm({ entryFee: Number(event.target.value) })}
              style={inputStyle()}
            >
              <option value={0}>Ücretsiz</option>
              {LOBBY_CONFIG.paidEntryFeeOptions.map((fee) => (
                <option key={fee} value={fee}>
                  {formatCurrency('money', fee)}
                </option>
              ))}
            </select>
          </label>
          ) : null}
          <label style={labelStyle()}>
            Kaç dakika sonra başlasın
            <input
              aria-label="Başlangıç (dakika)"
              type="number"
              min={START_DELAY_BOUNDS.min}
              max={START_DELAY_BOUNDS.max}
              value={form.startDelayMinutes}
              onChange={(event) => updateForm({ startDelayMinutes: Number(event.target.value) })}
              style={inputStyle()}
            />
          </label>
          <label style={labelStyle()}>
            Mesafe (m)
            <input
              aria-label="Mesafe"
              type="number"
              min={LOBBY_CONFIG.distanceMeters.min}
              max={LOBBY_CONFIG.distanceMeters.max}
              value={form.distanceMeters}
              onChange={(event) => updateForm({ distanceMeters: Number(event.target.value) })}
              style={inputStyle()}
            />
          </label>
          <label style={labelStyle()}>
            Zemin
            <select
              aria-label="Zemin"
              value={form.surface}
              onChange={(event) => updateForm({ surface: event.target.value as RaceSurface })}
              style={inputStyle()}
            >
              {(LOBBY_CONFIG.allowedSurfaces as RaceSurface[]).map((surface) => (
                <option key={surface} value={surface}>
                  {SURFACE_LABELS[surface] ?? surface}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle()}>
            Hava
            <select
              aria-label="Hava"
              value={form.weather}
              onChange={(event) => updateForm({ weather: event.target.value as RaceWeather })}
              style={inputStyle()}
            >
              {(LOBBY_CONFIG.allowedWeather as RaceWeather[]).map((weather) => (
                <option key={weather} value={weather}>
                  {WEATHER_LABELS[weather] ?? weather}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle()}>
            Tribün bileti
            <select
              aria-label="Tribün bileti"
              value={form.tribuneFee}
              onChange={(event) => updateForm({ tribuneFee: Number(event.target.value) })}
              style={inputStyle()}
            >
              {LOBBY_CONFIG.tribuneFeeOptions.map((fee) => (
                <option key={fee} value={fee}>
                  {fee === 0 ? 'Ücretsiz tribün' : formatCurrency('money', fee)}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle()}>
            Tribün kapasitesi
            <select
              aria-label="Tribün kapasitesi"
              value={form.spectatorCapacity}
              onChange={(event) => updateForm({ spectatorCapacity: Number(event.target.value) })}
              style={inputStyle()}
            >
              {LOBBY_CONFIG.spectatorCapacityOptions.map((capacity) => (
                <option key={capacity} value={capacity}>
                  {capacity} kişi
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle()}>
            Hipodrom
            <select
              aria-label="Hipodrom"
              value={form.hippodrome}
              onChange={(event) => updateForm({ hippodrome: event.target.value })}
              style={inputStyle()}
            >
              {HIPPODROME_OPTIONS.map((hippodrome) => (
                <option key={hippodrome.key} value={hippodrome.key}>
                  {hippodrome.shortName} · {hippodrome.city}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle()}>
            Irk sınıfı
            <select
              aria-label="Irk sınıfı"
              value={form.breedClass}
              onChange={(event) => updateForm({ breedClass: event.target.value })}
              style={inputStyle()}
            >
              <option value="">Her ırka açık</option>
              {RACE_CLASSES.map((raceClass) => (
                <option key={raceClass.key} value={raceClass.key}>
                  Yalnızca {raceClass.name}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle()}>
            At seviyesi
            <select
              aria-label="At seviyesi"
              value={form.horseLevelBracket}
              onChange={(event) => updateForm({ horseLevelBracket: event.target.value })}
              style={inputStyle()}
            >
              <option value="">Her seviyeye açık</option>
              {LEVEL_BRACKET_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...labelStyle(), display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              aria-label="Kontrollü yarış"
              checked={form.playerControl}
              onChange={(event) => updateForm({ playerControl: event.target.checked })}
            />
            Kontrollü yarış (atı oyuncular sürer: kırbaç, yön)
          </label>
          {myClub?.canOpenRace ? (
            <label style={{ ...labelStyle(), display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                aria-label="Yalnızca kulübüm"
                checked={form.clubOnly === true}
                onChange={(event) => updateForm({ clubOnly: event.target.checked })}
              />
              Yalnızca kulübüm ({myClub.name}) — yalnızca üyeler görür ve katılır
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void createRace()}
            disabled={isCreating}
            style={primaryButtonStyle(!isCreating)}
          >
            {isCreating ? 'Açılıyor…' : 'Yarışı Aç'}
          </button>
        </div>
      ) : null}

      {horses.length > 0 ? (
        <label style={{ ...labelStyle(), marginTop: 'var(--space-md)', maxWidth: '320px' }}>
          Katılacak at
          <select
            aria-label="Katılacak at"
            value={effectiveHorseId}
            onChange={(event) => setHorseId(event.target.value)}
            style={inputStyle()}
          >
            {horses.map((horse) => (
              <option key={horse.id} value={horse.id}>
                {horse.name} · {breedLabel(horse.breed)} · Seviye {horse.level}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {effectiveHorse !== null && races !== null ? (
        <div className="quick-join" data-testid="quick-join">
          <div style={{ display: 'grid', gap: '2px' }}>
            <strong className="quick-join-title">⚡ Hemen Katıl</strong>
            {quickJoinRace !== null ? (
              <span style={smallStyle()}>
                {effectiveHorse.name} için en uygun yarış: <strong>{quickJoinRace.name}</strong> ·{' '}
                {formatStartsIn(quickJoinRace.startTime, now)} · Giriş{' '}
                {quickJoinRace.entryFee > 0 ? formatCurrency('money', quickJoinRace.entryFee) : 'ücretsiz'}
                {describeLevelBracket(quickJoinRace) !== null ? ` · ${describeLevelBracket(quickJoinRace)}` : ''}
              </span>
            ) : (
              <span style={smallStyle()}>
                Şu an {effectiveHorse.name} için katılınabilir uygun yarış yok (at başka bir yarışta olabilir) — yeni
                yarış açabilirsin.
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn-gold"
            disabled={quickJoinRace === null || busyRaceId !== null}
            onClick={quickJoin}
          >
            ⚡ Hemen Katıl
          </button>
        </div>
      ) : null}

      {notice !== null ? (
        <p style={{ ...mutedStyle(), color: 'var(--color-status-positive)' }}>{notice}</p>
      ) : null}
      {error !== null ? (
        <p style={{ ...mutedStyle(), color: 'var(--color-status-critical)' }}>{error}</p>
      ) : null}

      {races === null ? (
        <p style={mutedStyle()}>Lobi yükleniyor…</p>
      ) : races.length === 0 ? (
        <p style={mutedStyle()}>Şu an katılınabilir bir yarış yok — ilkini sen aç.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'var(--space-md) 0 0 0',
            display: 'grid',
            gap: 'var(--space-sm)',
          }}
        >
          {sortRacesForHorse(races, effectiveHorse).map((race) => {
            const actions = lobbyEntryActions(race);
            const isBusy = busyRaceId === race.id;
            const fit = effectiveHorse !== null ? raceFitForHorse(race, effectiveHorse) : 1;
            return (
              <li key={race.id} data-testid={`lobby-race-${race.id}`} style={rowStyle()}>
                <div style={{ display: 'grid', gap: '2px' }}>
                  <strong style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}>
                    {race.name}
                  </strong>
                  {describeTournament(race) !== null ? (
                    <span
                      style={{
                        ...smallStyle(),
                        color: 'var(--color-accent-gold)',
                        fontWeight: 600,
                      }}
                    >
                      {describeTournament(race)}
                    </span>
                  ) : null}
                  {describePlayerControl(race) !== null ? (
                    <span
                      style={{
                        ...smallStyle(),
                        color: 'var(--color-accent-gold)',
                        fontWeight: 600,
                      }}
                    >
                      {describePlayerControl(race)}
                    </span>
                  ) : null}
                  {describeHippodrome(race) !== null ? (
                    <span data-testid={`lobby-hippodrome-${race.id}`} style={smallStyle()}>
                      {describeHippodrome(race)}
                    </span>
                  ) : null}
                  {describeLevelBracket(race) !== null ? (
                    <span
                      data-testid={`lobby-level-${race.id}`}
                      style={{ ...smallStyle(), color: 'var(--color-accent-gold)', fontWeight: 600 }}
                    >
                      {describeLevelBracket(race)}
                      {fit === 0 ? ' · ✓ Atına uygun' : ''}
                    </span>
                  ) : null}
                  {describeBreedClass(race) !== null ? (
                    <span
                      data-testid={`lobby-breed-class-${race.id}`}
                      style={{
                        ...smallStyle(),
                        color: 'var(--color-accent-gold)',
                        fontWeight: 600,
                      }}
                    >
                      {describeBreedClass(race)}
                    </span>
                  ) : null}
                  {race.clubId ? (
                    <span
                      data-testid={`lobby-club-only-${race.id}`}
                      style={{ ...smallStyle(), color: 'var(--color-accent-gold)', fontWeight: 600 }}
                    >
                      🛡 Kulüp içi yarış
                      {myClub !== null && myClub.id === race.clubId ? ` · ${myClub.name}` : ''}
                    </span>
                  ) : null}
                  {describeCalendar(race) !== null ? (
                    <span
                      style={{
                        ...smallStyle(),
                        color: 'var(--color-text-secondary)',
                        fontWeight: 600,
                      }}
                    >
                      {describeCalendar(race)}
                    </span>
                  ) : null}
                  <span style={smallStyle()}>
                    {SURFACE_LABELS[race.surface]} · {WEATHER_LABELS[race.weather]} ·{' '}
                    {race.distanceMeters} m · {formatRaceStart(race.startTime, now)} ·{' '}
                    {formatStartsIn(race.startTime, now)}
                  </span>
                  {race.table ? (
                    <span data-testid="race-table" style={{ ...smallStyle(), color: 'var(--color-text-secondary)' }}>
                      <strong>{race.table.label} masası</strong> · {describeTableRules(race.table).join(' · ')}
                    </span>
                  ) : null}
                  <span style={smallStyle()}>
                    Oyuncu {race.joinedPlayers}/{race.maxPlayers} · {race.fieldSize} at · Giriş{' '}
                    {race.entryFee > 0 ? formatCurrency('money', race.entryFee) : 'ücretsiz'} ·
                    {race.table?.feeTiming === 'on_start' && race.status === 'scheduled'
                      ? `Havuz start'ta oluşur (tahmini ${formatCurrency('money', race.entryFee * race.joinedPlayers)})`
                      : `Havuz ${formatCurrency('money', race.prizePool)}`}
                    {race.prizeMultiplier !== null
                      ? ` · Kazanana ${formatMultiplier(race.prizeMultiplier)}`
                      : ''}
                  </span>
                  {race.myEntry !== null ? (
                    <span
                      style={{
                        ...smallStyle(),
                        color:
                          race.myEntry.status === 'ready'
                            ? 'var(--color-status-positive)'
                            : 'var(--color-status-warning)',
                      }}
                    >
                      {ENTRY_STATUS_LABELS[race.myEntry.status]}
                    </span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {actions.canJoin &&
                  effectiveHorse !== null &&
                  !horseFitsRaceClass(race.breedClass ?? null, effectiveHorse.breed) ? (
                    <span style={smallStyle()}>Seçili atının ırkı bu yarışa uygun değil</span>
                  ) : actions.canJoin &&
                    effectiveHorse !== null &&
                    !horseFitsLevelBracket(race.horseLevelBracket, effectiveHorse.level) ? (
                    <span style={smallStyle()}>Seçili atının seviyesi bu yarışa uygun değil</span>
                  ) : actions.canJoin ? (
                    <button
                      type="button"
                      disabled={isBusy || effectiveHorseId === ''}
                      onClick={() => join(race)}
                      style={primaryButtonStyle(!isBusy)}
                    >
                      Katıl
                    </button>
                  ) : null}
                  {race.myEntry === null && !actions.canJoin ? (
                    <span style={smallStyle()}>Dolu</span>
                  ) : null}
                  {actions.canMarkReady ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setReady(race, 'ready')}
                      style={primaryButtonStyle(!isBusy)}
                    >
                      Hazırım
                    </button>
                  ) : null}
                  {actions.canMarkNotReady ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setReady(race, 'not_ready')}
                      style={secondaryButtonStyle()}
                    >
                      Hazır değilim
                    </button>
                  ) : null}
                  {actions.canLeave ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => leave(race)}
                      style={secondaryButtonStyle()}
                    >
                      Ayrıl (ücret iade)
                    </button>
                  ) : null}
                  {canCancelOwnRace(race, playerId) ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => cancelOwn(race)}
                      style={secondaryButtonStyle()}
                    >
                      Yarışı iptal et
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}

function titleStyle(): React.CSSProperties {
  return { fontSize: '16px', color: 'var(--color-text-primary)', margin: 0 };
}

function mutedStyle(): React.CSSProperties {
  return { margin: '8px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' };
}

function smallStyle(): React.CSSProperties {
  return { fontSize: '12px', color: 'var(--color-text-secondary)' };
}

function labelStyle(): React.CSSProperties {
  return { display: 'grid', gap: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' };
}

function formGridStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: 'var(--space-md)',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    marginTop: 'var(--space-md)',
    alignItems: 'end',
  };
}

function rowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-md)',
    flexWrap: 'wrap',
    padding: 'var(--space-sm) var(--space-md)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
  };
}

function inputStyle(): React.CSSProperties {
  return {
    // AUDIT_REPORT.md F1 ile AYNI kural: 44px dokunma hedefi.
    minHeight: '44px',
    padding: '8px 12px',
    background: 'rgba(10, 16, 28, 0.6)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
  };
}

function primaryButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '10px 18px',
    background: enabled ? 'var(--color-accent-gold)' : 'transparent',
    color: enabled ? '#1a1405' : 'var(--color-text-muted)',
    border: enabled ? 'none' : '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '13px',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '10px 16px',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    cursor: 'pointer',
  };
}
