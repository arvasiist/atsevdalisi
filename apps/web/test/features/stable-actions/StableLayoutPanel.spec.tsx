// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PublicHorse, StableSummaryView } from '@at-sevdalisi/shared-types';
import { StableLayoutPanel } from '../../../src/features/stable-actions/StableLayoutPanel';

/**
 * Ahır bölmeleri paneli (16.10.2026). Bölme numaraları sunucudan; taşıma
 * sunucuya gider ve ardından ahır tazelenir. Kilitli bölme ahır geliştirmeye
 * götürür, boş bölme at alma/çiftleştirme yollarını gösterir.
 */
const api = vi.hoisted(() => ({ moveHorseToStall: vi.fn() }));
vi.mock('../../../src/lib/api-client', () => ({ apiClient: api }));

const horse = (id: string, name: string, stallNumber: number) => ({ id, name, stallNumber }) as unknown as PublicHorse;
const summary = {
  stableLevel: 1,
  horseCount: 2,
  capacity: 5,
  maxStalls: 8,
  levels: [
    { level: 1, capacity: 5 },
    { level: 2, capacity: 8 },
  ],
  stalls: [],
} as unknown as StableSummaryView;

describe('StableLayoutPanel', () => {
  beforeEach(() => api.moveHorseToStall.mockReset());
  afterEach(() => cleanup());

  it('dolu, boş ve kilitli bölmeleri gösterir', () => {
    render(
      <StableLayoutPanel
        playerId="p1"
        horses={[horse('a', 'Karayel', 1), horse('b', 'Rüzgâr', 2)]}
        summary={summary}
        onChanged={vi.fn()}
        onShowHorse={vi.fn()}
        onOpenUpgrade={vi.fn()}
      />,
    );
    expect(screen.getByTestId('stall-cell-1').textContent).toContain('Karayel');
    expect(screen.getByTestId('stall-cell-3').textContent).toContain('+ At al');
    expect(screen.getByTestId('stall-cell-6').textContent).toContain('Ahır Sv. 2');
    expect(screen.queryByTestId('stall-cell-9')).toBeNull();
    // maxStalls (8) = sonraki seviyenin kapasitesi → gizli bölme yok.
    expect(screen.queryByTestId('stall-hidden-summary')).toBeNull();
  });

  it('Taşı → boş bölme: sunucuya gider, ahır tazelenir', async () => {
    api.moveHorseToStall.mockResolvedValue({ capacity: 5, stalls: [] });
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <StableLayoutPanel
        playerId="p1"
        horses={[horse('a', 'Karayel', 1), horse('b', 'Rüzgâr', 2)]}
        summary={summary}
        onChanged={onChanged}
        onShowHorse={vi.fn()}
        onOpenUpgrade={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('stall-cell-1').querySelector('button')!);
    fireEvent.click(screen.getByText('Buraya taşı', { selector: '[data-testid="stall-cell-4"] button' }));
    await waitFor(() => expect(api.moveHorseToStall).toHaveBeenCalledWith('p1', 'a', 4));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('kilitli bölme ahır geliştirmeyi açar', () => {
    const onOpenUpgrade = vi.fn();
    render(
      <StableLayoutPanel
        playerId="p1"
        horses={[horse('a', 'Karayel', 1)]}
        summary={summary}
        onChanged={vi.fn()}
        onShowHorse={vi.fn()}
        onOpenUpgrade={onOpenUpgrade}
      />,
    );
    fireEvent.click(screen.getByTestId('stall-cell-7').querySelector('button')!);
    expect(onOpenUpgrade).toHaveBeenCalled();
  });
});
