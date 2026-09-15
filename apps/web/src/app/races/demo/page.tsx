'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

const RaceScene3D = dynamic(
  () => import('../../../features/race-viewer/RaceScene3D').then((mod) => mod.RaceScene3D),
  { ssr: false, loading: () => <p style={{ color: '#fff', padding: '2rem' }}>3D Hipodrom yükleniyor...</p> },
);

type RaceSceneProps = ComponentProps<typeof RaceScene3D>;

const MOCK_TRACK: RaceSceneProps['trackGeometry'] = {
  straightLengthMeters: 400,
  turnRadiusMeters: 63.66,
  lapLengthMeters: 1200,
};

const MOCK_CAMERA: RaceSceneProps['cameraPose'] = {
  position: { x: 0, y: 40, z: 100 },
  lookAt: { x: 0, y: 0, z: 0 },
};

const MOCK_HORSES: RaceSceneProps['horses'] = [
  {
    horseId: 'h1',
    x: 10,
    z: 50,
    headingRadians: 0,
    speedMps: 16.5,
    coatColor: '#4a2c11',
    silkPattern: 'stripes',
  },
  {
    horseId: 'h2',
    x: 15,
    z: 52,
    headingRadians: 0,
    speedMps: 17.0,
    coatColor: '#1a1a1a',
    silkPattern: 'solid',
  },
];

export default function RaceDemoPage() {
  return (
    <main style={{ width: '100vw', height: 'calc(100vh - 65px)', background: '#0b1220', position: 'relative' }}>
      <RaceScene3D
        horses={MOCK_HORSES}
        cameraPose={MOCK_CAMERA}
        trackGeometry={MOCK_TRACK}
      />
    </main>
  );
}