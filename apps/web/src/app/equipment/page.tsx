'use client';

/**
 * Ekipman — `claude/hizli-bitirme-plani.md`'nin proje sahibi tarafından
 * "düşük riskli, karar gerektirmeyen" bucket'ta önceliklendirdiği dilim
 * (bkz. proje sahibinin `AskUserQuestion` yanıtı). Backend (`POST /horses/
 * :id/equipment`, `apps/api/src/domain/equipment/`) bu turda SIFIRDAN
 * eklendi — `training/page.tsx`'in "önce backend zaten var, sadece arayüz
 * eksikti" durumunun AKSİNE, burada HEM backend HEM arayüz bu turda
 * birlikte inşa edildi.
 *
 * `EquipmentType`/`EQUIPMENT_TYPES` listesi `apps/api/src/domain/
 * equipment/validation.ts`'teki `EQUIPMENT_TYPES` ile BİREBİR aynı
 * tutulmalıdır — `training/page.tsx`'teki `TRAINING_TYPES` kopyalama
 * gerekçesiyle AYNI (apps/web apps/api'nin domain koduna import edemez).
 *
 * Kuşanılan bir parça, `RaceEntrantSnapshot.equipmentModifier` üzerinden
 * gerçek Race Engine sonuçlarını (küçük ve kontrollü şekilde) etkiler —
 * bkz. `docs/API.md` "Ekipman" bölümündeki "Race Engine'e etkisi" notu.
 */

import { useEffect, useMemo, useState } from 'react';
import type { EquipmentType, HorseEquipment, PublicHorse } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { HorseAvatar } from '../../components/ui/HorseAvatar';
import { apiClient } from '../../lib/api-client';
import { usePlayer } from '../../lib/player-context';

const EQUIPMENT_TYPES: readonly EquipmentType[] = ['saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'];
const DEFAULT_QUALITY = 70;

const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  saddle: 'Eyer',
  bridle: 'Dizgin',
  horseshoe: 'Nal',
  blinkers: 'Göz Siperi',
  leg_wraps: 'Bacak Bandajı',
};

export default function EquipmentPage(): React.ReactElement {
  const { player, isLoading: isPlayerLoading, error: playerError, createPlayer } = usePlayer();
  const [horses, setHorses] = useState<PublicHorse[] | null>(null);
  const [horsesError, setHorsesError] = useState<string | null>(null);
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);
  const [items, setItems] = useState<HorseEquipment[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('saddle');
  const [name, setName] = useState('');
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadHorses = async (ownerId: string) => {
    setHorsesError(null);
    try {
      const data = await apiClient.getHorsesByOwner(ownerId);
      setHorses(data);
      setSelectedHorseId((current) => current ?? data[0]?.id ?? null);
    } catch (err: unknown) {
      setHorsesError(err instanceof Error ? err.message : 'Atlar yüklenemedi');
    }
  };

  useEffect(() => {
    if (!player) {
      return;
    }
    setHorses(null);
    void loadHorses(player.id);
    // NOT: bu repo'nun kök `.eslintrc.cjs`'inde `eslint-plugin-react-hooks`
    // KURULU DEĞİL (`training/page.tsx` ile AYNI ders) — bağımlılık dizisi
    // bilinçli olarak yalnızca `player?.id`.
  }, [player?.id]);

  const selectedHorse = useMemo(
    () => horses?.find((horse) => horse.id === selectedHorseId) ?? null,
    [horses, selectedHorseId],
  );

  const loadItems = async (horseId: string) => {
    setItemsError(null);
    try {
      const data = await apiClient.getHorseEquipment(horseId);
      setItems(data);
    } catch (err: unknown) {
      setItemsError(err instanceof Error ? err.message : 'Ekipman envanteri yüklenemedi');
    }
  };

  useEffect(() => {
    if (!selectedHorseId) {
      setItems(null);
      return;
    }
    setItems(null);
    void loadItems(selectedHorseId);
  }, [selectedHorseId]);

  const handleCreate = async () => {
    if (!selectedHorse || name.trim().length === 0) {
      return;
    }
    setIsCreating(true);
    setMessage(null);
    try {
      await apiClient.createHorseEquipment(selectedHorse.id, { equipmentType, name: name.trim(), quality });
      setName('');
      setQuality(DEFAULT_QUALITY);
      setMessage('Ekipman envantere eklendi.');
      await loadItems(selectedHorse.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Ekipman eklenemedi');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleEquip = async (item: HorseEquipment) => {
    if (!selectedHorse) {
      return;
    }
    setPendingActionId(item.id);
    setMessage(null);
    try {
      if (item.equipped) {
        await apiClient.unequipHorseEquipment(selectedHorse.id, item.id);
      } else {
        await apiClient.equipHorseEquipment(selectedHorse.id, item.id);
      }
      await loadItems(selectedHorse.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'İşlem başarısız oldu');
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <main className="page-container">
      <h1 style={{ fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '4px' }}>Ekipman</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-lg)' }}>
        Atına eyer, dizgin, nal, göz siperi veya bacak bandajı ekle ve kuşandır — kuşanılmış ekipman, kalitesiyle
        orantılı küçük bir performans bonusu sağlar.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
            Ekipman yönetebilmek için önce bir seyis/jokey hesabı oluştur.
          </p>
          <button type="button" onClick={() => void createPlayer()} style={primaryButtonStyle()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p> : null}
        </GlassPanel>
      ) : null}

      {horsesError ? <p style={{ color: 'var(--color-status-critical)' }}>{horsesError}</p> : null}

      {player && horses === null && !horsesError ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Atlar yükleniyor…</p>
      ) : null}

      {player && horses && horses.length === 0 ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Ahırında bir at bulunamıyor.</p>
        </GlassPanel>
      ) : null}

      {player && horses && horses.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)', gridTemplateColumns: 'minmax(0, 1fr)' }} className="equipment-grid">
          <GlassPanel>
            <h2 style={sectionTitleStyle()}>At Seç</h2>
            <div style={{ display: 'grid', gap: '8px' }}>
              {horses.map((horse) => (
                <button
                  key={horse.id}
                  type="button"
                  onClick={() => setSelectedHorseId(horse.id)}
                  style={horseRowStyle(horse.id === selectedHorseId)}
                >
                  <HorseAvatar horseId={horse.id} size={40} />
                  <div style={{ display: 'grid', gap: '2px', textAlign: 'left', flex: 1 }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{horse.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel>
            <h2 style={sectionTitleStyle()}>Yeni Ekipman</h2>

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <label style={labelStyle()}>Tip</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {EQUIPMENT_TYPES.map((option) => (
                  <button key={option} type="button" onClick={() => setEquipmentType(option)} style={chipStyle(option === equipmentType)}>
                    {EQUIPMENT_TYPE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <label htmlFor="equipment-name-input" style={labelStyle()}>
                İsim
              </label>
              <input
                id="equipment-name-input"
                type="text"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="ör. Deri Eyer"
                style={textInputStyle()}
              />
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
              <label htmlFor="equipment-quality-input" style={labelStyle()}>
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

            <button
              type="button"
              disabled={!selectedHorse || name.trim().length === 0 || isCreating}
              onClick={() => void handleCreate()}
              style={primaryButtonStyle(!selectedHorse || name.trim().length === 0 || isCreating)}
            >
              {isCreating ? 'Ekleniyor…' : 'Envantere Ekle'}
            </button>

            {message ? <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-text-primary)' }}>{message}</p> : null}
          </GlassPanel>

          <GlassPanel style={{ gridColumn: '1 / -1' }}>
            <h2 style={sectionTitleStyle()}>Envanter</h2>

            {itemsError ? <p style={{ color: 'var(--color-status-critical)' }}>{itemsError}</p> : null}

            {selectedHorse && items === null && !itemsError ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Envanter yükleniyor…</p>
            ) : null}

            {selectedHorse && items && items.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Bu at için henüz hiç ekipman yok.</p>
            ) : null}

            {selectedHorse && items && items.length > 0 ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {items.map((item) => (
                  <div key={item.id} style={itemRowStyle(item.equipped)}>
                    <div style={{ display: 'grid', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {EQUIPMENT_TYPE_LABELS[item.equipmentType]} · {item.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Kalite: {item.quality}</span>
                    </div>
                    <button
                      type="button"
                      disabled={pendingActionId === item.id}
                      onClick={() => void handleToggleEquip(item)}
                      style={chipStyle(item.equipped)}
                    >
                      {pendingActionId === item.id ? '…' : item.equipped ? 'Kuşanılmış' : 'Kuşandır'}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </GlassPanel>
        </div>
      ) : null}

      <style>{`
        @media (min-width: 900px) {
          .equipment-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

function sectionTitleStyle(): React.CSSProperties {
  return { fontSize: '15px', color: 'var(--color-text-primary)', marginTop: 0, marginBottom: 'var(--space-md)' };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: '12px', color: 'var(--color-text-secondary)' };
}

function horseRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${selected ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
    background: selected ? 'rgba(227, 179, 65, 0.1)' : 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function chipStyle(selected: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '8px 14px',
    borderRadius: '999px',
    border: `1px solid ${selected ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
    background: selected ? 'var(--color-accent-gold)' : 'transparent',
    color: selected ? '#1a1405' : 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function textInputStyle(): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
  };
}

function itemRowStyle(equipped: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-sm)',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${equipped ? 'var(--color-accent-gold)' : 'var(--color-border)'}`,
  };
}

function primaryButtonStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '12px 24px',
    background: disabled ? 'var(--color-bg-surface-elevated)' : 'var(--color-accent-gold)',
    color: disabled ? 'var(--color-text-muted)' : '#1a1405',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
