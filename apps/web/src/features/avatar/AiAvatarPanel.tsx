'use client';

/**
 * FOTOĞRAFTAN AI AVATAR (07.10.2026, Faz 8-B, brief §38–49).
 *
 * Sunucu bir sağlayıcı yapılandırmadıysa (`available: false`) bunu AÇIKÇA
 * söyler — sahte bir "hazırlanıyor" gösterilmez (brief §70). Yükleme rıza
 * ister; selfie yalnızca avatar için işlenir ve iş bitince silinir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarGenerationStatusView } from '@at-sevdalisi/shared-types';
import { apiClient } from '../../lib/api-client';
import { AVATAR_JOB_STATUS_LABELS, avatarJobErrorText, isActiveAvatarJob } from './ai-avatar-labels';

const POLL_MS = 5000;

export function AiAvatarPanel(): React.ReactElement {
  const [status, setStatus] = useState<AvatarGenerationStatusView | null>(null);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiClient.getAvatarGeneration());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI avatar durumu alınamadı.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = status?.currentJob ? isActiveAvatarJob(status.currentJob.status) : false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  if (status === null) {
    return <p className="session-meta">{error ?? 'Yükleniyor…'}</p>;
  }

  if (!status.available) {
    return (
      <div data-testid="ai-avatar-unavailable">
        <p className="session-meta">
          Fotoğraftan AI avatar şu an kapalı: sunucuda bir AI sağlayıcısı yapılandırılmadı. Manuel avatarın
          kullanılmaya devam eder.
        </p>
        {status.aiAvatar || status.currentJob ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => apiClient.deleteAiAvatar(), 'AI avatar verilerin silindi.')}
          >
            AI avatar verilerimi sil
          </button>
        ) : null}
      </div>
    );
  }

  const job = status.currentJob;
  return (
    <div data-testid="ai-avatar-panel" className="ai-avatar-panel">
      {error ? <p className="moderation-error">{error}</p> : null}
      {notice ? <p className="quest-notice">{notice}</p> : null}
      {job ? (
        <p className="session-meta" data-testid="ai-avatar-job">
          Son işlem: <strong>{AVATAR_JOB_STATUS_LABELS[job.status]}</strong>
          {job.status === 'failed' ? ` — ${avatarJobErrorText(job.errorCode)}` : ''}
        </p>
      ) : null}
      {status.aiAvatar ? <p className="session-meta">AI avatarın hazır.</p> : null}
      {active && job ? (
        <button
          type="button"
          disabled={busy || job.status === 'processing'}
          onClick={() => void run(() => apiClient.cancelAvatarGeneration(job.id), 'İşlem iptal edildi.')}
        >
          İptal et
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!file) return;
            void run(async () => {
              await apiClient.requestAvatarGeneration(file, status.consentVersion);
              setFile(null);
              if (fileInput.current) fileInput.current.value = '';
            }, 'Fotoğrafın alındı; avatarın hazırlanıyor.');
          }}
        >
          <p className="session-meta">
            Yüzünün net göründüğü, tek kişilik bir fotoğraf seç (en az {status.minDimension} piksel). Fotoğraf
            yalnızca avatarını oluşturmak için işlenir ve işlem bitince silinir. İstediğin an AI avatar
            verilerini silebilirsin.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept={status.acceptedTypes.join(',')}
            aria-label="Selfie fotoğrafı"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <label className="ai-avatar-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            Fotoğrafımın avatar oluşturmak için işlenmesini onaylıyorum (sürüm {status.consentVersion}).
          </label>
          <button type="submit" className="moderation-primary" disabled={busy || !consent || !file}>
            Avatarımı oluştur
          </button>
        </form>
      )}
      {status.aiAvatar || job ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => apiClient.deleteAiAvatar(), 'AI avatar verilerin silindi.')}
        >
          AI avatar verilerimi sil
        </button>
      ) : null}
    </div>
  );
}
