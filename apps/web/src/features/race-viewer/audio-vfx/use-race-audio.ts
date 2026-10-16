'use client';

/**
 * SES KANCALARI (01.10.2026, 3D adım 9).
 *
 * - `useAudioMuted`: tek sessiz/açık tercihi (tarayıcıda saklanır).
 *   VARSAYILAN SESSİZ — tarayıcılar kullanıcı etkileşimi olmadan sesi
 *   zaten engeller; "Sesi aç" tıklaması o etkileşimdir.
 * - `useRaceAudio`: oynatma durumundan olay türetir (`deriveRaceAudioCues`)
 *   ve `RaceAudioManager`a verir; kalabalık hacmi tribün heyecanıyla aynı
 *   değerden gelir.
 * - `useStableAmbience`: ahır ortam döngüsü.
 *
 * Ses kapalıyken yönetici HİÇ kurulmaz (indirme/yoklama yok). Dosyalar
 * eksikse `createProbedAudioBackend` sessizce susar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAudioConfig } from '@at-sevdalisi/game-config';
import { RaceAudioManager } from './audio-manager';
import { createHtmlAudioBackend } from './html-audio-backend';
import { createProbedAudioBackend } from './probed-audio-backend';
import { deriveRaceAudioCues, type RaceAudioFrame } from './race-audio-cues';
import type { RaceSurface } from '@at-sevdalisi/shared-types';

const AUDIO_CONFIG = loadAudioConfig();
const MUTED_STORAGE_KEY = 'at-sevdalisi:audio-muted';
const MUTED_EVENT = 'at-sevdalisi:audio-muted-change';

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function useAudioMuted(): [boolean, (muted: boolean) => void] {
  const [muted, setMutedState] = useState(true);
  useEffect(() => {
    setMutedState(readMuted());
    const sync = (): void => setMutedState(readMuted());
    window.addEventListener(MUTED_EVENT, sync);
    return () => window.removeEventListener(MUTED_EVENT, sync);
  }, []);
  const setMuted = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(MUTED_STORAGE_KEY, String(next));
    } catch {
      // Depolama kapalıysa tercih yalnızca bu sayfada yaşar.
    }
    setMutedState(next);
    window.dispatchEvent(new Event(MUTED_EVENT));
  }, []);
  return [muted, setMuted];
}

function useAudioManager(muted: boolean): RaceAudioManager | null {
  const [manager, setManager] = useState<RaceAudioManager | null>(null);
  useEffect(() => {
    if (muted || typeof Audio === 'undefined') {
      setManager(null);
      return undefined;
    }
    const created = new RaceAudioManager(
      AUDIO_CONFIG,
      createProbedAudioBackend(createHtmlAudioBackend()),
    );
    setManager(created);
    return () => created.stopAll();
  }, [muted]);
  return manager;
}

export interface RaceAudioInput extends RaceAudioFrame {
  muted: boolean;
  surface?: RaceSurface;
  crowdExcitement: number;
  leaderSpeedMps: number;
  /** Duraklatılmışken döngüler susar (bitiş sesi yine çalar). */
  isPlaying: boolean;
}

export function useRaceAudio(input: RaceAudioInput): void {
  const manager = useAudioManager(input.muted);
  const prevFrameRef = useRef<RaceAudioFrame | null>(null);
  const lastOvertakeRef = useRef<number | null>(null);
  const { timeMs, started, leaderHorseId, inFinalStretch, isFinished, surface, isPlaying } = input;

  // Yönetici değişince (ses açıldı) ya da duraklatılınca: döngüler susar,
  // devam edilince baştan türetilir (yalnızca `race_start` döngüleri).
  useEffect(() => {
    prevFrameRef.current = null;
    lastOvertakeRef.current = null;
  }, [manager]);
  useEffect(() => {
    if (!manager || isPlaying || isFinished) return;
    manager.stopAll();
    prevFrameRef.current = null;
  }, [manager, isPlaying, isFinished]);

  useEffect(() => {
    if (!manager || (!isPlaying && !isFinished)) return;
    const frame: RaceAudioFrame = { timeMs, started, leaderHorseId, inFinalStretch, isFinished };
    const result = deriveRaceAudioCues(
      prevFrameRef.current,
      frame,
      lastOvertakeRef.current,
      AUDIO_CONFIG,
    );
    prevFrameRef.current = frame;
    lastOvertakeRef.current = result.lastOvertakeAtMs;
    if (result.reset) manager.stopAll();
    for (const type of result.events) manager.handleEvent({ type, surface });
  }, [manager, isPlaying, timeMs, started, leaderHorseId, inFinalStretch, isFinished, surface]);

  useEffect(() => {
    manager?.setCrowdExcitement(input.crowdExcitement);
  }, [manager, input.crowdExcitement]);

  useEffect(() => {
    manager?.updateHoofbeatIntensity(input.leaderSpeedMps, AUDIO_CONFIG.hoofbeat.referenceSpeedMps);
  }, [manager, input.leaderSpeedMps]);
}

export function useStableAmbience(muted: boolean): void {
  const manager = useAudioManager(muted);
  useEffect(() => {
    manager?.startStableAmbience();
  }, [manager]);
}
