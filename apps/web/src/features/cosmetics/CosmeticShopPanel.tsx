'use client';

import Link from 'next/link';
import type { CosmeticsCatalogView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';

/**
 * Kozmetik mağaza listesi (09.10.2026). Elmasla YALNIZCA görünüş satılır
 * (elmas politikası); fiyat ve ürün sunucudan gelir.
 */
export function CosmeticShopPanel({
  catalog,
  busyKey,
  onBuy,
}: {
  catalog: CosmeticsCatalogView;
  busyKey: string | null;
  onBuy: (key: string) => void;
}): React.ReactElement {
  return (
    <GlassPanel>
      <h2 className="avatar-section-title">Forma renkleri</h2>
      <p className="session-meta">
        Elmasla yalnızca görünüş alınır — yarışa etkisi yoktur. Aldığın rengi <Link href="/avatar">Avatarım</Link> ekranında
        jokey formana uygularsın. Elmasın: <strong>{catalog.gems.toLocaleString('tr-TR')}</strong>
      </p>
      <ul className="cosmetic-list" data-testid="cosmetic-list">
        {catalog.items.map((item) => (
          <li key={item.key} className="cosmetic-item">
            <span
              aria-hidden="true"
              className="cosmetic-swatch"
              style={{ background: item.color ?? 'transparent' }}
            />
            <span className="cosmetic-name">{item.name}</span>
            {item.owned ? (
              <span className="cosmetic-owned">✓ Sende</span>
            ) : (
              <button
                type="button"
                className="moderation-primary"
                disabled={busyKey !== null || catalog.gems < item.priceGems}
                onClick={() => onBuy(item.key)}
                aria-label={`${item.name} satın al (${item.priceGems} elmas)`}
              >
                {busyKey === item.key ? 'Alınıyor…' : `${item.priceGems} 💎`}
              </button>
            )}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
