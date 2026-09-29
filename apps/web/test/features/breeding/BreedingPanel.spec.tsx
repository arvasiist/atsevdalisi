// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BreedingResultView, PublicHorse } from '@at-sevdalisi/shared-types';
import { BreedingPanel } from '../../../src/features/breeding/BreedingPanel';

/**
 * `BreedingPanel` — `POST /players/:id/breeding` çağıran ilk ve tek istemci
 * yüzeyi (bkz. `docs/FINAL_PROJECT_AUDIT.md` #16).
 *
 * Bu dosyanın ASIL konusu, formun görünümü DEĞİL **`Idempotency-Key`'in yaşam
 * döngüsüdür** — çünkü bu bir PARA YOLUDUR (aygır başkasının ise damızlık
 * ücreti transfer edilir) ve buradaki bir hata sessizdir: yanlış anahtar
 * yönetimi ya İKİNCİ bir tay doğurur ya da oyuncu "yaptım" sanırken hiçbir
 * şey yapmaz. Üç iddia sabitlenir:
 *
 *   1. **Başarısızlıkta anahtar YAŞAR** — sunucu hata durumunda `pending`
 *      rezervasyonu siler (`idempotency.interceptor.ts`), yani aynı anahtarla
 *      yeniden denemek ne bayat bir hata ne ikinci bir tay üretir; ilk istek
 *      başarılı olup yanıt ağda kaybolduysa sunucu SAKLANAN yanıtı döner.
 *   2. **Başarıda anahtar TÜKENİR** — yeni çiftleştirme yeni bir anahtar alır.
 *   3. **Girdi değişince bekleyen anahtar BIRAKILIR** — artık farklı bir
 *      mantıksal istektir; eski anahtarla gitmesi oyuncuya ilk isteğin
 *      SAKLANAN yanıtını döndürürdü (yani "yeni tay doğdu" sanırken hiçbir
 *      şey olmazdı).
 *
 * Ayrıca sunucu otoritesi iki noktada iddia edilir: kısrak yokken form
 * HİÇ gösterilmez ve damızlık ücreti yalnızca yanıttaki `fee` alanından
 * okunur (istemci hiçbir tutar hesaplamaz).
 *
 * `apiClient` `vi.mock` ile taklit edilir — gerçek HTTP yok; `api-client.ts`'in
 * kendi URL/method/header kontratı `test/lib/api-client.spec.ts`'te ayrıca
 * sınanır (bu dosya onu TEKRARLAMAZ).
 */

const { breedHorsesMock, getHorseDetailsMock } = vi.hoisted(() => ({
  breedHorsesMock: vi.fn(),
  getHorseDetailsMock: vi.fn(),
}));

vi.mock('../../../src/lib/api-client', () => ({
  apiClient: {
    breedHorses: (...args: unknown[]) => breedHorsesMock(...args),
    getHorseDetails: (...args: unknown[]) => getHorseDetailsMock(...args),
  },
}));

/** `crypto.randomUUID` deterministik yapılır — anahtarların AYNI/ FARKLI olduğu iddia edilebilsin diye. */
let keyCounter = 0;

beforeEach(() => {
  keyCounter = 0;
  breedHorsesMock.mockReset();
  getHorseDetailsMock.mockReset();
  vi.stubGlobal('crypto', { randomUUID: () => `key-${++keyCounter}` });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function horse(overrides: Partial<PublicHorse> & Pick<PublicHorse, 'id' | 'gender' | 'name'>): PublicHorse {
  return {
    ownerId: 'player-1',
    breed: 'Arap',
    birthDate: '2024-01-01T00:00:00.000Z',
    level: 3,
    xp: 0,
    quality: 70,
    health: 100,
    fitness: 60,
    fatigue: 0,
    energy: 90,
    morale: 80,
    weightKg: 450,
    status: 'active',
    sireId: null,
    damId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    potentialEstimate: { min: 60, max: 70 },
    ...overrides,
  };
}

const MARE = horse({ id: 'mare-1', gender: 'mare', name: 'İnci' });
const STALLION = horse({ id: 'stallion-1', gender: 'stallion', name: 'Şimşek' });

function breedingResult(overrides: Partial<BreedingResultView> = {}): BreedingResultView {
  return {
    pairId: 'pair-1',
    foalId: 'foal-1',
    foalName: 'Yıldız',
    foalGender: 'mare',
    mareId: 'mare-1',
    stallionId: 'stallion-1',
    fee: 0,
    inbreedingDetected: false,
    birthHealthRisk: 0.05,
    payerBalance: null,
    ...overrides,
  };
}

function renderPanel(horses: PublicHorse[] = [MARE, STALLION]): { onBred: ReturnType<typeof vi.fn> } {
  const onBred = vi.fn().mockResolvedValue(undefined);
  render(<BreedingPanel ownerId="player-1" horses={horses} onBred={onBred} />);
  return { onBred };
}

function fillForm(foalName = 'Yıldız'): void {
  fireEvent.change(screen.getByLabelText('Kısrak'), { target: { value: 'mare-1' } });
  fireEvent.change(screen.getByLabelText('Aygır'), { target: { value: 'stallion-1' } });
  fireEvent.change(screen.getByLabelText('Tay adı'), { target: { value: foalName } });
}

async function submit(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Çiftleştir' }));
}

/** Çağrının 5. argümanı — `Idempotency-Key`. */
function keyOfCall(index: number): string {
  return breedHorsesMock.mock.calls[index]?.[4] as string;
}

describe('BreedingPanel — Idempotency-Key yaşam döngüsü (PARA YOLU)', () => {
  it('BAŞARISIZLIKTA anahtarı korur: yeniden deneme AYNI anahtarla gider', async () => {
    breedHorsesMock.mockRejectedValueOnce(new Error('Kısrak çiftleştirme için uygun değil.'));
    renderPanel();
    fillForm();
    await submit();
    await waitFor(() => expect(breedHorsesMock).toHaveBeenCalledTimes(1));
    await screen.findByText('Kısrak çiftleştirme için uygun değil.');

    breedHorsesMock.mockResolvedValueOnce(breedingResult());
    await submit();
    await waitFor(() => expect(breedHorsesMock).toHaveBeenCalledTimes(2));

    // Aynı mantıksal istek: sunucu bu anahtarı zaten görmüşse SAKLANAN yanıtı
    // döner, ikinci bir tay doğmaz.
    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  it('BAŞARIDA anahtar tükenir: sonraki çiftleştirme YENİ anahtar alır', async () => {
    breedHorsesMock.mockResolvedValue(breedingResult());
    renderPanel();
    fillForm();
    await submit();
    await waitFor(() => expect(breedHorsesMock).toHaveBeenCalledTimes(1));

    // Başarıdan sonra tay adı TEMİZLENİR (yeni bir çiftleştirme için yeniden doldurulur).
    fillForm('Kartal');
    await submit();
    await waitFor(() => expect(breedHorsesMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it('Girdi değişince bekleyen anahtar BIRAKILIR', async () => {
    breedHorsesMock.mockRejectedValueOnce(new Error('Bir hata oluştu.'));
    renderPanel();
    fillForm();
    await submit();
    await waitFor(() => expect(breedHorsesMock).toHaveBeenCalledTimes(1));
    await screen.findByText('Bir hata oluştu.');

    // Kullanıcı tay adını değiştirdi → artık FARKLI bir mantıksal istek.
    fireEvent.change(screen.getByLabelText('Tay adı'), { target: { value: 'Kartal' } });

    breedHorsesMock.mockResolvedValueOnce(breedingResult({ foalName: 'Kartal' }));
    await submit();
    await waitFor(() => expect(breedHorsesMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });
});

describe('BreedingPanel — sunucu otoritesi ve gösterim', () => {
  it('kısrak yoksa form yerine açıklama gösterir (düğme YOK)', () => {
    renderPanel([STALLION]);
    expect(screen.queryByRole('button', { name: 'Çiftleştir' })).toBeNull();
    expect(screen.getByText(/en az bir/)).toBeTruthy();
  });

  it('damızlık ücretini YALNIZCA sunucudan gelen `fee` alanından gösterir', async () => {
    // İstemci hiçbir tutar hesaplamaz: 0 dışında bir ücret yalnızca yanıttan gelebilir.
    breedHorsesMock.mockResolvedValueOnce(breedingResult({ fee: 1250, payerBalance: { money: 8750, gems: 0 } }));
    renderPanel();
    fillForm();
    await submit();

    // Ayraç bilerek esnek (`1[.,]250`): iddia edilen şey biçim değil, sayının
    // YANITTAN geldiğidir (istemci 1250 diye bir sabit taşımıyor).
    await screen.findByText(/Damızlık ücreti: 1[.,]250/);
    expect(screen.getByText(/Kalan bakiyen: 8[.,]750/)).toBeTruthy();
  });

  it('ücret 0 ise "alınmadı" der — kendi atlarını çiftleştiren kendine ödeme yapmaz', async () => {
    breedHorsesMock.mockResolvedValueOnce(breedingResult({ fee: 0 }));
    renderPanel();
    fillForm();
    await submit();

    await screen.findByText(/Damızlık ücreti alınmadı/);
  });

  it('başarılı çiftleştirmeden sonra ahır/bakiye tazelemesini tetikler', async () => {
    breedHorsesMock.mockResolvedValueOnce(breedingResult());
    const { onBred } = renderPanel();
    fillForm();
    await submit();

    await waitFor(() => expect(onBred).toHaveBeenCalledTimes(1));
  });
});
