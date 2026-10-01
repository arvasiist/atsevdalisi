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
import type { PublicHorse, RaceLobbyListItem, RaceSurface, RaceWeather } from '@at-sevdalisi/shared-types';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { formatMultiplier } from '../race/race-entry';
import {
  ENTRY_STATUS_LABELS,
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
} from './lobby-logic';

const LOBBY_CONFIG = loadRaceLobbyConfig();
const START_DELAY_BOUNDS = startDelayMinuteBounds(LOBBY_CONFIG);

export interface LobbyPanelProps {
  /** Oyuncunun atları — katılım için seçim listesi. Sakat atlar sunucuda reddedilir. */
  horses: PublicHorse[];
  /** Para hareketinden sonra üst bar bakiyesi tazelensin diye. */
  onBalanceChanged: () => Promise<void>;
}

export function LobbyPanel({ horses, onBalanceChanged }: LobbyPanelProps): React.ReactElement {
  const [races, setRaces] = useState<RaceLobbyListItem[] | null>(null);
  const [horseId, setHorseId] = useState('');
  const [busyRaceId, setBusyRaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<LobbyRaceForm>(() => defaultLobbyRaceForm(LOBBY_CONFIG));
  const [isCreating, setIsCreating] = useState(false);

  /** Yarış başına bekleyen para-yolu anahtarları — bkz. dosya başı doc yorumu. */
  const joinKeysRef = useRef(new Map<string, string>());
  const leaveKeysRef = useRef(new Map<string, string>());

  const effectiveHorseId = horseId !== '' ? horseId : (horses[0]?.id ?? '');

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

  const runAction = useCallback(
    async (raceId: string, action: () => Promise<unknown>, successNotice: string, movesMoney: boolean) => {
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

  const setReady = useCallback(
    (race: RaceLobbyListItem, status: 'ready' | 'not_ready') => {
      void runAction(
        race.id,
        () => apiClient.setLobbyEntryReady(race.id, status),
        status === 'ready' ? 'Hazırsın — başlangıçta yarışacaksın.' : 'Hazır değilsin — başlangıçta düşürülürsün.',
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
      setForm(defaultLobbyRaceForm(LOBBY_CONFIG));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yarış açılamadı.');
    } finally {
      setIsCreating(false);
      await refresh();
    }
  }, [form, refresh]);

  const playerCapOptions = useMemo(() => maxPlayersOptions(form.fieldSize, LOBBY_CONFIG), [form.fieldSize]);
  const updateForm = (patch: Partial<LobbyRaceForm>): void => setForm((current) => ({ ...current, ...patch }));
  const now = new Date();

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <h2 style={titleStyle()}>Ücretli Yarış Lobisi</h2>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button type="button" onClick={() => void refresh()} style={secondaryButtonStyle()}>
            Yenile
          </button>
          <button type="button" onClick={() => setIsFormOpen((open) => !open)} style={secondaryButtonStyle()}>
            {isFormOpen ? 'Vazgeç' : 'Yarış Aç'}
          </button>
        </div>
      </div>
      <p style={mutedStyle()}>
        Giriş ücretleri ödül havuzunu oluşturur; kadro botlarla at sayısına tamamlanır. Yalnızca başlangıçta
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
            At sayısı
            <select
              aria-label="At sayısı"
              value={form.fieldSize}
              onChange={(event) => {
                const fieldSize = Number(event.target.value);
                const caps = maxPlayersOptions(fieldSize, LOBBY_CONFIG);
                updateForm({ fieldSize, maxPlayers: caps.includes(form.maxPlayers) ? form.maxPlayers : (caps.at(-1) ?? form.maxPlayers) });
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
          <button type="button" onClick={() => void createRace()} disabled={isCreating} style={primaryButtonStyle(!isCreating)}>
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
                {horse.name} · Seviye {horse.level}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {notice !== null ? <p style={{ ...mutedStyle(), color: 'var(--color-status-positive)' }}>{notice}</p> : null}
      {error !== null ? <p style={{ ...mutedStyle(), color: 'var(--color-status-critical)' }}>{error}</p> : null}

      {races === null ? (
        <p style={mutedStyle()}>Lobi yükleniyor…</p>
      ) : races.length === 0 ? (
        <p style={mutedStyle()}>Şu an katılınabilir bir yarış yok — ilkini sen aç.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-md) 0 0 0', display: 'grid', gap: 'var(--space-sm)' }}>
          {races.map((race) => {
            const actions = lobbyEntryActions(race);
            const isBusy = busyRaceId === race.id;
            return (
              <li key={race.id} data-testid={`lobby-race-${race.id}`} style={rowStyle()}>
                <div style={{ display: 'grid', gap: '2px' }}>
                  <strong style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}>{race.name}</strong>
                  {describeTournament(race) !== null ? (
                    <span style={{ ...smallStyle(), color: 'var(--color-accent-gold)', fontWeight: 600 }}>
                      {describeTournament(race)}
                    </span>
                  ) : null}
                  <span style={smallStyle()}>
                    {SURFACE_LABELS[race.surface]} · {WEATHER_LABELS[race.weather]} · {race.distanceMeters} m ·{' '}
                    {formatStartsIn(race.startTime, now)}
                  </span>
                  <span style={smallStyle()}>
                    Oyuncu {race.joinedPlayers}/{race.maxPlayers} · {race.fieldSize} at · Giriş{' '}
                    {race.entryFee > 0 ? formatCurrency('money', race.entryFee) : 'ücretsiz'} · Havuz{' '}
                    {formatCurrency('money', race.prizePool)}
                    {race.prizeMultiplier !== null ? ` · Kazanana ${formatMultiplier(race.prizeMultiplier)}` : ''}
                  </span>
                  {race.myEntry !== null ? (
                    <span
                      style={{
                        ...smallStyle(),
                        color:
                          race.myEntry.status === 'ready' ? 'var(--color-status-positive)' : 'var(--color-status-warning)',
                      }}
                    >
                      {ENTRY_STATUS_LABELS[race.myEntry.status]}
                    </span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {actions.canJoin ? (
                    <button type="button" disabled={isBusy || effectiveHorseId === ''} onClick={() => join(race)} style={primaryButtonStyle(!isBusy)}>
                      Katıl
                    </button>
                  ) : null}
                  {race.myEntry === null && !actions.canJoin ? <span style={smallStyle()}>Dolu</span> : null}
                  {actions.canMarkReady ? (
                    <button type="button" disabled={isBusy} onClick={() => setReady(race, 'ready')} style={primaryButtonStyle(!isBusy)}>
                      Hazırım
                    </button>
                  ) : null}
                  {actions.canMarkNotReady ? (
                    <button type="button" disabled={isBusy} onClick={() => setReady(race, 'not_ready')} style={secondaryButtonStyle()}>
                      Hazır değilim
                    </button>
                  ) : null}
                  {actions.canLeave ? (
                    <button type="button" disabled={isBusy} onClick={() => leave(race)} style={secondaryButtonStyle()}>
                      Ayrıl (ücret iade)
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
