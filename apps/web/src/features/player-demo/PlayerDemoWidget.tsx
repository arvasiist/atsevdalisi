'use client';

import { useState } from 'react';

/**
 * FAZ 1 wiring — Canlı API testi (bu oturum).
 *
 * Bu bir "geçici geliştirici demosu" widget'ıdır, `docs/GAME_DESIGN.md` §4'teki
 * gerçek Ana Sayfa TASARIMI DEĞİLDİR. Amacı tek şey: `POST /players`
 * uç noktasının — dolayısıyla API → Application → Domain → Infrastructure
 * (gerçek PostgreSQL) zincirinin BAŞTAN SONA çalıştığını, tarayıcıdan
 * gerçek bir istekle kanıtlamak (bkz. docs/ROADMAP.md "FAZ 1 wiring" bölümü).
 *
 * Bilinçli olarak İSTEMCİ bileşeni (`'use client'`): `fetch` çağrısı
 * yalnızca kullanıcının tarayıcısında, düğmeye basıldığında çalışır. Eğer
 * bu bir SUNUCU bileşeni olsaydı ve build/prerender sırasında veri
 * çekmeye çalışsaydı, CI'daki `next build` adımı gerçek bir API
 * sunucusu ayakta olmadığı için başarısız olurdu — bu riskten kaçınmak
 * için kasıtlı bir tasarım kararı.
 *
 * Gerçek Google/Apple girişi (brief §7) YERİNE burada yalnızca kullanıcı
 * adı + görünen ad ile doğrudan kayıt yapılıyor — bu da kasıtlı ve
 * geçici: gerçek OAuth, bu ortamda kurulamayacak dış hesaplar (bkz.
 * docs/ARCHITECTURE.md §8) gerektirir. `RegisterPlayerUseCase`'in kendi
 * doc-comment'inde açıklandığı gibi, OAuth eklendiğinde bu use-case'in
 * kendisi DEĞİL, onu çağıran controller/DTO değişecektir.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

interface PlayerSummary {
  id: string;
  displayName: string;
  avatarId: string | null;
  level: number;
  xp: number;
  money: number;
  gems: number;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

type ApiResult<T> = ApiSuccess<T> | ApiFailure;

function randomUsername(): string {
  return `demo_${Math.random().toString(36).slice(2, 10)}`;
}

export function PlayerDemoWidget(): React.ReactElement {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCreateDemoPlayer(): Promise<void> {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: randomUsername(), displayName: 'Demo Oyuncu' }),
      });
      const result = (await response.json()) as ApiResult<PlayerSummary>;

      if (!result.success) {
        setStatus('error');
        setErrorMessage(`${result.error.code}: ${result.error.message}`);
        return;
      }

      setPlayer(result.data);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error
          ? `API'ye ulaşılamadı: ${err.message}`
          : 'API\'ye ulaşılamadı (bilinmeyen hata).',
      );
    }
  }

  return (
    <section
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        marginTop: 'var(--space-lg)',
      }}
    >
      <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: 'var(--space-sm)' }}>
        Canlı API testi — FAZ 1 wiring
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', lineHeight: 1.6, maxWidth: '640px' }}>
        Aşağıdaki düğme, tarayıcıdan gerçek API&apos;ye (<code>POST /players</code>) bir istek
        gönderir ve gerçek PostgreSQL veritabanına yeni bir demo oyuncu kaydeder. Bu, geçici bir
        geliştirici testidir — gerçek Ana Sayfa değildir.
      </p>

      <button
        onClick={handleCreateDemoPlayer}
        disabled={status === 'loading'}
        style={{
          marginTop: 'var(--space-sm)',
          background: 'var(--color-accent-gold)',
          color: 'var(--color-bg-base)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: '10px 18px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          opacity: status === 'loading' ? 0.6 : 1,
        }}
      >
        {status === 'loading' ? 'Oluşturuluyor…' : 'Demo oyuncu oluştur'}
      </button>

      {status === 'success' && player ? (
        <div
          style={{
            marginTop: 'var(--space-md)',
            padding: 'var(--space-md)',
            background: 'var(--color-bg-surface-elevated)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            color: 'var(--color-text-primary)',
          }}
        >
          <p style={{ margin: 0, color: 'var(--color-status-positive, #4ade80)', fontWeight: 600 }}>
            ✓ Oyuncu oluşturuldu (gerçek veritabanından döndü)
          </p>
          <p style={{ margin: '8px 0 0' }}>Ad: {player.displayName}</p>
          <p style={{ margin: '4px 0 0' }}>Seviye: {player.level} · XP: {player.xp}</p>
          <p style={{ margin: '4px 0 0' }}>
            Para: {player.money} · Gem: {player.gems}
          </p>
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', fontSize: '11px' }}>ID: {player.id}</p>
        </div>
      ) : null}

      {status === 'error' && errorMessage ? (
        <p
          style={{
            marginTop: 'var(--space-md)',
            color: 'var(--color-status-critical, #f87171)',
            fontSize: '13px',
          }}
        >
          ✗ {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
