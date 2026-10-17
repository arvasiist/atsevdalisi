'use client';

/**
 * ÇİFTLEŞTİRME MERKEZİ (16.10.2026, brief §4–§5) — `/breeding`.
 *
 * Sunucu otoritesi: ücret sınırları, emanet, döllenme olasılığı, gebelik
 * süresi, iade ve risk SUNUCUDA hesaplanır; ekran yalnızca gösterir ve istek
 * gönderir. Para yollarında (`createBreedingOffer`, `pregnancyCheckup`)
 * `Idempotency-Key` BAŞARIYA kadar korunur: yanıt kaybolup yeniden basılırsa
 * ikinci bir emanet / ikinci bir kontrol ücreti alınmaz.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BreedingCenterView,
  BreedingOfferView,
  MyStudView,
  PregnancyView,
  PublicHorse,
  StudListingView,
} from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { breedLabel, SHOP_BREEDS } from '../breeds/breed-catalog';
import { describeRecord } from '../horse-profile/horse-profile';
import {
  OFFER_STATUS_LABELS,
  RISK_LABELS,
  describeOfferOutcome,
  formatChance,
  formatDateTimeTr,
  formatDateTr,
  remainingUntilBirth,
} from './breeding-center-labels';

function money(amount: number): string {
  return formatCurrency('money', amount);
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function BreedingCenter({ playerId, onBalanceChanged }: { playerId: string; onBalanceChanged: () => void }): React.ReactElement {
  const [center, setCenter] = useState<BreedingCenterView | null>(null);
  const [horses, setHorses] = useState<PublicHorse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [view, mine] = await Promise.all([apiClient.getBreedingCenter(), apiClient.getHorsesByOwner(playerId)]);
      setCenter(view);
      setHorses(mine);
      setError(null);
    } catch (err: unknown) {
      setError(errorText(err, 'Çiftleştirme merkezi yüklenemedi.'));
    }
  }, [playerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const afterChange = useCallback(
    async (message: string): Promise<void> => {
      setNotice(message);
      await reload();
      onBalanceChanged();
    },
    [onBalanceChanged, reload],
  );

  if (error !== null && center === null) {
    return <p style={{ color: 'var(--color-status-critical)' }}>{error}</p>;
  }
  if (center === null) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Yükleniyor…</p>;
  }
  const mares = horses.filter((horse) => horse.gender === 'mare' && horse.status === 'retired');

  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <RulesPanel center={center} />
      {notice !== null ? (
        <p role="status" style={{ margin: 0, color: 'var(--color-status-positive)', fontSize: '13px' }}>
          {notice}
        </p>
      ) : null}
      {error !== null ? <p role="alert" style={{ margin: 0, color: 'var(--color-status-critical)' }}>{error}</p> : null}
      <PregnanciesPanel pregnancies={center.pregnancies} onChanged={afterChange} onError={setError} />
      <OffersPanel
        title="Gelen teklifler (aygırlarına)"
        offers={center.incomingOffers}
        emptyText="Aygırlarına gelmiş bir teklif yok."
        onChanged={afterChange}
        onError={setError}
      />
      <OffersPanel
        title="Gönderdiğin teklifler"
        offers={center.outgoingOffers}
        emptyText="Henüz bir aygıra teklif göndermedin."
        onChanged={afterChange}
        onError={setError}
      />
      <MyStudsPanel studs={center.myStuds} onChanged={afterChange} onError={setError} />
      <StudSearchPanel mares={mares} center={center} onChanged={afterChange} onError={setError} />
    </div>
  );
}

function RulesPanel({ center }: { center: BreedingCenterView }): React.ReactElement {
  const rules = center.rules;
  return (
    <GlassPanel>
      <h2 style={titleStyle()}>Kurallar</h2>
      <ul data-testid="breeding-rules" style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--color-text-secondary)', display: 'grid', gap: '4px' }}>
        <li>Başka oyuncunun aygırıyla çiftleştirme yalnızca aygır sahibi teklifini <strong>kabul ederse</strong> olur.</li>
        <li>
          Damızlık ücreti teklif anında <strong>emanete</strong> alınır. Reddedilirse, iptal edersen, ilan kaldırılırsa ya da{' '}
          {rules.offerExpiryHours} saat içinde yanıtlanmazsa <strong>tamamı iade</strong> edilir.
        </li>
        <li>
          Kabulde döllenme denenir; olasılık {formatChance(rules.minConceptionChance)}–{formatChance(rules.maxConceptionChance)} arasındadır
          (doğurganlık, kısrağın sağlığı ve yaşı). Tutarsa ücretin %{rules.ownerSharePercent}&apos;i aygır sahibine geçer, kalanı kesintidir;
          tutmazsa ücretin %{rules.failedConceptionRefundPercent}&apos;i iade edilir ve kısrak {rules.failedAttemptCooldownHours} saat dinlenir.
        </li>
        <li>
          Gebelik yaklaşık <strong>{rules.gestationDays} gün</strong> sürer (sunucu saatiyle). Veteriner kontrolü ({money(rules.checkupCost)},{' '}
          {Math.round(rules.checkupIntervalHours / 24)} günde bir) ve kısrağı her gün beslemek doğum riskini düşürür. Tay tek doğar ve
          kısrak sahibinin ahırına katılır; yeri döllenmede ayrılır.
        </li>
      </ul>
    </GlassPanel>
  );
}

function PregnanciesPanel({
  pregnancies,
  onChanged,
  onError,
}: {
  pregnancies: PregnancyView[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}): React.ReactElement {
  const keys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const now = new Date();

  const checkup = async (pregnancy: PregnancyView): Promise<void> => {
    setBusy(pregnancy.pregnancyId);
    const key = keys.current.get(pregnancy.pregnancyId) ?? crypto.randomUUID();
    keys.current.set(pregnancy.pregnancyId, key);
    try {
      await apiClient.pregnancyCheckup(pregnancy.pregnancyId, key);
      keys.current.delete(pregnancy.pregnancyId);
      await onChanged(`${pregnancy.mareName} için veteriner kontrolü yapıldı.`);
    } catch (err: unknown) {
      onError(errorText(err, 'Kontrol yapılamadı.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassPanel>
      <h2 style={titleStyle()}>Gebelik takvimi</h2>
      {pregnancies.length === 0 ? (
        <p style={mutedStyle()}>Gebe kısrağın yok.</p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
          {pregnancies.map((pregnancy) => (
            <div key={pregnancy.pregnancyId} data-testid={`pregnancy-${pregnancy.pregnancyId}`} style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong>
                  {pregnancy.mareName} × {pregnancy.stallionName} → {pregnancy.foalName}
                </strong>
                <span style={{ fontSize: '12px' }}>
                  {pregnancy.status === 'born' ? 'Doğdu' : RISK_LABELS[pregnancy.riskLevel]}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pregnancy.progress * 100)}
                style={{ height: '6px', background: 'var(--color-border)', borderRadius: '3px', margin: '8px 0' }}
              >
                <div style={{ width: `${Math.round(pregnancy.progress * 100)}%`, height: '100%', background: 'var(--color-accent-gold)', borderRadius: '3px' }} />
              </div>
              <p style={mutedStyle()}>
                Döllenme {formatDateTr(pregnancy.conceivedAt)} · beklenen doğum {formatDateTr(pregnancy.expectedBirthAt)} ·{' '}
                {remainingUntilBirth(pregnancy, now)}
              </p>
              {pregnancy.status === 'gestating' ? (
                <>
                  <p style={mutedStyle()}>
                    Veteriner kontrolü {pregnancy.care.checkups}/{pregnancy.care.expectedCheckups} · beslenme %
                    {Math.round(pregnancy.care.nutritionScore * 100)}{' '}
                    <Link href="/stable?panel=care">(kısrağı besle)</Link>
                    {pregnancy.inbreedingDetected ? ' · akrabalık var (risk yüksek)' : ''}
                  </p>
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={busy !== null || pregnancy.care.nextCheckupAt !== null}
                    onClick={() => void checkup(pregnancy)}
                    style={{ marginTop: '8px' }}
                  >
                    {pregnancy.care.nextCheckupAt !== null
                      ? `Sonraki kontrol: ${formatDateTimeTr(pregnancy.care.nextCheckupAt)}`
                      : `Veteriner kontrolü (${money(pregnancy.care.checkupCost)})`}
                  </button>
                </>
              ) : pregnancy.foalId !== null ? (
                <p style={mutedStyle()}>
                  Tay ahırında: <Link href="/stable">Ahıra git</Link>
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function OffersPanel({
  title,
  offers,
  emptyText,
  onChanged,
  onError,
}: {
  title: string;
  offers: BreedingOfferView[];
  emptyText: string;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}): React.ReactElement {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (offer: BreedingOfferView, action: 'accept' | 'reject' | 'cancel'): Promise<void> => {
    if (action === 'accept' && !window.confirm(`${offer.mare.name} ile ${offer.stallion.name} çiftleştirilsin mi? Döllenme denenecek.`)) {
      return;
    }
    setBusy(offer.offerId);
    try {
      const result =
        action === 'accept'
          ? await apiClient.acceptBreedingOffer(offer.offerId)
          : action === 'reject'
            ? await apiClient.rejectBreedingOffer(offer.offerId)
            : await apiClient.cancelBreedingOffer(offer.offerId);
      await onChanged(`${result.stallion.name} teklifi: ${OFFER_STATUS_LABELS[result.status]}. ${describeOfferOutcome(result)}`);
    } catch (err: unknown) {
      onError(errorText(err, 'İşlem yapılamadı.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassPanel>
      <h2 style={titleStyle()}>{title}</h2>
      {offers.length === 0 ? (
        <p style={mutedStyle()}>{emptyText}</p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {offers.map((offer) => (
            <div key={offer.offerId} data-testid={`offer-${offer.offerId}`} style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong>
                  {offer.mare.name} × {offer.stallion.name}
                </strong>
                <span style={{ fontSize: '12px' }}>{OFFER_STATUS_LABELS[offer.status]}</span>
              </div>
              <p style={mutedStyle()}>
                {offer.direction === 'incoming'
                  ? `Gönderen: ${offer.mareOwner.username ?? 'oyuncu'} · kısrağın doğurganlığı ${offer.mare.fertility}`
                  : `Aygır sahibi: ${offer.stallionOwner.username ?? 'oyuncu'}`}{' '}
                · ücret {money(offer.fee)} · tay adı “{offer.foalName}”
              </p>
              <p style={mutedStyle()}>{describeOfferOutcome(offer)}</p>
              {offer.status === 'pending' ? (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {offer.direction === 'incoming' ? (
                    <>
                      <button type="button" className="btn-action btn-action-green" disabled={busy !== null} onClick={() => void act(offer, 'accept')}>
                        Kabul et
                      </button>
                      <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => void act(offer, 'reject')}>
                        Reddet
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => void act(offer, 'cancel')}>
                      Teklifi iptal et (tam iade)
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function MyStudsPanel({
  studs,
  onChanged,
  onError,
}: {
  studs: MyStudView[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}): React.ReactElement {
  const [fees, setFees] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (stud: MyStudView): Promise<void> => {
    const raw = fees[stud.stallionId] ?? String(stud.listing?.fee ?? stud.feeBounds.suggested);
    setBusy(stud.stallionId);
    try {
      await apiClient.putStudListing(stud.stallionId, Number(raw));
      await onChanged(`${stud.name} damızlık ilanında (${money(Number(raw))}).`);
    } catch (err: unknown) {
      onError(errorText(err, 'İlan kaydedilemedi.'));
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (stud: MyStudView): Promise<void> => {
    if (stud.pendingOfferCount > 0 && !window.confirm(`${stud.pendingOfferCount} bekleyen teklif iptal edilip iade edilecek. Devam?`)) {
      return;
    }
    setBusy(stud.stallionId);
    try {
      const result = await apiClient.withdrawStudListing(stud.stallionId);
      await onChanged(`${stud.name} ilandan kaldırıldı${result.cancelledOffers > 0 ? `; ${result.cancelledOffers} teklif iade edildi` : ''}.`);
    } catch (err: unknown) {
      onError(errorText(err, 'İlan kaldırılamadı.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassPanel>
      <h2 style={titleStyle()}>Aygırlarım (damızlık ilanı)</h2>
      {studs.length === 0 ? (
        <p style={mutedStyle()}>Aygırın yok. Emekli bir aygırla damızlık ilanı verebilirsin.</p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {studs.map((stud) => {
            const active = stud.listing?.status === 'active';
            return (
              <div key={stud.stallionId} data-testid={`my-stud-${stud.stallionId}`} style={cardStyle()}>
                <strong>{stud.name}</strong>{' '}
                <span style={mutedInline()}>
                  {breedLabel(stud.breed)} · doğurganlık {stud.fertility} · {stud.foalCount}/{stud.foalLimit} tay
                  {active ? ` · ilanda: ${money(stud.listing!.fee)}` : ''}
                  {stud.pendingOfferCount > 0 ? ` · ${stud.pendingOfferCount} bekleyen teklif` : ''}
                </span>
                {stud.eligible ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'end', marginTop: '8px', flexWrap: 'wrap' }}>
                    <label style={labelStyle()}>
                      Ücret ({money(stud.feeBounds.min)}–{money(stud.feeBounds.max)}; önerilen {money(stud.feeBounds.suggested)})
                      <input
                        aria-label={`${stud.name} ücreti`}
                        type="number"
                        min={stud.feeBounds.min}
                        max={stud.feeBounds.max}
                        step={1}
                        value={fees[stud.stallionId] ?? String(stud.listing?.fee ?? stud.feeBounds.suggested)}
                        onChange={(event) => setFees((current) => ({ ...current, [stud.stallionId]: event.target.value }))}
                        style={inputStyle()}
                      />
                    </label>
                    <button type="button" className="btn-action btn-action-blue" disabled={busy !== null} onClick={() => void save(stud)}>
                      {active ? 'Ücreti güncelle' : 'İlana çıkar'}
                    </button>
                    {active ? (
                      <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => void withdraw(stud)}>
                        İlanı kaldır
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p style={mutedStyle()}>{stud.ineligibleReason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

function StudSearchPanel({
  mares,
  center,
  onChanged,
  onError,
}: {
  mares: PublicHorse[];
  center: BreedingCenterView;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}): React.ReactElement {
  const [breed, setBreed] = useState('');
  const [maxFee, setMaxFee] = useState('');
  const [studs, setStuds] = useState<StudListingView[] | null>(null);
  const [selected, setSelected] = useState<StudListingView | null>(null);
  const [mareId, setMareId] = useState('');
  const [foalName, setFoalName] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingKey = useRef<{ fingerprint: string; key: string } | null>(null);

  const search = useCallback(async (): Promise<void> => {
    try {
      setStuds(
        await apiClient.listStuds({ breed: breed || undefined, maxFee: maxFee === '' ? undefined : Number(maxFee) }),
      );
    } catch (err: unknown) {
      onError(errorText(err, 'Aygırlar yüklenemedi.'));
    }
  }, [breed, maxFee, onError]);

  // Yalnızca açılışta; süzgeç değişince "Ara" ile yenilenir (ilk aramanın
  // kimliği bir ref'te tutulur, süzgeç değişimi yeniden istek atmaz).
  const initialSearch = useRef(search);
  useEffect(() => {
    void initialSearch.current();
  }, []);

  const sendOffer = async (): Promise<void> => {
    if (selected === null || mareId === '' || foalName.trim() === '') {
      onError('Kısrak ve tay adı seç.');
      return;
    }
    const fingerprint = `${selected.horseId}|${mareId}|${foalName.trim()}`;
    if (pendingKey.current?.fingerprint !== fingerprint) {
      pendingKey.current = { fingerprint, key: crypto.randomUUID() };
    }
    setBusy(true);
    try {
      const offer = await apiClient.createBreedingOffer(mareId, selected.horseId, foalName.trim(), pendingKey.current.key);
      pendingKey.current = null;
      setSelected(null);
      setFoalName('');
      await onChanged(`Teklif gönderildi: ${money(offer.fee)} emanete alındı. Aygır sahibi yanıtlayınca bildirim gelir.`);
    } catch (err: unknown) {
      onError(errorText(err, 'Teklif gönderilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassPanel>
      <h2 style={titleStyle()}>Damızlık aygır ara</h2>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={labelStyle()}>
          Irk
          <select aria-label="Irk süzgeci" value={breed} onChange={(event) => setBreed(event.target.value)} style={inputStyle()}>
            <option value="">Hepsi</option>
            {SHOP_BREEDS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle()}>
          En fazla ücret
          <input aria-label="En fazla ücret" type="number" min={0} value={maxFee} onChange={(event) => setMaxFee(event.target.value)} style={inputStyle()} />
        </label>
        <button type="button" className="btn-outline" onClick={() => void search()}>
          Ara
        </button>
      </div>
      {studs === null ? (
        <p style={mutedStyle()}>Yükleniyor…</p>
      ) : studs.length === 0 ? (
        <p style={mutedStyle()}>Bu süzgeçle ilanda aygır yok.</p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
          {studs.map((stud) => (
            <div key={stud.horseId} data-testid={`stud-${stud.horseId}`} style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong>{stud.name}</strong>
                <span style={{ fontWeight: 600, color: 'var(--color-accent-gold)' }}>{money(stud.fee)}</span>
              </div>
              <p style={mutedStyle()}>
                {breedLabel(stud.breed)} · Sv. {stud.level} · {Math.floor(stud.ageMonths / 12)} yaş · kalite {Math.round(stud.quality)} ·
                doğurganlık {stud.fertility} · {stud.foalCount}/{stud.foalLimit} tay · sahibi {stud.ownerUsername ?? 'oyuncu'}
              </p>
              <p style={mutedStyle()}>
                Soy: {stud.sireName ?? 'bilinmiyor'} × {stud.damName ?? 'bilinmiyor'} · {describeRecord(stud.record)}
              </p>
              <button type="button" className="btn-outline" style={{ marginTop: '8px' }} onClick={() => setSelected(stud)}>
                Teklif hazırla
              </button>
            </div>
          ))}
        </div>
      )}
      {selected !== null ? (
        <div data-testid="offer-form" style={{ ...cardStyle(), marginTop: 'var(--space-md)' }}>
          <strong>{selected.name} için teklif</strong>
          {mares.length === 0 ? (
            <p style={mutedStyle()}>Teklif için emekli bir kısrağın olmalı (ahırda “Emekli et”).</p>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'end', marginTop: '8px', flexWrap: 'wrap' }}>
              <label style={labelStyle()}>
                Kısrağın
                <select aria-label="Teklif kısrağı" value={mareId} onChange={(event) => setMareId(event.target.value)} style={inputStyle()}>
                  <option value="">Seç…</option>
                  {mares.map((horse) => (
                    <option key={horse.id} value={horse.id}>
                      {horse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle()}>
                Tay adı
                <input aria-label="Teklif tay adı" type="text" maxLength={24} value={foalName} onChange={(event) => setFoalName(event.target.value)} style={inputStyle()} />
              </label>
            </div>
          )}
          <p style={mutedStyle()}>
            Gönderince {money(selected.fee)} emanete alınır. Ret/iptal/{center.rules.offerExpiryHours} saatte yanıtsız → tam iade. Kabulde
            döllenme tutmazsa %{center.rules.failedConceptionRefundPercent} iade.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button type="button" className="btn-action btn-action-green" disabled={busy || mares.length === 0} onClick={() => void sendOffer()}>
              {busy ? 'Gönderiliyor…' : `Teklif gönder (${money(selected.fee)})`}
            </button>
            <button type="button" className="btn-outline" onClick={() => setSelected(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
    </GlassPanel>
  );
}

function titleStyle(): React.CSSProperties {
  return { fontSize: '16px', color: 'var(--color-text-primary)', marginTop: 0, marginBottom: 'var(--space-sm)' };
}

function mutedStyle(): React.CSSProperties {
  return { margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' };
}

function mutedInline(): React.CSSProperties {
  return { fontSize: '12px', color: 'var(--color-text-muted)' };
}

function cardStyle(): React.CSSProperties {
  return { padding: 'var(--space-sm) var(--space-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' };
}

function labelStyle(): React.CSSProperties {
  return { display: 'grid', gap: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' };
}

function inputStyle(): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '8px 12px',
    background: 'rgba(10, 16, 28, 0.6)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
  };
}
