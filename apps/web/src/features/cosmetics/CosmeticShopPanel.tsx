'use client';

import Link from 'next/link';
import type { CosmeticItemView, CosmeticsCatalogView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { AvatarPortrait } from '../avatar/AvatarPortrait';
import { fieldOfCatalog, previewAppearance } from '../avatar/avatar-catalog';
import { groupCosmeticsByCatalog } from './cosmetic-logic';

/** Mağaza bölüm başlıkları (katalog anahtarı → başlık); bilinmeyen katalog "Diğer". */
const SECTION_TITLES: Record<string, string> = {
  silkColors: 'Forma renkleri',
  hats: 'Şapkalar',
  accessories: 'Aksesuarlar',
};

/**
 * Kozmetik mağaza listesi (09.10.2026). Elmasla YALNIZCA görünüş satılır
 * (elmas politikası); fiyat ve ürün sunucudan gelir. Renk ürünü renk
 * örneğiyle, parça ürünü (şapka/aksesuar) sabit bir avatar önizlemesiyle
 * gösterilir.
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
      <h2 className="avatar-section-title">Görünüş mağazası</h2>
      <p className="session-meta">
        Elmasla yalnızca görünüş alınır — yarışa etkisi yoktur. Aldığın parçayı <Link href="/avatar">Avatarım</Link>{' '}
        ekranında giyersin; forma rengi yarışta jokeyinde görünür. Elmasın:{' '}
        <strong>{catalog.gems.toLocaleString('tr-TR')}</strong>
      </p>
      <div data-testid="cosmetic-list">
        {groupCosmeticsByCatalog(catalog.items).map(([catalogKey, items]) => (
          <section key={catalogKey} className="cosmetic-section">
            <h3 className="cosmetic-section-title">{SECTION_TITLES[catalogKey] ?? 'Diğer'}</h3>
            <ul className="cosmetic-list">
              {items.map((item) => (
                <CosmeticRow key={item.key} item={item} gems={catalog.gems} busyKey={busyKey} onBuy={onBuy} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </GlassPanel>
  );
}

function CosmeticRow({
  item,
  gems,
  busyKey,
  onBuy,
}: {
  item: CosmeticItemView;
  gems: number;
  busyKey: string | null;
  onBuy: (key: string) => void;
}): React.ReactElement {
  const field = fieldOfCatalog(item.catalog);
  return (
    <li className="cosmetic-item">
      {item.color !== null || field === null ? (
        <span aria-hidden="true" className="cosmetic-swatch" style={{ background: item.color ?? 'transparent' }} />
      ) : (
        <span aria-hidden="true" className="cosmetic-preview">
          <AvatarPortrait appearance={previewAppearance(field, item.optionId)} size={52} label="" />
        </span>
      )}
      <span className="cosmetic-name">{item.name}</span>
      {item.owned ? (
        <span className="cosmetic-owned">✓ Sende</span>
      ) : (
        <button
          type="button"
          className="moderation-primary"
          disabled={busyKey !== null || gems < item.priceGems}
          onClick={() => onBuy(item.key)}
          aria-label={`${item.name} satın al (${item.priceGems} elmas)`}
        >
          {busyKey === item.key ? 'Alınıyor…' : `${item.priceGems} 💎`}
        </button>
      )}
    </li>
  );
}
