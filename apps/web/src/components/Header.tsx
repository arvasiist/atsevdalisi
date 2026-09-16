'use client';

import Link from 'next/link';

export function Header() {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 2rem',
        borderBottom: '1px solid #e2e8f0',
        background: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>
        🏇 Hipodrom
      </div>
      <nav style={{ display: 'flex', gap: '1.5rem' }}>
        <Link
          href="/"
          style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 500 }}
        >
          Ahırım
        </Link>
        <Link
          href="/market"
          style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 500 }}
        >
          At Pazarı
        </Link>
      </nav>
    </header>
  );
}
