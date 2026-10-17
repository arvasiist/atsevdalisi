// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BreedingCenterView, BreedingOfferView, PublicHorse, StudListingView } from '@at-sevdalisi/shared-types';
import { BreedingCenter } from '../../../src/features/breeding/BreedingCenter';

/**
 * Çiftleştirme Merkezi ekranı (16.10.2026, brief §4). Sunucu otoritesi: ücret,
 * iade, olasılık ve süre yanıttan gelir. Para yolunda teklif anahtarı
 * BAŞARISIZLIKTA korunur (yeniden basış ikinci emanet açmaz), başarıda biter.
 */
const api = vi.hoisted(() => ({
  getBreedingCenter: vi.fn(),
  getHorsesByOwner: vi.fn(),
  listStuds: vi.fn(),
  createBreedingOffer: vi.fn(),
  acceptBreedingOffer: vi.fn(),
  rejectBreedingOffer: vi.fn(),
  cancelBreedingOffer: vi.fn(),
  putStudListing: vi.fn(),
  withdrawStudListing: vi.fn(),
  pregnancyCheckup: vi.fn(),
}));

vi.mock('../../../src/lib/api-client', () => ({ apiClient: api }));

const RULES: BreedingCenterView['rules'] = {
  gestationDays: 67,
  offerExpiryHours: 48,
  failedConceptionRefundPercent: 100,
  ownerSharePercent: 80,
  checkupCost: 120,
  checkupIntervalHours: 168,
  failedAttemptCooldownHours: 24,
  minConceptionChance: 0.1,
  maxConceptionChance: 0.95,
};

function offer(overrides: Partial<BreedingOfferView> = {}): BreedingOfferView {
  return {
    offerId: 'offer-1',
    direction: 'incoming',
    mare: { horseId: 'mare-1', name: 'İnci', fertility: 72 },
    stallion: { horseId: 'stud-1', name: 'Karayel' },
    mareOwner: { playerId: 'p2', username: 'ayse' },
    stallionOwner: { playerId: 'p1', username: 'ben' },
    fee: 1875,
    foalName: 'Rüzgâr',
    status: 'pending',
    outcome: null,
    refundedAmount: 0,
    pregnancyId: null,
    createdAt: '2026-10-16T10:00:00.000Z',
    expiresAt: '2026-10-18T10:00:00.000Z',
    respondedAt: null,
    ...overrides,
  };
}

function center(overrides: Partial<BreedingCenterView> = {}): BreedingCenterView {
  return { rules: RULES, myStuds: [], incomingOffers: [], outgoingOffers: [], pregnancies: [], ...overrides };
}

const STUD: StudListingView = {
  horseId: 'stud-9',
  name: 'Yıldırım',
  breed: 'hinis',
  ownerId: 'p3',
  ownerUsername: 'mehmet',
  ageMonths: 72,
  level: 4,
  quality: 70,
  fertility: 80,
  fee: 2000,
  foalCount: 1,
  foalLimit: 12,
  sireName: 'Fırtına',
  damName: null,
  record: { starts: 10, wins: 3, places: 5, earnings: 1200, foals: 1 },
};

const MARE = { id: 'mare-7', name: 'Ceylan', gender: 'mare', status: 'retired' } as PublicHorse;

let keyCounter = 0;
beforeEach(() => {
  keyCounter = 0;
  for (const fn of Object.values(api)) fn.mockReset();
  api.getHorsesByOwner.mockResolvedValue([MARE]);
  api.listStuds.mockResolvedValue([STUD]);
  vi.stubGlobal('crypto', { randomUUID: () => `key-${++keyCounter}` });
  vi.stubGlobal('confirm', () => true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BreedingCenter', () => {
  it('kurallar sunucunun değerleriyle görünür (emanet, iade, gebelik süresi, pay)', async () => {
    api.getBreedingCenter.mockResolvedValue(center());
    render(<BreedingCenter playerId="p1" onBalanceChanged={() => undefined} />);
    const rules = await screen.findByTestId('breeding-rules');
    expect(rules.textContent).toMatch(/emanete/);
    expect(rules.textContent).toMatch(/67 gün/);
    expect(rules.textContent).toMatch(/%80/);
    expect(rules.textContent).toMatch(/48 saat/);
  });

  it('gelen teklif: Kabul et sunucuya gider; sonuç yanıttan gösterilir ve merkez tazelenir', async () => {
    api.getBreedingCenter.mockResolvedValue(center({ incomingOffers: [offer()] }));
    api.acceptBreedingOffer.mockResolvedValue(offer({ status: 'accepted', outcome: 'conceived', pregnancyId: 'preg-1' }));
    const onBalanceChanged = vi.fn();
    render(<BreedingCenter playerId="p1" onBalanceChanged={onBalanceChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kabul et' }));
    await waitFor(() => expect(api.acceptBreedingOffer).toHaveBeenCalledWith('offer-1'));
    await screen.findByText(/Döllenme tuttu/);
    expect(onBalanceChanged).toHaveBeenCalled();
    expect(api.getBreedingCenter).toHaveBeenCalledTimes(2);
  });

  it('giden bekleyen teklif yalnızca iptal edilebilir (kabul/ret düğmesi yok)', async () => {
    api.getBreedingCenter.mockResolvedValue(center({ outgoingOffers: [offer({ direction: 'outgoing' })] }));
    render(<BreedingCenter playerId="p1" onBalanceChanged={() => undefined} />);
    await screen.findByRole('button', { name: /iptal et/ });
    expect(screen.queryByRole('button', { name: 'Kabul et' })).toBeNull();
  });

  it('teklif gönder: ücret ilandan; başarısızlıkta AYNI anahtar, başarıda yeni anahtar', async () => {
    api.getBreedingCenter.mockResolvedValue(center());
    api.createBreedingOffer.mockRejectedValueOnce(new Error('Ağ hatası')).mockResolvedValueOnce(offer({ direction: 'outgoing', fee: 2000 }));
    render(<BreedingCenter playerId="p1" onBalanceChanged={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Teklif hazırla' }));
    fireEvent.change(screen.getByLabelText('Teklif kısrağı'), { target: { value: 'mare-7' } });
    fireEvent.change(screen.getByLabelText('Teklif tay adı'), { target: { value: 'Şimşek' } });
    expect(screen.getByTestId('offer-form').textContent).toMatch(/2[.,]000 çip emanete/);

    fireEvent.click(screen.getByRole('button', { name: /Teklif gönder/ }));
    await screen.findByText('Ağ hatası');
    fireEvent.click(screen.getByRole('button', { name: /Teklif gönder/ }));
    await waitFor(() => expect(api.createBreedingOffer).toHaveBeenCalledTimes(2));
    expect(api.createBreedingOffer.mock.calls[0]).toEqual(['mare-7', 'stud-9', 'Şimşek', 'key-1']);
    expect(api.createBreedingOffer.mock.calls[1]?.[3]).toBe('key-1');
    await screen.findByText(/Teklif gönderildi/);
  });

  it('gebelik takvimi: ilerleme, beklenen doğum ve veteriner kontrolü düğmesi', async () => {
    api.getBreedingCenter.mockResolvedValue(
      center({
        pregnancies: [
          {
            pregnancyId: 'preg-1',
            mareId: 'mare-7',
            mareName: 'Ceylan',
            stallionId: 'stud-9',
            stallionName: 'Yıldırım',
            foalName: 'Şimşek',
            fee: 2000,
            inbreedingDetected: false,
            status: 'gestating',
            conceivedAt: '2026-10-01T00:00:00.000Z',
            expectedBirthAt: '2026-12-07T00:00:00.000Z',
            bornAt: null,
            foalId: null,
            progress: 0.3,
            care: { checkups: 1, expectedCheckups: 3, careScore: 0.33, nutritionScore: 0.5, lastCheckupAt: null, nextCheckupAt: null, checkupCost: 120 },
            riskLevel: 'medium',
          },
        ],
      }),
    );
    api.pregnancyCheckup.mockResolvedValue({});
    render(<BreedingCenter playerId="p1" onBalanceChanged={() => undefined} />);
    const card = await screen.findByTestId('pregnancy-preg-1');
    expect(card.textContent).toMatch(/Orta risk/);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('30');
    fireEvent.click(screen.getByRole('button', { name: /Veteriner kontrolü \(120 çip\)/ }));
    await waitFor(() => expect(api.pregnancyCheckup).toHaveBeenCalledWith('preg-1', 'key-1'));
  });
});
