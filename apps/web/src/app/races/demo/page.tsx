'use client';

/**
 * FAZ 6 demo yarış ekranı — `docs/GAME_DESIGN.md` §6'daki
 * `races/[raceId]/live/page.tsx` rotasının bir öncüsü.
 *
 * Gerçek backend wiring'i (NestJS `/races/{id}` endpoint'i) henüz
 * yapılmadığından (bkz. `docs/ROADMAP.md` — tüm fazlarda "wiring
 * bekliyor"), bu sayfa FAZ 5 Race Engine'in ÜRETTİĞİ gerçek bir
 * `RaceTimeline`'ı statik bir JSON fixture'dan okuyup `RaceViewer` ile
 * oynatır (bkz. `tools/generate-demo-race-timeline.ts`). Gerçek API
 * bağlandığında, bu sayfa sadece veri kaynağını (fixture → fetch)
 * değiştirecektir; `RaceViewer`/`RaceHud`/`RaceScene3D` aynı kalır.
 */

import type { RaceTimeline } from '@at-sevdalisi/shared-types';
import { RaceViewer } from '@/features/race-viewer/RaceViewer';
import demoRaceFixture from '@/features/race-viewer/fixtures/demo-race-timeline.json';

const fixture = demoRaceFixture as unknown as {
  horseNamesById: Record<string, string>;
  timeline: RaceTimeline;
};

export default function RaceDemoPage(): React.ReactElement {
  return (
    <main style={{ height: '100dvh', width: '100%' }}>
      <RaceViewer timeline={fixture.timeline} horseNamesById={fixture.horseNamesById} />
    </main>
  );
}
