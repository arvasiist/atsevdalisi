'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CosmeticsCatalogView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';

/**
 * Kozmetik katalog + satın alma (09.10.2026). PARA YOLU (elmas): ürün başına
 * `Idempotency-Key` BAŞARIYA kadar saklanır — yanıt ağda kaybolursa yeniden
 * basış ikinci kez elmas düşürmez (cüzdan/ekipman deseni). Mağaza ve avatar
 * ekranı aynı mantığı kullanır.
 */
export function useCosmetics(enabled: boolean, onPurchased?: () => Promise<void>) {
  const [catalog, setCatalog] = useState<CosmeticsCatalogView | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingKeys = useRef(new Map<string, string>());

  const reload = useCallback(async () => {
    try {
      setCatalog(await apiClient.getCosmetics());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kozmetik mağaza yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const purchase = useCallback(
    async (key: string): Promise<boolean> => {
      setBusyKey(key);
      setError(null);
      let idempotencyKey = pendingKeys.current.get(key);
      if (idempotencyKey === undefined) {
        idempotencyKey = crypto.randomUUID();
        pendingKeys.current.set(key, idempotencyKey);
      }
      try {
        await apiClient.purchaseCosmetic(key, idempotencyKey);
        pendingKeys.current.delete(key);
        await Promise.all([reload(), onPurchased?.()]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Satın alınamadı.');
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [reload, onPurchased],
  );

  return { catalog, busyKey, error, purchase, reload };
}
