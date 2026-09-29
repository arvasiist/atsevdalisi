'use client';

/**
 * Yetiştirme (çiftleştirme) paneli — `POST /players/:id/breeding`.
 *
 * NEDEN VAR: bu uç nokta, `BreedHorsesUseCase` + `IdempotencyInterceptor`
 * ile birlikte sunucuda ÇALIŞIYORDU (ve bir PARA YOLUDUR: aygır başkasının
 * ise damızlık ücreti `breeding_stud_fee_debit`/`_credit` çiftiyle, aynı
 * transaction'da, defter kaydıyla transfer edilir) — ama **hiçbir ekrandan
 * çağrılmıyordu**. Yani soy ağacı veri zincirinin YAZMA yarısı oyuncu için
 * ULAŞILAMAZ durumdaydı; okuma yarısı (`GET /horses/:id/pedigree` →
 * `PedigreeTree`) bağlıydı. Bkz. `docs/FINAL_PROJECT_AUDIT.md` §5 öncelik 3
 * / madde #16.
 *
 * **İSTEMCİ HİÇBİR TUTAR HESAPLAMAZ.** Damızlık ücreti aygırın kalite/
 * potansiyelinden ve `config/genetics.config.json`dan SUNUCUDA türetilir
 * (`calculateStudFee`). Burada ne bir formül ne bir "tahmini ücret" vardır:
 * ücret yalnızca yanıttaki `fee` alanından — yani GERÇEKLEŞMİŞ değerden —
 * okunur. Uygunluk (yaş, cinsiyet, kısrak cooldown'ı, pazarda aktif ilan,
 * akrabalık) da tamamen sunucudadır; ekran yalnızca kısrak + aygır + tay
 * adı toplar ve dönen Türkçe hatayı gösterir.
 *
 * **`Idempotency-Key` BAŞARISIZLIKTA ATILMAZ** — `wallet/page.tsx` ile AYNI
 * desen (bkz. `api-client.ts` `breedHorses` doc yorumu). Sunucu tarafında
 * anahtar hata durumunda `pending` rezervasyonu SİLİNEREK bırakılır
 * (`idempotency.interceptor.ts` → `tap({ error })`), yani anahtarı korumak
 * ne bayat bir hatayı ne de ikinci bir tayı üretir: ilk istek gerçekten
 * başarılı olup yanıt ağda kaybolduysa, tekrar AYNI anahtarla gider ve
 * sunucu SAKLANAN yanıtı döner — ikinci bir tay doğmaz.
 *
 * **Aygır seçimi:** kendi aygırların listelenir; ayrıca başka bir oyuncunun
 * aygırı için kimlik (UUID) girilebilir. Bu, icat edilmiş bir "aygır pazarı"
 * uç noktası DEĞİLDİR — `GET /horses/:id` zaten `@Public()`tir ve pazar
 * ekranı da atları ham kimlikle gösterir. Girilen kimlik doğrulandığında
 * adı ve cinsiyeti o uçtan okunur; cinsiyet `stallion` değilse ekran bunu
 * SÖYLER (kararı yine sunucu verir).
 */

import { useCallback, useRef, useState } from 'react';
import type { BreedingResultView, HorseGender, PublicHorse } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';

/** "Başka bir oyuncunun aygırı" seçeneğinin `<select>` değeri — gerçek bir kimlikle çakışamaz. */
const FOREIGN_STALLION_OPTION = '__other__';

const GENDER_LABELS: Record<HorseGender, string> = {
  mare: 'Kısrak',
  stallion: 'Aygır',
  gelding: 'İğdiş',
};

export interface BreedingPanelProps {
  ownerId: string;
  /** Ahırdaki atlar (`GET /horses?ownerId=`) — kısrak ve aygır listeleri buradan süzülür. */
  horses: PublicHorse[];
  /** Tay doğduktan sonra ahır listesi + üst bar bakiyesi tazelenir. */
  onBred: () => Promise<void>;
}

export function BreedingPanel({ ownerId, horses, onBred }: BreedingPanelProps): React.ReactElement {
  const mares = horses.filter((horse) => horse.gender === 'mare');
  const ownStallions = horses.filter((horse) => horse.gender === 'stallion');

  const [mareId, setMareId] = useState('');
  const [stallionChoice, setStallionChoice] = useState('');
  const [foreignStallionId, setForeignStallionId] = useState('');
  const [foalName, setFoalName] = useState('');

  const [foreignStallion, setForeignStallion] = useState<PublicHorse | null>(null);
  const [isForeignLoading, setIsForeignLoading] = useState(false);
  const [foreignError, setForeignError] = useState<string | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BreedingResultView | null>(null);

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

  /** Kısrak/aygır seçiminden çözülen GERÇEK aygır kimliği. */
  const resolvedStallionId =
    stallionChoice === FOREIGN_STALLION_OPTION ? foreignStallionId.trim() : stallionChoice;

  const lookupForeignStallion = useCallback(async (): Promise<void> => {
    const horseId = foreignStallionId.trim();
    if (horseId === '') {
      setForeignStallion(null);
      setForeignError(null);
      return;
    }
    setIsForeignLoading(true);
    setForeignError(null);
    try {
      setForeignStallion(await apiClient.getHorseDetails(horseId));
    } catch {
      // Sessiz bir "bulunamadı" DEĞİL: kullanıcı kimliği yanlış girmiş
      // olabilir ve bunu öğrenmesi gerekir — ama kararı yine sunucu verir.
      setForeignStallion(null);
      setForeignError('Bu kimlikle bir at bulunamadı.');
    } finally {
      setIsForeignLoading(false);
    }
  }, [foreignStallionId]);

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
          Çiftleştirme yapabilmek için ahırında en az bir <strong>kısrak</strong> olmalı — tay, kısrağın sahibinin
          ahırına doğar ve damızlık ücretini kısrağın sahibi öder.
        </p>
      </GlassPanel>
    );
  }

  const canSubmit = mareId !== '' && resolvedStallionId !== '' && foalName.trim() !== '' && !isBusy;

  return (
    <GlassPanel style={{ marginBottom: 'var(--space-lg)' }}>
      <h2 style={panelTitleStyle()}>Yetiştirme</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, marginBottom: 'var(--space-md)', fontSize: '13px' }}>
        Bir kısrağı aygırla çiftleştir; tay <strong>anında</strong> doğar ve kısrağın sahibinin ahırına katılır. Damızlık
        ücreti, aygır başka bir oyuncunun ise sahibine aktarılır.
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
            <option value={FOREIGN_STALLION_OPTION}>Başka bir oyuncunun aygırı (kimlik gir)…</option>
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

      {stallionChoice === FOREIGN_STALLION_OPTION ? (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <label style={fieldLabelStyle()}>
            Aygır kimliği (UUID)
            <input
              aria-label="Aygır kimliği"
              type="text"
              value={foreignStallionId}
              placeholder="örn. 3f9c1e5a-…"
              onChange={(event) => {
                setForeignStallionId(event.target.value);
                setForeignStallion(null);
                setForeignError(null);
                onInputChanged();
              }}
              onBlur={() => void lookupForeignStallion()}
              style={inputStyle()}
            />
          </label>
          {isForeignLoading ? (
            <p style={mutedStyle()}>Aygır aranıyor…</p>
          ) : foreignError !== null ? (
            <p style={{ ...mutedStyle(), color: 'var(--color-status-critical)' }}>{foreignError}</p>
          ) : foreignStallion !== null ? (
            <p style={mutedStyle()}>
              {foreignStallion.name} · {GENDER_LABELS[foreignStallion.gender]}
              {foreignStallion.gender !== 'stallion' ? (
                <span style={{ color: 'var(--color-status-warning)' }}>
                  {' '}
                  — bu at aygır değil; sunucu çiftleştirmeyi reddedecektir.
                </span>
              ) : (
                <span> — damızlık ücreti sahibine aktarılır.</span>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <button type="button" onClick={() => void breed()} disabled={!canSubmit} style={submitButtonStyle(canSubmit)}>
        {isBusy ? 'Çiftleştiriliyor…' : 'Çiftleştir'}
      </button>

      {result !== null ? (
        <div style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-sm)' }}>
          <p style={{ margin: 0, color: 'var(--color-status-positive)', fontSize: '13px', fontWeight: 600 }}>
            {result.foalName} doğdu — {GENDER_LABELS[result.foalGender]}. Ahırına eklendi.
          </p>
          <p style={{ ...mutedStyle(), marginTop: '4px' }}>
            {result.fee > 0
              ? `Damızlık ücreti: ${formatCurrency('money', result.fee)} (aygır sahibine aktarıldı)`
              : 'Damızlık ücreti alınmadı (aygır senin).'}
          </p>
          {result.payerBalance !== null ? (
            <p style={mutedStyle()}>Kalan bakiyen: {formatCurrency('money', result.payerBalance.money)}</p>
          ) : null}
          {result.inbreedingDetected ? (
            <p style={{ ...mutedStyle(), color: 'var(--color-status-warning)' }}>
              Akrabalık tespit edildi — tayın potansiyeli bu yüzden düşük olabilir.
            </p>
          ) : null}
          <p style={mutedStyle()}>Doğum sağlık riski: %{(result.birthHealthRisk * 100).toFixed(1)}</p>
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
