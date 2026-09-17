'use client';

import dynamic from 'next/dynamic';
import demoRaceFixture from '../../../features/race-viewer/fixtures/demo-race-timeline.json';
import type { RaceTimeline } from '@at-sevdalisi/shared-types';

const RaceViewer = dynamic(
  () => import('../../../features/race-viewer/RaceViewer').then((mod) => mod.RaceViewer),
  { ssr: false, loading: () => <p style={{ color: '#fff', padding: '2rem' }}>3D Hipodrom yükleniyor...</p> },
);

/**
 * `/races/demo` — gerçek `RaceViewer` orkestratörünü, Race Engine'in
 * ürettiği gerçek bir `RaceTimeline` sabit verisiyle (fixture) mount eder.
 *
 * Daha önce bu sayfa `mockProps: any` ile `RaceScene3D`'yi çıplak render
 * ediyordu — bu hem `HorseVisual` arayüzüyle uyuşmayan sahte alanlar
 * (`coatColor`/`silkPattern`) içeriyordu hem de `RaceViewer`'ın oynatma/HUD/
 * skorbord/minimap mantığını tamamen atlıyordu. Bu, projede `RaceViewer`'ın
 * hiçbir sayfada mount edilmediği anlamına geliyordu (bkz. Faz 1 planı).
 */
export default function RaceDemoPage(): React.ReactElement {
  const { timeline, horseNamesById } = demoRaceFixture as unknown as {
    timeline: RaceTimeline;
    horseNamesById: Record<string, string>;
  };

  return (
    // Faz 2: yükseklik artık TopBar'ın piksel cinsinden TAHMİN EDİLMİŞ bir
    // sabitiyle değil, `globals.css`teki `.app-main` flex kabuğunun (bkz.
    // `app/layout.tsx`) doldurduğu GERÇEK kalan alanla belirlenir.
    <main style={{ width: '100%', height: '100%', background: '#0b1220', position: 'relative' }}>
      <RaceViewer timeline={timeline} horseNamesById={horseNamesById} />
    </main>
  );
}
