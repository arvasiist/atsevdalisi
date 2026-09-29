// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Jockey, PlayerJockeyView } from '@at-sevdalisi/shared-types';
import { JockeyPanel } from '../../../src/features/jockey/JockeyPanel';

/**
 * `JockeyPanel` — `POST /jockeys/:jockeyId/hire` ve
 * `POST /jockeys/:jockeyId/release` uçlarının İLK istemci yüzeyi
 * (29.09.2026, `docs/FINAL_PROJECT_AUDIT.md` #18).
 *
 * Bu dosyanın asıl konusu düğmelerin görünümü DEĞİL, **iki ucun birbirinden
 * farklı olan sözleşmeleridir** — çünkü ikisi de sessizce yanlış yazılabilir:
 *
 *   1. **KİRALAMA PARA YOLUDUR** → `usePlayer().refresh()` ÇAĞRILIR (üst
 *      bardaki bakiye gerçekten düşmüştür).
 *   2. **SERBEST BIRAKMA PARA YOLU DEĞİLDİR** → `refresh()` ÇAĞRILMAZ.
 *      İade yoktur; bakiyeyi yeniden okumak "bir şey değişti" izlenimi
 *      verirdi ve ekranın iade VAAT ETMEDİĞİ iddiası bununla birlikte
 *      anlam kazanır. Metin iddiası tek başına yeterli değildir: bir
 *      gün `releaseJockey` yanıtına `balanceAfter` eklenirse ve ekran
 *      onu yazarsa, `refresh` iddiası bu sözleşme kaymasını yakalar.
 *   3. **VİTRİN `composite` HESAPLAMAZ** — sunucuda hesaplanmış puan
 *      yalnızca oyuncunun KENDİ jokeyi için gelir; vitrin ham becerileri
 *      gösterir. İstemcide formülü tekrarlamak, config değiştiğinde
 *      gösterilen sayıyı motordan sessizce ayırırdı.
 *   4. **SUNUCU HATASI OLDUĞU GİBİ GÖSTERİLİR** — 409/404 kodları
 *      istemcide yeniden yorumlanmaz.
 *
 * `apiClient` `vi.mock` ile taklit edilir (gerçek HTTP yok); URL/method
 * kontratı `test/lib/api-client.spec.ts`'te ayrıca sınanır — bu dosya onu
 * TEKRARLAMAZ.
 */

const { getJockeysMock, getPlayerJockeyMock, hireJockeyMock, releaseJockeyMock, refreshMock } = vi.hoisted(
  () => ({
    getJockeysMock: vi.fn(),
    getPlayerJockeyMock: vi.fn(),
    hireJockeyMock: vi.fn(),
    releaseJockeyMock: vi.fn(),
    refreshMock: vi.fn(),
  }),
);

vi.mock('../../../src/lib/api-client', () => ({
  apiClient: {
    getJockeys: (...args: unknown[]) => getJockeysMock(...args),
    getPlayerJockey: (...args: unknown[]) => getPlayerJockeyMock(...args),
    hireJockey: (...args: unknown[]) => hireJockeyMock(...args),
    releaseJockey: (...args: unknown[]) => releaseJockeyMock(...args),
  },
}));

/**
 * `usePlayer` taklit edilir çünkü panelin tek ihtiyacı `refresh`tir ve bu
 * dosyanın İKİ NUMARALI iddiası tam olarak onun ÇAĞRILIP
 * ÇAĞRILMADIĞIDIR — gerçek `PlayerProvider` ile sarmalamak, sağlayıcının
 * kendi ağ çağrılarını da işin içine katardı.
 */
vi.mock('../../../src/lib/player-context', () => ({
  usePlayer: () => ({
    player: { id: 'player-1', username: 'seyis', displayName: 'Seyis', money: 5000, gems: 0 },
    isLoading: false,
    error: null,
    createPlayer: vi.fn(),
    refresh: refreshMock,
  }),
}));

/** İade VAAT EDEN her kalıp. "iade edilmez" bunların HİÇBİRİYLE eşleşmez. */
const REFUND_CLAIM = /iade edilir|geri öden|geri alınır|para geri/i;

beforeEach(() => {
  getJockeysMock.mockReset();
  getPlayerJockeyMock.mockReset();
  hireJockeyMock.mockReset();
  releaseJockeyMock.mockReset();
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

function jockey(overrides: Partial<Jockey> & Pick<Jockey, 'id' | 'name'>): Jockey {
  return {
    experience: 40,
    startSkill: 60,
    tacticalSkill: 55,
    sprintSkill: 70,
    horseControl: 65,
    riskManagement: 50,
    trackKnowledge: 45,
    salary: 200,
    ownerId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const FREE = jockey({ id: 'jockey-free', name: 'Kemal' });
const MINE = jockey({ id: 'jockey-mine', name: 'Ferhat', ownerId: 'player-1' });

/** `GET /players/:id/jockey` yanıtı — `composite` SUNUCUDAN gelir. */
function owned(jockey_: Jockey, composite: number): PlayerJockeyView {
  return { jockey: jockey_, composite };
}

function renderPanel(): void {
  render(<JockeyPanel playerId="player-1" />);
}

/** Panelin ilk yüklemesinin bitmesini bekler (iki okuma paralel gider). */
async function waitForLoaded(): Promise<void> {
  await waitFor(() => expect(getJockeysMock).toHaveBeenCalled());
  await waitFor(() => expect(getPlayerJockeyMock).toHaveBeenCalled());
}

describe('JockeyPanel — kiralama (PARA YOLU)', () => {
  it('kiralamadan sonra üst bar bakiyesini TAZELER ve yeni durumu okur', async () => {
    getJockeysMock.mockResolvedValue([FREE]);
    getPlayerJockeyMock.mockResolvedValueOnce(null);
    hireJockeyMock.mockResolvedValue({
      jockey: { ...FREE, ownerId: 'player-1' },
      paid: 200,
      balanceAfter: 4800,
    });
    // Kiralamadan sonraki okuma: artık jokey var. `composite` (58.5) ham
    // becerilerin ortalamasından (57.5) FARKLI seçildi ki ekranın sayıyı
    // kendisi hesaplamadığı iddia edilebilsin.
    getPlayerJockeyMock.mockResolvedValue(owned({ ...FREE, ownerId: 'player-1' }, 58.5));

    renderPanel();
    await waitForLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Kirala/ }));

    await waitFor(() => expect(hireJockeyMock).toHaveBeenCalledWith('jockey-free'));
    // PARA GERÇEKTEN DÜŞTÜ → bakiye yeniden okunmalı.
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    // Ödenen tutar YANITTAN gelir; istemci `salary`ı kendisi çarpmaz.
    await screen.findByText(/200 çip ödendi/);
    // ...ve kendi jokeyim kartı SUNUCUNUN puanıyla göründü.
    await screen.findByText(/Puan: 58\.5/);
  });

  it('jokeyi varken vitrindeki Kirala düğmeleri kapalıdır (sunucu 409 vermeden)', async () => {
    getJockeysMock.mockResolvedValue([FREE]);
    getPlayerJockeyMock.mockResolvedValue(owned(MINE, 61));

    renderPanel();
    await waitForLoaded();

    const hireButton = screen.getByRole('button', { name: /Kirala/ });
    expect((hireButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/önce onu serbest bırakmalısın/)).toBeTruthy();
  });
});

describe('JockeyPanel — serbest bırakma (PARA YOLU DEĞİL)', () => {
  it('düğme ve bildirim İADE OLMADIĞINI açıkça söyler — iade vaat etmez', async () => {
    getJockeysMock.mockResolvedValue([FREE]);
    getPlayerJockeyMock.mockResolvedValue(owned(MINE, 61));
    releaseJockeyMock.mockResolvedValue({ jockey: { ...MINE, ownerId: null } });

    renderPanel();
    await waitForLoaded();

    const releaseButton = screen.getByRole('button', { name: /Serbest Bırak/ });
    const label = releaseButton.textContent ?? '';
    expect(label).toMatch(/iade edilmez/);
    expect(label).not.toMatch(REFUND_CLAIM);

    fireEvent.click(releaseButton);
    await waitFor(() => expect(releaseJockeyMock).toHaveBeenCalledWith('jockey-mine'));

    const notice = await screen.findByText(/serbest bırakıldı/);
    expect(notice.textContent ?? '').toMatch(/iade edilmez/);
    expect(notice.textContent ?? '').not.toMatch(REFUND_CLAIM);
  });

  it('bırakmadan sonra BAKİYE TAZELENMEZ (para kıpırdamadı) ama liste yeniden okunur', async () => {
    getJockeysMock.mockResolvedValue([FREE]);
    getPlayerJockeyMock.mockResolvedValueOnce(owned(MINE, 61));
    releaseJockeyMock.mockResolvedValue({ jockey: { ...MINE, ownerId: null } });
    // Bırakmadan sonraki okuma: jokey artık yok.
    getPlayerJockeyMock.mockResolvedValue(null);

    renderPanel();
    await waitForLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Serbest Bırak/ }));

    await waitFor(() => expect(releaseJockeyMock).toHaveBeenCalledTimes(1));
    // İkinci okuma yapıldı → "jokeyin yok" durumu göründü.
    await waitFor(() => expect(getPlayerJockeyMock).toHaveBeenCalledTimes(2));
    await screen.findByText(/Jokeyin yok/);
    // ⚠️ ASIL İDDİA: iade yok → bakiye yeniden okunmaz.
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe('JockeyPanel — sunucu otoritesi', () => {
  it('vitrindeki jokeyler için istemcide composite HESAPLAMAZ (ham beceriler gösterilir)', async () => {
    getJockeysMock.mockResolvedValue([FREE]);
    getPlayerJockeyMock.mockResolvedValue(null);

    renderPanel();
    await waitForLoaded();

    // Altı ham beceri görünür...
    expect(screen.getByText(/Çıkış: 60/)).toBeTruthy();
    expect(screen.getByText(/Sprint: 70/)).toBeTruthy();
    // ...ama jokey yokken hiçbir "Puan:" (composite) satırı YOKTUR:
    // istemci formülü kendisi çalıştırmaz, sunucu da bu satır için
    // composite göndermez.
    expect(screen.queryByText(/Puan:/)).toBeNull();
  });

  it('kendi jokeyinin puanını SUNUCUDAN geldiği gibi gösterir', async () => {
    getJockeysMock.mockResolvedValue([]);
    getPlayerJockeyMock.mockResolvedValue(owned(MINE, 61.44));

    renderPanel();
    await waitForLoaded();

    // 61.44 → "61.4" — istemci yuvarlar ama YENİDEN HESAPLAMAZ; sayı
    // sunucunun gönderdiğidir (ham becerilerin ağırlıklı ortalaması
    // burada 57.5 olurdu, yani iddia formülü yakalar).
    await screen.findByText(/Puan: 61\.4/);
  });

  it('sunucu hata kodunu/mesajını DEĞİŞTİRMEDEN gösterir', async () => {
    getJockeysMock.mockResolvedValue([FREE]);
    getPlayerJockeyMock.mockResolvedValue(null);
    hireJockeyMock.mockRejectedValue(new Error('Bu jokey zaten başka bir oyuncuda.'));

    renderPanel();
    await waitForLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Kirala/ }));

    await screen.findByText('Bu jokey zaten başka bir oyuncuda.');
    // Başarısız kiralamada bakiye tazelenmez (para kıpırdamadı).
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('serbest bırakma hatasını gösterir ve listeyi değiştirmez', async () => {
    getJockeysMock.mockResolvedValue([FREE]);
    getPlayerJockeyMock.mockResolvedValue(owned(MINE, 61));
    releaseJockeyMock.mockRejectedValue(new Error('Jokey senin değil — serbest bırakılamaz.'));

    renderPanel();
    await waitForLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Serbest Bırak/ }));

    await screen.findByText('Jokey senin değil — serbest bırakılamaz.');
    // Hata sonrası ikinci bir okuma YOK; ekran sunucunun söylediğini
    // gösterir, kendi kendine durum uydurmaz.
    expect(getPlayerJockeyMock).toHaveBeenCalledTimes(1);
  });
});

describe('JockeyPanel — yükleme hatası', () => {
  it('iki okumadan biri düşerse hatayı gösterir', async () => {
    getJockeysMock.mockRejectedValue(new Error('Sunucuya ulaşılamadı.'));
    getPlayerJockeyMock.mockResolvedValue(null);

    renderPanel();

    await screen.findByText('Sunucuya ulaşılamadı.');
  });
});
