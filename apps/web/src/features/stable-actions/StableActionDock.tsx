'use client';

/**
 * Ahır sahnesinin üstündeki işlem simgeleri + sahnenin içinde açılan panel
 * (08.10.2026). Panel sahnedeki at için açılır; at değişince panel de o ata
 * geçer. Geniş ekranda sahnenin sağında, telefonda alttan açılan çekmecedir.
 */

import Link from 'next/link';
import { HeartPulse, LayoutGrid, ShoppingCart, Trophy, Warehouse, Wrench, X } from 'lucide-react';
import type { PublicHorse, StableSummaryView } from '@at-sevdalisi/shared-types';
import { CarePanel } from './CarePanel';
import { EquipmentPanel } from './EquipmentPanel';
import { StableUpgradePanel } from './StableUpgradePanel';
import { StableLayoutPanel } from './StableLayoutPanel';
import { STABLE_ACTIONS, type StableActionKey } from './stable-actions';

const ICONS: Record<StableActionKey, React.ReactNode> = {
  care: <HeartPulse size={20} aria-hidden="true" />,
  equipment: <Wrench size={20} aria-hidden="true" />,
  layout: <LayoutGrid size={20} aria-hidden="true" />,
  upgrade: <Warehouse size={20} aria-hidden="true" />,
};

/** Ahıra ait (ata değil) paneller: başlıkta at adı yerine "Ahırın" yazar. */
const STABLE_WIDE: ReadonlySet<StableActionKey> = new Set(['layout', 'upgrade']);

export interface StableActionDockProps {
  horse: PublicHorse;
  active: StableActionKey | null;
  onSelect: (key: StableActionKey | null) => void;
  onHorseChanged: () => Promise<void>;
  /** 16.10.2026 — "Bölmeler" paneli için ahır verisi (yüklenmediyse `null`, panel bekler). */
  layout?: {
    playerId: string;
    horses: readonly PublicHorse[];
    summary: StableSummaryView;
    onShowHorse: (horseId: string) => void;
  } | null;
}

export function StableActionDock({
  horse,
  active,
  onSelect,
  onHorseChanged,
  layout = null,
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
        {/* 16.10.2026 — brief §3.1: ahırdan yarışa ve pazara tek dokunuş
            (üst menüde artık yalnızca dört ana bölüm var). */}
        <Link href="/races" className="stable-dock-button" data-testid="stable-link-races" title="Yarışa katıl">
          <Trophy size={20} aria-hidden="true" />
          <span>Yarışlar</span>
        </Link>
        <Link href="/market" className="stable-dock-button" data-testid="stable-link-market" title="At al / sat">
          <ShoppingCart size={20} aria-hidden="true" />
          <span>Pazar</span>
        </Link>
      </div>
      {activeAction ? (
        <aside
          className="stable-drawer"
          aria-label={STABLE_WIDE.has(activeAction.key) ? activeAction.label : `${activeAction.label} — ${horse.name}`}
        >
          <header className="stable-drawer-header">
            <span className="stable-drawer-icon">{ICONS[activeAction.key]}</span>
            <div style={{ display: 'grid', minWidth: 0 }}>
              <strong>{activeAction.label}</strong>
              <span className="stable-drawer-horse">{STABLE_WIDE.has(activeAction.key) ? 'Ahırın' : horse.name}</span>
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
          ) : activeAction.key === 'equipment' ? (
            <EquipmentPanel horse={horse} />
          ) : activeAction.key === 'layout' ? (
            layout ? (
              <StableLayoutPanel
                playerId={layout.playerId}
                horses={layout.horses}
                summary={layout.summary}
                onChanged={onHorseChanged}
                onShowHorse={layout.onShowHorse}
                onOpenUpgrade={() => onSelect('upgrade')}
              />
            ) : (
              <p className="stable-action-muted">Ahır yükleniyor…</p>
            )
          ) : (
            <StableUpgradePanel onUpgraded={onHorseChanged} />
          )}
        </aside>
      ) : null}
    </>
  );
}
