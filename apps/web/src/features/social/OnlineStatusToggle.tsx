'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';

/** 16.10.2026 — gizlilik: çevrimiçi durumumu arkadaşlarıma göster / gizle. */
export function OnlineStatusToggle({ playerId }: { playerId: string }): React.ReactElement | null {
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getPrivacy(playerId)
      .then((privacy) => setValue(privacy.showOnlineStatus))
      .catch(() => setValue(null));
  }, [playerId]);

  if (value === null) return null;

  const toggle = async (next: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setValue((await apiClient.setPrivacy(playerId, next)).showOnlineStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ayar kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="social-privacy" data-testid="online-status-toggle">
      <input type="checkbox" checked={value} disabled={busy} onChange={(event) => void toggle(event.target.checked)} />
      Çevrimiçi durumumu ve son görülmemi arkadaşlarıma göster
      {error ? <span className="friend-gift-error"> {error}</span> : null}
    </label>
  );
}
