'use client';

import dynamic from 'next/dynamic';

const RaceScene3D = dynamic(
  () => import('../../../features/race-viewer/RaceScene3D').then((mod) => mod.RaceScene3D),
  { ssr: false, loading: () => <p style={{ color: '#fff', padding: '2rem' }}>3D Hipodrom yükleniyor...</p> },
);

export default function RaceDemoPage() {
  return (
    <main style={{ width: '100vw', height: 'calc(100vh - 65px)', background: '#0b1220', position: 'relative' }}>
      <RaceScene3D />
    </main>
  );
}