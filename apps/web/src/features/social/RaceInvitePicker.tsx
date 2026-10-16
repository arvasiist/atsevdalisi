'use client';

import { useState } from 'react';
import type { RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { invitableRaces } from './race-invite';

/**
 * 16.10.2026 — sosyal brief §3 "arkadaşı oyuna davet et". Uç (`POST
 * /players/:id/race-invites`) vardı, arayüzü yoktu. Açılınca açık yarışlar
 * listelenir (katıldıkların önce); kural (arkadaşlık, engel, açık yarış,
 * bekleyen davet tavanı) sunucudadır.
 */
export function RaceInvitePicker({
  playerId,
  friendId,
  friendName,
}: {
  playerId: string;
  friendId: string;
  friendName: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [races, setRaces] = useState<RaceLobbyListItem[] | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const openPicker = async (): Promise<void> => {
    setOpen(true);
    setMessage(null);
    try {
      const list = invitableRaces(await apiClient.listLobbyRaces(), new Date());
      setRaces(list);
      setSelected(list[0]?.id ?? '');
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Yarışlar yüklenemedi.' });
    }
  };

  const send = async (): Promise<void> => {
    if (selected === '') return;
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.sendRaceInvite(playerId, friendId, selected);
      setMessage({ tone: 'ok', text: `${friendName} davet edildi.` });
      setOpen(false);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Davet gönderilemedi.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="race-invite-picker" data-testid="race-invite-picker">
      {!open ? (
        <button type="button" className="btn-outline" onClick={() => void openPicker()}>
          Yarışa Davet
        </button>
      ) : races === null ? (
        <span className="friend-gift-hint">Yarışlar yükleniyor…</span>
      ) : races.length === 0 ? (
        <span className="friend-gift-hint">Davet edilebilecek açık yarış yok — Yarışlar ekranından bir yarış aç.</span>
      ) : (
        <>
          <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Davet edilecek yarış">
            {races.map((race) => (
              <option key={race.id} value={race.id}>
                {race.myEntry !== null ? '★ ' : ''}
                {race.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-gold" disabled={busy} onClick={() => void send()}>
            {busy ? 'Gönderiliyor…' : 'Davet Et'}
          </button>
          <button type="button" className="btn-outline" onClick={() => setOpen(false)}>
            Vazgeç
          </button>
        </>
      )}
      {message ? (
        <span className={message.tone === 'ok' ? 'friend-gift-notice' : 'friend-gift-error'} role="status">
          {message.text}
        </span>
      ) : null}
    </span>
  );
}
