'use client';

/**
 * Ahır sahnesinin üstündeki işlem simgeleri + sahnenin içinde açılan panel
 * (08.10.2026). Panel sahnedeki at için açılır; at değişince panel de o ata
 * geçer. Geniş ekranda sahnenin sağında, telefonda alttan açılan çekmecedir.
 */

import { HeartPulse, Wrench, X } from 'lucide-react';
import type { PublicHorse } from '@at-sevdalisi/shared-types';
import { CarePanel } from './CarePanel';
import { EquipmentPanel } from './EquipmentPanel';
import { STABLE_ACTIONS, type StableActionKey } from './stable-actions';

const ICONS: Record<StableActionKey, React.ReactNode> = {
  care: <HeartPulse size={20} aria-hidden="true" />,
  equipment: <Wrench size={20} aria-hidden="true" />,
};

export interface StableActionDockProps {
  horse: PublicHorse;
  active: StableActionKey | null;
  onSelect: (key: StableActionKey | null) => void;
  onHorseChanged: () => Promise<void>;
}

export function StableActionDock({
  horse,
  active,
  onSelect,
  onHorseChanged,
}: StableActionDockProps): React.ReactElement {
  const activeAction = STABLE_ACTIONS.find((action) => action.key === active) ?? null;
  return (
    <>
      <div className="stable-dock" role="toolbar" aria-label="Ahır işlemleri">
        {STABLE_ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            className="stable-dock-button"
            aria-pressed={active === action.key}
            title={action.description}
            data-testid={`stable-action-${action.key}`}
            onClick={() => onSelect(active === action.key ? null : action.key)}
          >
            {ICONS[action.key]}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      {activeAction ? (
        <aside className="stable-drawer" aria-label={`${activeAction.label} — ${horse.name}`}>
          <header className="stable-drawer-header">
            <span className="stable-drawer-icon">{ICONS[activeAction.key]}</span>
            <div style={{ display: 'grid', minWidth: 0 }}>
              <strong>{activeAction.label}</strong>
              <span className="stable-drawer-horse">{horse.name}</span>
            </div>
            <button
              type="button"
              className="stable-drawer-close"
              aria-label="Paneli kapat"
              onClick={() => onSelect(null)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {activeAction.key === 'care' ? (
            <CarePanel horse={horse} onHorseChanged={onHorseChanged} />
          ) : (
            <EquipmentPanel horse={horse} />
          )}
        </aside>
      ) : null}
    </>
  );
}
