'use client';

import dynamic from 'next/dynamic';

const RaceScene3D = dynamic(
  () => import('../../../features/race-viewer/RaceScene3D').then((mod) => mod.RaceScene3D),
  { ssr: false, loading: () => <p style={{ color: '#fff', padding: '2rem' }}>3D Hipodrom yükleniyor...</p> },
);

export default function RaceDemoPage() {
  const mockProps: any = {
    trackGeometry: {
      straightLengthMeters: 400,
      turnRadiusMeters: 63.66,
      lapLengthMeters: 1200,
    },
    cameraPose: {
      position: { x: 0, y: 40, z: 100 },
      lookAt: { x: 0, y: 0, z: 0 },
    },
    horses: [
      {
        horseId: 'h1',
        x: 10,
        z: 50,
        headingRadians: 0,
        coatColor: '#4a2c11',
        silkPattern: 'stripes',
      },
    ],
  };

  return (
    <main style={{ width: '100vw', height: 'calc(100vh - 65px)', background: '#0b1220', position: 'relative' }}>
      <RaceScene3D {...mockProps} />
    </main>
  );
}