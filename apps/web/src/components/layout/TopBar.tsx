'use client';

/**
 * `docs/GAME_DESIGN.md` §3 "Top bar" — eski `components/Header.tsx`'in
 * yerini alır (o dosya açık bir placeholder'dı: beyaz/açık tema, sabit
 * `#2563eb` renk, sadece iki metin linki, koyu tema token'larıyla hiç
 * UYUMLU değildi ve "Ahırım" linki yanlışlıkla `/`'ye gidiyordu).
 *
 * Kapsam notu: brief'in tam top bar tasarımı (saat/hava durumu/konum,
 * bildirim/mesaj ikonları) burada YOK — gerçek bir veri kaynağı olmayan
 * unsurlar (ör. sahte "hava durumu") EKLENMEDİ. Yalnızca gerçek veriye
 * sahip olanlar gösterilir: oyuncu adı/seviyesi/bakiyesi (`PlayerContext`,
 * gerçek `GET /players/:id` verisi).
 */

import Link from 'next/link';
import { usePlayer } from '../../lib/player-context';
import { HorseAvatar } from '../ui/HorseAvatar';

export function TopBar(): React.ReactElement {
  const { player } = usePlayer();

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-md)',
        padding: '12px var(--space-md)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-surface-elevated)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          fontSize: '18px',
          color: 'var(--color-text-primary)',
          letterSpacing: '0.02em',
        }}
      >
        <span aria-hidden="true">🏇</span>
        AT SEVDALISI
      </Link>

      {player ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <CurrencyPill icon="💰" value={player.money} />
          <CurrencyPill icon="💎" value={player.gems} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HorseAvatar horseId={player.id} size={32} />
            <div style={{ display: 'grid', lineHeight: 1.25 }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {player.displayName}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-accent-gold)' }}>Seviye {player.level}</span>
            </div>
          </div>
        </div>
      ) : (
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Misafir</span>
      )}
    </header>
  );
}

function CurrencyPill({ icon, value }: { icon: string; value: number }): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid var(--color-border)',
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--color-text-primary)',
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {value.toLocaleString('tr-TR')}
    </div>
  );
}
