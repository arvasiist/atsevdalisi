'use client';

import type { PresenceView } from '@at-sevdalisi/shared-types';
import { describePresence } from './presence';

/** 16.10.2026 — arkadaş satırında çevrimiçi durumu (yeşil nokta + metin). */
export function PresenceBadge({ presence, now }: { presence: PresenceView; now: Date }): React.ReactElement {
  const { label, tone } = describePresence(presence, now);
  return (
    <span className="presence-badge" data-tone={tone} data-testid="presence-badge">
      <span className="presence-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
