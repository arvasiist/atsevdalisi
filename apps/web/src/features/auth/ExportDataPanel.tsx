'use client';

/**
 * VERİLERİMİ İNDİR (02.10.2026, KVKK md. 11 / GDPR md. 15, 20). Sunucunun
 * döndürdüğü JSON olduğu gibi dosyaya yazılır; tarayıcı dışında bir yere
 * gönderilmez.
 */

import { useState } from 'react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { apiClient } from '../../lib/api-client';
import { exportFileName, truncatedSections } from './data-export';

export function ExportDataPanel(): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiClient.exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(data.exportedAt);
      link.click();
      URL.revokeObjectURL(url);
      const cut = truncatedSections(data);
      setMessage(
        cut.length === 0
          ? 'Verilerin indirildi.'
          : `Verilerin indirildi. Şu bölümler çok uzun olduğu için en yeni kayıtlarla sınırlandı: ${cut.join(', ')}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veriler indirilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassPanel>
      <h2 style={{ marginTop: 0 }}>Verilerim</h2>
      <p className="session-meta">
        Hesabın, atların, para hareketlerin, yarışların, mesajların ve diğer kişisel verilerin tek bir JSON
        dosyası olarak. Şifren ve oturum anahtarların dosyaya girmez.
      </p>
      <button type="button" className="moderation-primary" disabled={busy} onClick={() => void download()}>
        {busy ? 'Hazırlanıyor…' : 'Verilerimi indir'}
      </button>
      {message ? <p className="quest-notice">{message}</p> : null}
      {error ? <p className="moderation-error">{error}</p> : null}
    </GlassPanel>
  );
}
