'use client';

/**
 * ÇİFTLEŞTİRME MERKEZİ (16.10.2026, brief §4–§5): aygır ilanı, teklif,
 * kabul/ret, gebelik takvimi. Kurallar ve para sunucudadır; bkz.
 * `features/breeding/BreedingCenter.tsx`.
 */

import { GlassPanel } from '../../components/ui/GlassPanel';
import { BreedingCenter } from '../../features/breeding/BreedingCenter';
import { usePlayer } from '../../lib/player-context';

export default function BreedingPage(): React.ReactElement {
  const { player, isLoading, createPlayer, refresh } = usePlayer();
  return (
    <main className="page-container">
      <h1 className="page-title">Çiftleştirme Merkezi</h1>
      {player ? (
        <BreedingCenter playerId={player.id} onBalanceChanged={() => void refresh()} />
      ) : isLoading ? null : (
        <GlassPanel>
          <p>Çiftleştirme merkezini kullanmak için önce bir oyuncu oluştur.</p>
          <button type="button" className="moderation-primary" onClick={() => void createPlayer()}>
            Oyuncu oluştur
          </button>
        </GlassPanel>
      )}
    </main>
  );
}
