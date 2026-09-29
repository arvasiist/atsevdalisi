'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Jockey, PlayerJockeyView } from '@at-sevdalisi/shared-types';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { formatCurrency } from '../../lib/currency';
import { usePlayer } from '../../lib/player-context';

/**
 * JOKEY YÜZEYİ — brief §13, §42 PHASE 6.2; FINAL_PROJECT_AUDIT #18
 * (29.09.2026).
 *
 * **BU EKRANIN KAPATTIĞI BOŞLUK.** Jokey 29.09.2026'ya kadar sunucuda
 * TAM çalışıyordu: kiralanabiliyor, `race_entries.jockey_id`ye yazılıyor
 * ve `jockeySkillComposite` olarak motora giriyordu (PHASE 6.2). Ama
 * **hiçbir ekran onu göstermiyordu** ve jokeyi bırakmanın **hiçbir yolu
 * yoktu** — üstelik `JockeyAlreadyHiredError`ın mesajı "Önce onu
 * bırakmalısın" diyordu. Yani sunucu, oyuncuya yapamayacağı bir şeyi
 * söylüyordu. Bu dilim ikisini birden kapatır: **vitrin + kiralama +
 * serbest bırakma**.
 *
 * **`composite` VİTRİNDE HESAPLANMAZ — ve bu bilinçli.** `PlayerJockeyView`
 * oyuncunun KENDİ jokeyi için sunucuda hesaplanmış `composite` taşır;
 * vitrindeki `Jockey` satırları taşımaz. Altı beceriyi config
 * ağırlıklarıyla burada çarpmak, formülün İKİNCİ bir kopyasını doğururdu
 * ve config değiştiğinde vitrinde görünen sayı ile motorun kullanacağı
 * sayı sessizce ayrışırdı. Vitrin bu yüzden **ham becerileri** gösterir;
 * karşılaştırma oyuncunun kendi jokeyinin `composite`iyle yapılır.
 *
 * **SERBEST BIRAKMA İADE ETMEZ.** Kiralama bedeli bir kiralama ücretidir,
 * depozito değil; ekran bunu düğmenin yanında AÇIKÇA yazar. İade
 * edilseydi `kirala → bırak` döngüsü jokey kiralamayı bedava yapardı.
 * Bu yüzden bırakma sonrası bakiye YENİDEN OKUNMAZ (değişmemiştir) —
 * değişen tek şey jokeyin sahibidir.
 *
 * **KİRALAMA PARA YOLUDUR ama `Idempotency-Key` GÖNDERİLMEZ:** sunucu o
 * başlığı bilerek okumaz; çift kiralamayı `owner_id` durum geçişi engeller
 * (409). Kiralamadan sonra üst bardaki bakiye tazelenir çünkü para
 * GERÇEKTEN düşer.
 */

const SKILL_LABELS: ReadonlyArray<readonly [keyof Jockey, string]> = [
  ['startSkill', 'Çıkış'],
  ['tacticalSkill', 'Taktik'],
  ['sprintSkill', 'Sprint'],
  ['horseControl', 'At kontrolü'],
  ['riskManagement', 'Risk yönetimi'],
  ['trackKnowledge', 'Pist bilgisi'],
];

export interface JockeyPanelProps {
  playerId: string;
}

export function JockeyPanel({ playerId }: JockeyPanelProps): React.ReactElement {
  const { refresh } = usePlayer();
  const [current, setCurrent] = useState<PlayerJockeyView | null>(null);
  const [showcase, setShowcase] = useState<Jockey[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyJockeyId, setBusyJockeyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * İki okuma TEK yerde: jokey değiştiren her yol (kirala / bırak)
   * yalnızca bunu çağırır, yoksa "kendi jokeyim" ile "vitrin" ekranın
   * farklı yerlerinde farklı anları gösterirdi.
   */
  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [mine, available] = await Promise.all([
        apiClient.getPlayerJockey(playerId),
        apiClient.getJockeys(),
      ]);
      setCurrent(mine);
      setShowcase(available);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Jokey bilgileri yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hire = useCallback(
    async (jockey: Jockey): Promise<void> => {
      setBusyJockeyId(jockey.id);
      setError(null);
      setNotice(null);
      try {
        const result = await apiClient.hireJockey(jockey.id);
        setNotice(`${result.jockey.name} kiralandı — ${formatCurrency('money', result.paid)} ödendi.`);
        // PARA GERÇEKTEN DÜŞTÜ: üst bardaki bakiye tazelenir. Bırakmada
        // bu çağrı YOKTUR (iade yok, bakiye değişmez).
        await refresh();
        await load();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Kiralama başarısız oldu');
      } finally {
        setBusyJockeyId(null);
      }
    },
    [load, refresh],
  );

  const release = useCallback(
    async (jockey: Jockey): Promise<void> => {
      setBusyJockeyId(jockey.id);
      setError(null);
      setNotice(null);
      try {
        const result = await apiClient.releaseJockey(jockey.id);
        setNotice(`${result.jockey.name} serbest bırakıldı. Kiralama bedeli iade edilmez.`);
        await load();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Serbest bırakma başarısız oldu');
      } finally {
        setBusyJockeyId(null);
      }
    },
    [load],
  );

  const isBusy = busyJockeyId !== null;

  return (
    <GlassPanel>
      <h2 style={panelTitleStyle()}>Jokey</h2>
      <p style={mutedStyle()}>
        Jokey, atına binen ve yarış sonucunu etkileyen kişidir. Bir oyuncunun en fazla bir jokeyi olur ve
        jokey <strong>her atında</strong> biner.
      </p>

      {error !== null ? <p style={errorStyle()}>{error}</p> : null}
      {notice !== null ? <p style={noticeStyle()}>{notice}</p> : null}

      {isLoading ? (
        <p style={mutedStyle()}>Yükleniyor…</p>
      ) : (
        <>
          <h3 style={sectionTitleStyle()}>Jokeyin</h3>
          {current === null ? (
            <p style={mutedStyle()}>
              Jokeyin yok. Aşağıdan bir jokey kiralayana kadar atların nötr bir puanla (50) koşar — ne ceza
              ne bonus.
            </p>
          ) : (
            <div style={cardStyle()}>
              <div style={cardHeaderStyle()}>
                <span style={nameStyle()}>{current.jockey.name}</span>
                <span style={compositeStyle()}>Puan: {current.composite.toFixed(1)}</span>
              </div>
              <p style={mutedStyle()}>
                Deneyim: {current.jockey.experience} · Kiralama bedeli:{' '}
                {formatCurrency('money', current.jockey.salary)}
              </p>
              <p style={mutedStyle()}>
                Bu puan <strong>bir sonraki yarışta</strong> geçerlidir; koşmakta olan bir yarışın kadrosu
                kilitlendiğinde donar.
              </p>
              <button
                type="button"
                onClick={() => void release(current.jockey)}
                disabled={isBusy}
                style={secondaryButtonStyle(isBusy)}
              >
                Serbest Bırak (bedel iade edilmez)
              </button>
            </div>
          )}

          <h3 style={sectionTitleStyle()}>Vitrin</h3>
          {current !== null ? (
            <p style={mutedStyle()}>
              Zaten bir jokeyin var. Başka bir jokey kiralamak için önce onu serbest bırakmalısın.
            </p>
          ) : null}
          {showcase === null || showcase.length === 0 ? (
            <p style={mutedStyle()}>Şu anda kiralamaya açık jokey yok.</p>
          ) : (
            <div style={listStyle()}>
              {showcase.map((jockey) => (
                <div key={jockey.id} style={cardStyle()}>
                  <div style={cardHeaderStyle()}>
                    <span style={nameStyle()}>{jockey.name}</span>
                    <span style={compositeStyle()}>{formatCurrency('money', jockey.salary)}</span>
                  </div>
                  <div style={skillGridStyle()}>
                    {SKILL_LABELS.map(([key, label]) => (
                      <span key={key} style={mutedStyle()}>
                        {label}: {String(jockey[key])}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void hire(jockey)}
                    disabled={isBusy || current !== null}
                    style={submitButtonStyle(!isBusy && current === null)}
                  >
                    Kirala — {formatCurrency('money', jockey.salary)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </GlassPanel>
  );
}

// --- yerel stil yardımcıları (AUDIT_REPORT.md F1: dokunma hedefi ≥ 44px) ---

function panelTitleStyle(): React.CSSProperties {
  return { margin: '0 0 var(--space-sm) 0', fontSize: '18px', color: 'var(--color-text-primary)' };
}

function sectionTitleStyle(): React.CSSProperties {
  return {
    margin: 'var(--space-md) 0 var(--space-sm) 0',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  };
}

function cardStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: '8px',
    padding: 'var(--space-md)',
    marginBottom: 'var(--space-sm)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-surface-raised)',
  };
}

function cardHeaderStyle(): React.CSSProperties {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' };
}

function nameStyle(): React.CSSProperties {
  return { fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' };
}

function compositeStyle(): React.CSSProperties {
  return { fontSize: '14px', fontWeight: 600, color: 'var(--color-accent-gold)' };
}

function skillGridStyle(): React.CSSProperties {
  return { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '4px', fontSize: '12px' };
}

function listStyle(): React.CSSProperties {
  return { display: 'grid', gap: 'var(--space-sm)' };
}

function mutedStyle(): React.CSSProperties {
  return { margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' };
}

function errorStyle(): React.CSSProperties {
  return { margin: '0 0 var(--space-sm) 0', fontSize: '12px', color: 'var(--color-status-critical)' };
}

function noticeStyle(): React.CSSProperties {
  return { margin: '0 0 var(--space-sm) 0', fontSize: '12px', color: 'var(--color-status-success)' };
}

function submitButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '0 var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-accent-gold)',
    background: enabled ? 'var(--color-accent-gold)' : 'transparent',
    color: enabled ? 'var(--color-bg-base)' : 'var(--color-text-muted)',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.6,
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '0 var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
