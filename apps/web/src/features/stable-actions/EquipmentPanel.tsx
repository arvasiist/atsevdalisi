'use client';

/**
 * AHIR İÇİNDE EKİPMAN (08.10.2026). Eski `/equipment` sayfasının içeriği —
 * sahibinin isteğiyle ayrı menü sayfası kalktı, ekipman ahır sahnesindeki
 * "Ekipman" simgesinden açılır ve sahnedeki at için yönetilir. Davranış
 * değişmedi: `GET/POST /horses/:id/equipment`, `…/:equipmentId/equip|unequip`.
 *
 * `EQUIPMENT_TYPES` `apps/api/src/domain/equipment/validation.ts` ile BİREBİR
 * aynı tutulmalıdır (apps/web apps/api'nin domain koduna import edemez).
 * Kuşanılan parça `RaceEntrantSnapshot.equipmentModifier` üzerinden motoru
 * küçük ve sınırlı şekilde etkiler (`docs/API.md` "Ekipman").
 */

import { useEffect, useState } from 'react';
import type { EquipmentType, HorseEquipment, PublicHorse } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';

const EQUIPMENT_TYPES: readonly EquipmentType[] = ['saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'];
const DEFAULT_QUALITY = 70;
const NAME_MAX_LENGTH = 60;

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  saddle: 'Eyer',
  bridle: 'Dizgin',
  horseshoe: 'Nal',
  blinkers: 'Göz Siperi',
  leg_wraps: 'Bacak Bandajı',
};

export interface EquipmentPanelProps {
  horse: Pick<PublicHorse, 'id' | 'name'>;
}

export function EquipmentPanel({ horse }: EquipmentPanelProps): React.ReactElement {
  const [items, setItems] = useState<HorseEquipment[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('saddle');
  const [name, setName] = useState('');
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadItems = async (horseId: string) => {
    setItemsError(null);
    try {
      setItems(await apiClient.getHorseEquipment(horseId));
    } catch (err: unknown) {
      setItemsError(err instanceof Error ? err.message : 'Ekipman envanteri yüklenemedi');
    }
  };

  useEffect(() => {
    setItems(null);
    setMessage(null);
    void loadItems(horse.id);
    // Bağımlılık bilinçli olarak yalnızca at kimliği (kök eslint'te react-hooks yok).
  }, [horse.id]);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && !isCreating;

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }
    setIsCreating(true);
    setMessage(null);
    try {
      await apiClient.createHorseEquipment(horse.id, { equipmentType, name: trimmedName, quality });
      setName('');
      setQuality(DEFAULT_QUALITY);
      setMessage('Ekipman envantere eklendi.');
      await loadItems(horse.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Ekipman eklenemedi');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleEquip = async (item: HorseEquipment) => {
    setPendingActionId(item.id);
    setMessage(null);
    try {
      if (item.equipped) {
        await apiClient.unequipHorseEquipment(horse.id, item.id);
      } else {
        await apiClient.equipHorseEquipment(horse.id, item.id);
      }
      await loadItems(horse.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'İşlem başarısız oldu');
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <div className="stable-action-body" data-testid="stable-equipment-panel">
      <div className="stable-action-group">
        <span className="stable-action-label">Envanter</span>
        {itemsError ? <p className="stable-action-message" data-error="true">{itemsError}</p> : null}
        {items === null && !itemsError ? <p className="stable-action-muted">Envanter yükleniyor…</p> : null}
        {items && items.length === 0 ? (
          <p className="stable-action-muted">Bu at için henüz hiç ekipman yok.</p>
        ) : null}
        {items && items.length > 0 ? (
          <div style={{ display: 'grid', gap: '6px' }}>
            {items.map((item) => (
              <div key={item.id} className="stable-equipment-row" data-equipped={item.equipped ? 'true' : undefined}>
                <div style={{ display: 'grid', gap: '2px' }}>
                  <span className="stable-equipment-name">
                    {EQUIPMENT_TYPE_LABELS[item.equipmentType]} · {item.name}
                  </span>
                  <span className="stable-action-muted">Kalite: {item.quality}</span>
                </div>
                <button
                  type="button"
                  disabled={pendingActionId === item.id}
                  onClick={() => void handleToggleEquip(item)}
                  className="stable-chip"
                  aria-pressed={item.equipped}
                >
                  {pendingActionId === item.id ? '…' : item.equipped ? 'Kuşanılmış' : 'Kuşandır'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="stable-action-group">
        <span className="stable-action-label">Yeni ekipman — tip</span>
        <div className="stable-action-chips">
          {EQUIPMENT_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setEquipmentType(option)}
              className="stable-chip"
              aria-pressed={option === equipmentType}
            >
              {EQUIPMENT_TYPE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="stable-action-group">
        <label htmlFor="equipment-name-input" className="stable-action-label">
          İsim
        </label>
        <input
          id="equipment-name-input"
          type="text"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder="ör. Deri Eyer"
          className="stable-text-input"
        />
      </div>

      <div className="stable-action-group">
        <label htmlFor="equipment-quality-input" className="stable-action-label">
          Kalite: {quality}
        </label>
        <input
          id="equipment-quality-input"
          type="range"
          min={0}
          max={100}
          step={5}
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
        />
      </div>

      <button type="button" disabled={!canCreate} onClick={() => void handleCreate()} className="btn-gold">
        {isCreating ? 'Ekleniyor…' : 'Envantere Ekle'}
      </button>

      {message ? <p className="stable-action-message">{message}</p> : null}
    </div>
  );
}
