import { createSeededRandom, seededRange } from '@at-sevdalisi/shared-types';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { NEUTRAL_UNMODELED_TRAIT_SCORE } from './entrant-snapshot';
import { RACING_STYLES } from './validation';

/** Bot statlarının düşeceği aralık — ortalama bir oyuncu atıyla (statlar genelde ~50 civarı başlar) rekabetçi ama ezici olmayan bir bant. */
const BOT_STAT_RANGE: [number, number] = [45, 75];
const BOT_MORALE = 60;
const BOT_HEALTH = 100;
const BOT_FATIGUE = 0;

/**
 * FAZ 1 wiring, sekizinci dilim — Pratik Yarış (brief §6 Race Engine).
 * Gerçek çok oyunculu eşleştirme (FAZ 7) henüz wiring edilmediğinden, bir
 * oyuncunun atını rekabetçi bir ortamda test edebilmesi için sabit
 * sayıda, DETERMİNİSTİK (aynı `seedBase` → aynı bot statları, Race
 * Engine'in kendisiyle AYNI "asla `Math.random()` kullanma" ilkesi,
 * bkz. `race-engine.ts` üstündeki doc yorumu) yapay zeka rakip üretilir.
 *
 * Botlar `horses` tablosuna KAYDEDİLMEZ (kapsam dışı — bkz.
 * `RunPracticeRaceUseCase` üstündeki not); `horseId` alanları yalnızca
 * simülasyon içi tekil birer etiket olarak kullanılır.
 */
export function generateBotEntrants(count: number, seedBase: string): RaceEntrantSnapshot[] {
  const bots: RaceEntrantSnapshot[] = [];

  for (let index = 0; index < count; index += 1) {
    const botId = `bot-${index + 1}`;
    const speedRng = createSeededRandom(`${seedBase}:${botId}:speed`);
    const staminaRng = createSeededRandom(`${seedBase}:${botId}:stamina`);
    const accelerationRng = createSeededRandom(`${seedBase}:${botId}:acceleration`);
    const fitnessRng = createSeededRandom(`${seedBase}:${botId}:fitness`);
    const styleRng = createSeededRandom(`${seedBase}:${botId}:style`);

    const styleIndex = Math.floor(seededRange(styleRng, 0, RACING_STYLES.length));

    bots.push({
      horseId: botId,
      speed: seededRange(speedRng, BOT_STAT_RANGE[0], BOT_STAT_RANGE[1]),
      stamina: seededRange(staminaRng, BOT_STAT_RANGE[0], BOT_STAT_RANGE[1]),
      acceleration: seededRange(accelerationRng, BOT_STAT_RANGE[0], BOT_STAT_RANGE[1]),
      fitness: seededRange(fitnessRng, BOT_STAT_RANGE[0], BOT_STAT_RANGE[1]),
      fatigue: BOT_FATIGUE,
      health: BOT_HEALTH,
      morale: BOT_MORALE,
      surfaceCompatibility: NEUTRAL_UNMODELED_TRAIT_SCORE,
      distanceCompatibility: NEUTRAL_UNMODELED_TRAIT_SCORE,
      jockeySkillComposite: NEUTRAL_UNMODELED_TRAIT_SCORE,
      // R4 — Carried Weight (bu turda EKLENDİ). Botların `horses` tablosunda
      // bir satırı (dolayısıyla bir `weightKg`'si) olmadığından, `computeWeightCompatibility(null)`
      // ile AYNI sonucu veren nötr sabit doğrudan kullanılır (surface/
      // distanceCompatibility ile AYNI desen).
      weightCompatibility: NEUTRAL_UNMODELED_TRAIT_SCORE,
      form: NEUTRAL_UNMODELED_TRAIT_SCORE,
      tactic: {
        racingStyle: RACING_STYLES[styleIndex] ?? 'mid_pack',
        riskLevel: 'normal',
        startApproach: 'balanced',
        finalStretchPlan: 'normal',
      },
    });
  }

  return bots;
}
