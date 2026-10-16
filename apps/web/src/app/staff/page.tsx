'use client';

/**
 * `/staff` — PERSONEL (brief §33, 01.10.2026). Kadro + aday pazarı.
 *
 * Sözleşme PEŞİN ödenir (`contractMonths` ay); süresi dolan personel etki
 * vermez ve bitime yakın "Yenile" açılır. Etkiler sunucuda uygulanır:
 * antrenör → antrenman kazancı, seyis/veteriner/nalbant → ilgili bakım
 * eyleminin bütün etkisi. Bu ekran hiçbir tutarı kendisi hesaplamaz —
 * bedel, çarpan, kapasite, "yenilenebilir mi" sunucudan gelir.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { StaffOverview, StaffRole, StaffView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

const ROLE_INFO: Partial<Record<StaffRole, { label: string; effect: string }>> = {
  trainer: { label: 'Antrenör', effect: 'Antrenmanda stat kazancı' },
  groom: { label: 'Seyis', effect: '"Tımar" bakımının etkisi' },
  vet: { label: 'Veteriner', effect: '"Veteriner" bakımının etkisi' },
  farrier: { label: 'Nalbant', effect: '"Nalbant" bakımının etkisi' },
};

const mutedText: React.CSSProperties = { color: 'var(--color-text-secondary)', fontSize: 13 };

function bonusLabel(multiplier: number): string {
  return `+%${Math.round((multiplier - 1) * 100)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

function StaffCard({
  staff,
  children,
}: {
  staff: StaffView;
  children: React.ReactNode;
}): React.ReactElement {
  const info = ROLE_INFO[staff.role];
  return (
    <li
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {staff.name}{' '}
          <span style={{ color: 'var(--color-accent-gold)', fontSize: 13 }}>
            · {info?.label ?? staff.role}
          </span>
        </div>
        <div style={mutedText}>
          Beceri {Math.round(staff.skill)} · {info?.effect ?? 'Etki'}{' '}
          {bonusLabel(staff.bonusMultiplier)}
        </div>
      </div>
      {children}
    </li>
  );
}

export default function StaffPage(): React.ReactElement {
  const {
    player,
    isLoading: isPlayerLoading,
    error: playerError,
    createPlayer,
    refresh,
  } = usePlayer();
  const [data, setData] = useState<StaffOverview | null>(null);
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(await apiClient.getStaffOverview());
  }, []);

  useEffect(() => {
    if (!player) return;
    load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Personel bilgisi alınamadı'),
    );
  }, [player, load]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  };

  const hire = (staff: StaffView) =>
    run(`hire-${staff.id}`, async () => {
      const result = await apiClient.hireStaff(staff.id);
      return `${staff.name} kadroya katıldı (${formatCurrency('money', result.paid)} ödendi).`;
    });

  const renew = (staff: StaffView) =>
    run(`renew-${staff.id}`, async () => {
      const result = await apiClient.renewStaff(staff.id);
      return `${staff.name} sözleşmesi uzatıldı (${formatCurrency('money', result.paid)}).`;
    });

  const release = (staff: StaffView) => {
    if (
      !window.confirm(`${staff.name} ile yollar ayrılsın mı? Peşin ödenen sözleşme iade EDİLMEZ.`)
    )
      return;
    void run(`release-${staff.id}`, async () => {
      await apiClient.releaseStaff(staff.id);
      return `${staff.name} kadrodan ayrıldı.`;
    });
  };

  const full = data ? data.hired.length >= data.capacity : false;
  const candidates =
    data?.candidates.filter((c) => roleFilter === 'all' || c.role === roleFilter) ?? [];

  return (
    <main className="page-container">
      <h1 className="page-title">Personel</h1>
      <p style={{ ...mutedText, fontSize: 14, marginTop: 4, marginBottom: 'var(--space-lg)' }}>
        Antrenör antrenmanı, seyis/veteriner/nalbant bakımı güçlendirir. Sözleşme peşin ödenir;
        süresi dolan personel etki vermez.
      </p>

      {!player && !isPlayerLoading ? (
        <GlassPanel style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
          <p style={{ ...mutedText, marginTop: 0 }}>
            Personel kiralamak için önce bir oyuncu hesabı oluştur.
          </p>
          <button type="button" className="btn-gold" onClick={() => void createPlayer()}>
            Başlangıç Paketiyle Oyuncu Oluştur
          </button>
          {playerError ? (
            <p style={{ color: 'var(--color-status-critical)', marginBottom: 0 }}>{playerError}</p>
          ) : null}
        </GlassPanel>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: 'var(--color-status-critical)' }}>
          {error}
        </p>
      ) : null}
      {notice ? <p style={{ color: 'var(--color-accent-gold)' }}>{notice}</p> : null}
      {player && !data && !error ? <p style={mutedText}>Yükleniyor…</p> : null}

      {player && data ? (
        <div
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--space-lg)' }}
        >
          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <h2 className="section-title" style={{ margin: 0 }}>
                Kadron
              </h2>
              <span style={mutedText}>
                {data.hired.length}/{data.capacity} kişi ·{' '}
                <Link href="/farm">Personel Binası ile kapasiteyi artır</Link>
              </span>
            </div>
            {data.hired.length === 0 ? (
              <p style={{ ...mutedText, marginBottom: 0 }}>
                Henüz personelin yok — aşağıdan kirala.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 'var(--space-md) 0 0',
                  display: 'grid',
                  gap: 8,
                }}
              >
                {data.hired.map((staff) => (
                  <StaffCard key={staff.id} staff={staff}>
                    <div style={{ ...mutedText, minWidth: 140 }}>
                      {staff.active ? (
                        <>
                          Sözleşme {staff.contractEndsAt ? formatDate(staff.contractEndsAt) : '-'}{' '}
                          tarihine kadar
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-status-critical)' }}>
                          Sözleşme bitti — etki yok
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {staff.renewable ? (
                        <button
                          type="button"
                          className="btn-gold"
                          style={{ minHeight: 38 }}
                          disabled={busy !== null}
                          onClick={() => void renew(staff)}
                        >
                          Yenile · {formatCurrency('money', staff.contractCost)}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ minHeight: 38 }}
                        disabled={busy !== null}
                        onClick={() => release(staff)}
                      >
                        Ayrıl
                      </button>
                    </div>
                  </StaffCard>
                ))}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel style={{ padding: 'var(--space-lg)' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              İş Arayanlar
            </h2>
            <div
              className="tabs"
              role="tablist"
              aria-label="Rol süzgeci"
              style={{ marginBottom: 'var(--space-md)', maxWidth: '100%', overflowX: 'auto' }}
            >
              {(['all', ...Object.keys(ROLE_INFO)] as Array<StaffRole | 'all'>).map((role) => (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={roleFilter === role}
                  onClick={() => setRoleFilter(role)}
                >
                  {role === 'all' ? 'Tümü' : ROLE_INFO[role]?.label}
                </button>
              ))}
            </div>
            {full ? (
              <p style={mutedText}>
                Kadro dolu — yeni personel için birini bırak ya da Personel Binası'nı yükselt.
              </p>
            ) : null}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {candidates.map((staff) => (
                <StaffCard key={staff.id} staff={staff}>
                  <div style={{ ...mutedText, minWidth: 120 }}>
                    {formatCurrency('money', staff.contractCost)} / {data.contractMonths} ay
                  </div>
                  <button
                    type="button"
                    className="btn-gold"
                    style={{ minHeight: 38 }}
                    disabled={busy !== null || full || (player?.money ?? 0) < staff.contractCost}
                    onClick={() => void hire(staff)}
                  >
                    {busy === `hire-${staff.id}` ? 'Kiralanıyor…' : 'Kirala'}
                  </button>
                </StaffCard>
              ))}
            </ul>
          </GlassPanel>
        </div>
      ) : null}
    </main>
  );
}
