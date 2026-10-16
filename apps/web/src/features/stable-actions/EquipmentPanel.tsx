'use client';

/**
 * AHIR İÇİNDE EKİPMAN (08.10.2026). Eski `/equipment` sayfasının içeriği —
 * sahibinin isteğiyle ayrı menü sayfası kalktı, ekipman ahır sahnesindeki
 * "Ekipman" simgesinden açılır ve sahnedeki at için yönetilir. Davranış
 * değişmedi: `GET /horses/:id/equipment`, `…/:equipmentId/equip|unequip`.
 *
 * 08.10.2026 — yeni parça artık KATALOGDAN, oyun parasıyla alınır
 * (`POST /horses/:id/equipment` gövdesi yalnızca `catalogKey`). Eskiden kalite
 * kaydırıcıyla seçiliyordu ve ücretsizdi — her at bedavaya azami bonus alırdı.
 * PARA YOLU: `Idempotency-Key` kalem başına BAŞARIYA kadar saklanır.
 *
 * `EQUIPMENT_TYPES` `apps/api/src/domain/equipment/validation.ts` ile BİREBİR
 * aynı tutulmalıdır (apps/web apps/api'nin domain koduna import edemez).
 * Kuşanılan parça `RaceEntrantSnapshot.equipmentModifier` üzerinden motoru
 * küçük ve sınırlı şekilde etkiler (`docs/API.md` "Ekipman").
 */

import { useEffect, useRef, useState } from 'react';
import type { EquipmentType, HorseEquipment, PublicHorse } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';
import { catalogItemsOfType, describeEquipmentPurchase, equipmentPurchaseBlock } from './equipment-catalog';

const EQUIPMENT_TYPES: readonly EquipmentType[] = ['saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'];

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
  const { player, refresh } = usePlayer();
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('saddle');
  const [buyingKey, setBuyingKey] = useState<string | null>(null);
  // PARA YOLU: kalem başına anahtar BAŞARIYA kadar yaşar (yanıt ağda
  // kaybolursa tekrar basış ikinci parçayı ALMAZ).
  const purchaseKeys = useRef(new Map<string, string>());
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

  const handleBuy = async (catalogKey: string) => {
    const slot = `${horse.id}:${catalogKey}`;
    const key = purchaseKeys.current.get(slot) ?? crypto.randomUUID();
    purchaseKeys.current.set(slot, key);
    setBuyingKey(catalogKey);
    setMessage(null);
    try {
      const result = await apiClient.purchaseHorseEquipment(horse.id, catalogKey, key);
      purchaseKeys.current.delete(slot);
      setMessage(describeEquipmentPurchase(result));
      await Promise.all([loadItems(horse.id), refresh()]);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Ekipman alınamadı');
    } finally {
      setBuyingKey(null);
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
        <span className="stable-action-label">Ekipman al — tip</span>
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

      <div className="stable-action-group" data-testid="equipment-catalog">
        {catalogItemsOfType(equipmentType).map((item) => {
          const block = equipmentPurchaseBlock(item, player);
          return (
            <div key={item.key} className="stable-equipment-row">
              <div style={{ display: 'grid', gap: '2px' }}>
                <span className="stable-equipment-name">{item.name}</span>
                <span className="stable-action-muted">
                  Kalite {item.quality} · {item.priceMoney} çip
                  {block === 'level' ? ` · Sv. ${item.requiredLevel} gerekir` : ''}
                </span>
              </div>
              <button
                type="button"
                className="stable-chip"
                disabled={block !== null || buyingKey !== null}
                onClick={() => void handleBuy(item.key)}
                title={block === 'money' ? 'Çipin yetmiyor' : block === 'level' ? 'Seviyen yetmiyor' : undefined}
              >
                {buyingKey === item.key ? '…' : 'Satın Al'}
              </button>
            </div>
          );
        })}
      </div>

      {message ? <p className="stable-action-message">{message}</p> : null}
    </div>
  );
}
