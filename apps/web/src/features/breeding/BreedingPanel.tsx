'use client';

/**
 * Ahırdaki yetiştirme paneli — KENDİ kısrağı × KENDİ aygırı
 * (`POST /players/:id/breeding`, brief §5).
 *
 * 16.10.2026: başkasının aygırı yalnızca Çiftleştirme Merkezi'nde (`/breeding`)
 * teklif + aygır sahibinin kabulüyle kullanılır; sunucu bu uçta başkasının
 * aygırını 409 `BREEDING_REQUIRES_AGREEMENT` ile reddeder. Tay ANINDA doğmaz:
 * döllenme olasılığı < 1'dir, tutarsa gebelik başlar (süre sunucu config'i),
 * doğumu sunucu zamanlayıcısı yapar. İstemci olasılık/süre HESAPLAMAZ; yanıttaki
 * değerleri gösterir.
 *
 * **`Idempotency-Key` BAŞARISIZLIKTA ATILMAZ** — `wallet/page.tsx` ile AYNI
 * desen: ilk istek gerçekten işlenip yanıt ağda kaybolduysa aynı anahtarla
 * tekrar gider ve sunucu SAKLANAN yanıtı döner (ikinci deneme olmaz). Başarıda
 * ya da girdi değişince anahtar bırakılır.
 */

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import type { BreedingAttemptView, PublicHorse } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { describeAttempt } from './breeding-center-labels';

export interface BreedingPanelProps {
  ownerId: string;
  /** Ahırdaki atlar (`GET /horses?ownerId=`) — kısrak ve aygır listeleri buradan süzülür. */
  horses: PublicHorse[];
  /** Tay doğduktan sonra ahır listesi + üst bar bakiyesi tazelenir. */
  onBred: () => Promise<void>;
}

export function BreedingPanel({ ownerId, horses, onBred }: BreedingPanelProps): React.ReactElement {
  const mares = horses.filter((horse) => horse.gender === 'mare' && horse.status === 'retired');
  const ownStallions = horses.filter((horse) => horse.gender === 'stallion' && horse.status === 'retired');
  const racingMareCount = horses.filter((horse) => horse.gender === 'mare' && horse.status !== 'retired').length;

  const [mareId, setMareId] = useState('');
  const [stallionChoice, setStallionChoice] = useState('');
  const [foalName, setFoalName] = useState('');

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BreedingAttemptView | null>(null);

  /** Bkz. dosya başı doc yorumu — başarısızlıkta YAŞAR, başarıda/girdi değişince bırakılır. */
  const breedingKeyRef = useRef<string | null>(null);

  /**
   * Girdilerden HERHANGİ biri değiştiğinde bekleyen anahtar bırakılır: artık
   * farklı bir mantıksal istektir ve eski anahtarla gitmesi, sunucunun ilk
   * isteğin SAKLANAN yanıtını dönmesine yol açardı (yani oyuncu yeni bir
   * çiftleştirme yaptığını sanırken hiçbir şey olmazdı). Önceki hata/ sonuç
   * da temizlenir — kullanıcı girdiyi düzeltirken ekranda BAYAT bir hata
   * kalması, düzeltmenin işe yaramadığı izlenimini verirdi.
   */
  const onInputChanged = useCallback((): void => {
    breedingKeyRef.current = null;
    setError(null);
    setResult(null);
  }, []);

  const resolvedStallionId = stallionChoice;

  const breed = useCallback(async (): Promise<void> => {
    if (mareId === '' || resolvedStallionId === '' || foalName.trim() === '') {
      setError('Kısrak, aygır ve tay adı zorunludur.');
      return;
    }
    setIsBusy(true);
    setError(null);
    setResult(null);
    try {
      if (breedingKeyRef.current === null) {
        breedingKeyRef.current = crypto.randomUUID();
      }
      const outcome = await apiClient.breedHorses(
        ownerId,
        mareId,
        resolvedStallionId,
        foalName.trim(),
        breedingKeyRef.current,
      );
      // Başarılı — anahtar TÜKENDİ. Bir sonraki çiftleştirme yeni anahtar alır.
      breedingKeyRef.current = null;
      setResult(outcome);
      setFoalName('');
      await onBred();
    } catch (err: unknown) {
      // Anahtar BİLEREK korunur (bkz. dosya başı doc yorumu).
      setError(err instanceof Error ? err.message : 'Çiftleştirme başarısız oldu');
    } finally {
      setIsBusy(false);
    }
  }, [foalName, mareId, onBred, ownerId, resolvedStallionId]);

  if (mares.length === 0) {
    return (
      <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
        <h2 style={panelTitleStyle()}>Yetiştirme</h2>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '13px' }}>
          Çiftleştirme yapabilmek için ahırında en az bir <strong>emekli kısrak</strong> olmalı — tay, kısrağın
          sahibinin ahırına doğar. Başka oyuncuların aygırları için{' '}
          <Link href="/breeding">Çiftleştirme Merkezi</Link>'ne bak.
        </p>
        {racingMareCount > 0 ? (
          <p style={mutedStyle()}>
            Yarışan kısrağını ahır kartındaki <strong>“Emekli et”</strong> düğmesiyle damızlığa ayırabilirsin. Emeklilik
            geri alınmaz: emekli at yarışamaz ve antrenman yapamaz.
          </p>
        ) : null}
      </GlassPanel>
    );
  }

  const canSubmit = mareId !== '' && resolvedStallionId !== '' && foalName.trim() !== '' && !isBusy;

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <h2 style={panelTitleStyle()}>Yetiştirme</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-md)', fontSize: '13px' }}>
        Kendi emekli kısrağını kendi emekli aygırınla çiftleştir (ücretsiz). Döllenme her zaman tutmaz; tutarsa
        gebelik başlar ve tay süre dolunca ahırına doğar. Başka oyuncunun aygırı için{' '}
        <Link href="/breeding">Çiftleştirme Merkezi</Link>'nden teklif gönder.
      </p>

      <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label style={fieldLabelStyle()}>
          Kısrak
          <select
            aria-label="Kısrak"
            value={mareId}
            onChange={(event) => {
              setMareId(event.target.value);
              onInputChanged();
            }}
            style={inputStyle()}
          >
            <option value="">Seç…</option>
            {mares.map((horse) => (
              <option key={horse.id} value={horse.id}>
                {horse.name} · Seviye {horse.level}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldLabelStyle()}>
          Aygır
          <select
            aria-label="Aygır"
            value={stallionChoice}
            onChange={(event) => {
              setStallionChoice(event.target.value);
              onInputChanged();
            }}
            style={inputStyle()}
          >
            <option value="">Seç…</option>
            {ownStallions.map((horse) => (
              <option key={horse.id} value={horse.id}>
                {horse.name} · Seviye {horse.level} (kendi aygırın)
              </option>
            ))}
          </select>
        </label>

        <label style={fieldLabelStyle()}>
          Tay adı
          <input
            aria-label="Tay adı"
            type="text"
            value={foalName}
            maxLength={40}
            onChange={(event) => {
              setFoalName(event.target.value);
              onInputChanged();
            }}
            style={inputStyle()}
          />
        </label>
      </div>

      <button type="button" onClick={() => void breed()} disabled={!canSubmit} style={submitButtonStyle(canSubmit)}>
        {isBusy ? 'Deneniyor…' : 'Çiftleştir'}
      </button>

      {result !== null ? (
        <div
          data-testid="breeding-attempt-result"
          style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-sm)' }}
        >
          <p
            style={{
              margin: 0,
              color: result.outcome === 'conceived' ? 'var(--color-status-positive)' : 'var(--color-status-warning)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {describeAttempt(result).title}
          </p>
          <p style={{ ...mutedStyle(), marginTop: '4px' }}>{describeAttempt(result).detail}</p>
          {result.pregnancy?.inbreedingDetected ? (
            <p style={{ ...mutedStyle(), color: 'var(--color-status-warning)' }}>
              Akrabalık tespit edildi — tayın potansiyeli ve sağlığı bundan etkilenebilir.
            </p>
          ) : null}
        </div>
      ) : null}

      {error !== null ? (
        <p style={{ color: 'var(--color-status-critical)', marginBottom: 0, fontSize: '13px' }}>{error}</p>
      ) : null}
    </GlassPanel>
  );
}

function panelTitleStyle(): React.CSSProperties {
  return { fontSize: '16px', color: 'var(--color-text-primary)', marginTop: 0, marginBottom: 'var(--space-sm)' };
}

function fieldLabelStyle(): React.CSSProperties {
  return { display: 'grid', gap: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' };
}

function inputStyle(): React.CSSProperties {
  return {
    // AUDIT_REPORT.md F1 ile AYNI kural: 44px dokunma hedefi.
    minHeight: '44px',
    padding: '8px 12px',
    background: 'rgba(10, 16, 28, 0.6)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
  };
}

function mutedStyle(): React.CSSProperties {
  return { margin: '8px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' };
}

function submitButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    marginTop: 'var(--space-md)',
    minHeight: '44px',
    padding: '12px 24px',
    background: enabled ? 'var(--color-accent-gold)' : 'transparent',
    color: enabled ? '#1a1405' : 'var(--color-text-muted)',
    border: enabled ? 'none' : '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '14px',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
