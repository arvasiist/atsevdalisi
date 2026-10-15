import type { RaceCalendarProgram, RaceLobbyConfig } from '@at-sevdalisi/game-config';

/**
 * YARIŞ BAŞINA SAHA KURALI (15.10.2026, Aşama 3) — "oyuncu sayısı yetersiz
 * olduğunda ne olur" sorusunun TEK cevabı.
 *
 * - `minRealPlayers`: kilit anında (hazır olmayanlar iade edilip düştükten
 *   sonra) en az bu kadar gerçek oyuncu kalmazsa yarış İPTAL edilir ve kalan
 *   herkese giriş ücreti defterden okunan tutarla iade edilir (bildirimle).
 * - `aiFill`: boş koltuklar yapay zekâ atlarıyla doldurulur mu. Yalnızca kural
 *   izin verirse bot koşar; global `aiFillEnabled` bir acil kapatma düğmesidir.
 *
 * Kural yarış AÇILIRKEN yarış satırına yazılır (`races.min_real_players`,
 * `races.ai_fill`, migration 0085): sonradan config değişse de açık yarışların
 * kuralı değişmez. Turnuva finali kendi kuralını kullanır (botsuz,
 * `online.tournament.minParticipants`).
 *
 * NEDEN ÜCRETLİDE 2: lobi havuzu yalnızca gerçek oyuncuların ücretinden oluşur
 * ve bota düşen ödül yanar. Tek gerçek oyuncu birinci gelse bile havuzun
 * yalnızca birincilik payını (top5: %37,5) alır — ücretini ASLA geri alamaz.
 * Böyle bir yarışı koşmak oyuncudan güvenceli para almak olurdu.
 */
export interface RaceFieldRule {
  minRealPlayers: number;
  aiFill: boolean;
}

type FieldRulesConfig = RaceLobbyConfig['fieldRules'];

/** Ücrete göre varsayılan kural; `aiFill: false` (botsuz) en az `botlessMinRealPlayers` ister. */
export function defaultFieldRule(entryFee: number, aiFill: boolean, config: FieldRulesConfig): RaceFieldRule {
  const base = entryFee > 0 ? config.paidMinRealPlayers : config.freeMinRealPlayers;
  return { minRealPlayers: aiFill ? base : Math.max(base, config.botlessMinRealPlayers), aiFill };
}

/** Takvim programı: kendi kuralı verilmişse o (eksik alanlar varsayılandan), yoksa varsayılan. */
export function calendarFieldRule(program: RaceCalendarProgram, config: FieldRulesConfig): RaceFieldRule {
  const aiFill = program.fieldRule?.aiFill ?? true;
  const fallback = defaultFieldRule(program.entryFee, aiFill, config);
  return { minRealPlayers: program.fieldRule?.minRealPlayers ?? fallback.minRealPlayers, aiFill };
}

/**
 * Kilit/kesinleşme anında uygulanacak kural: botlar yalnızca yarışın kuralı
 * VE global kapatma düğmesi izin verirse koşar.
 */
export function effectiveAiFill(rule: RaceFieldRule, globalAiFillEnabled: boolean): boolean {
  return rule.aiFill && globalAiFillEnabled;
}

/** API açılışında koşar. */
export function validateFieldRulesConfig(lobby: RaceLobbyConfig, programs: readonly RaceCalendarProgram[]): string[] {
  const problems: string[] = [];
  const rules = lobby.fieldRules;
  const isPositiveInt = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 1;
  if (!rules || ![rules.paidMinRealPlayers, rules.freeMinRealPlayers, rules.botlessMinRealPlayers].every(isPositiveInt)) {
    problems.push('fieldRules: paidMinRealPlayers, freeMinRealPlayers ve botlessMinRealPlayers ≥ 1 tam sayı olmalı.');
    return problems;
  }
  if (rules.botlessMinRealPlayers < 2) {
    problems.push('fieldRules.botlessMinRealPlayers ≥ 2 olmalı (botsuz tek atlık yarış yarış değildir).');
  }
  const smallestField = Math.min(...lobby.fieldSizes);
  for (const value of [rules.paidMinRealPlayers, rules.freeMinRealPlayers, rules.botlessMinRealPlayers]) {
    if (value > smallestField) {
      problems.push(`fieldRules: ${value} gerçek oyuncu en küçük sahaya (${smallestField}) sığmaz.`);
    }
  }
  for (const program of programs) {
    const rule = calendarFieldRule(program, rules);
    if (!isPositiveInt(rule.minRealPlayers) || rule.minRealPlayers > program.maxPlayers) {
      problems.push(`Takvim programı ${program.id}: minRealPlayers 1..maxPlayers olmalı.`);
    }
    if (!rule.aiFill && rule.minRealPlayers < 2) {
      problems.push(`Takvim programı ${program.id}: botsuz programın minRealPlayers'ı ≥ 2 olmalı.`);
    }
  }
  return problems;
}
