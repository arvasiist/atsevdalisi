'use client';

import dynamic from 'next/dynamic';

const RaceScene3D = dynamic(
  () => import('../../../features/race-viewer/RaceScene3D').then((mod) => mod.RaceScene3D),
  { ssr: false, loading: () => <p style={{ color: '#fff', padding: '2rem' }}>3D Hipodrom yükleniyor...</p> },
);

const MOCK_TRACK_GEOMETRY = {
  totalDistanceM: 1200,
  straightLengthM: 400,
  turnRadiusM: 63.66,
  laneWidthM: 2.5,
  laneCount: 4,
};

const MOCK_CAMERA_POSE = {
  position: [0, 40, 100] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
};

const MOCK_HORSES = [
  {
    id: 'h1',
    name: 'Rüzgar Gülü',
    laneIndex: 0,
    progressDistanceM: 350,
    lateralOffsetM: 0,
    speedMps: 16.5,
    coatColor: '#4a2c11',
    silkPattern: 'stripes',
  },
  {
    id: 'h2',
    name: 'Poyraz',
    laneIndex: 1,
    progressDistanceM: 370,
    lateralOffsetM: 0,
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
        cameraPose={MOCK_CAMERA_POSE}
        trackGeometry={MOCK_TRACK_GEOMETRY}
      />
    </main>
  );
}