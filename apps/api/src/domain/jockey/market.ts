/**
 * KİRALIK JOKEY ARZI (14.10.2026) — brief §13; `docs/OYUN_DONGUSU_DENETIMI.md` B4.
 *
 * Eskiden jokey satırı yalnızca geliştirme seed'inde vardı: üretimde vitrin
 * boştu ve oyuncu "jokey seç" adımını hiç yapamıyordu. Bu modül saf
 * kuralları taşır (veritabanı ve framework yok):
 *  - `planJockeyMarketRefill` — vitrindeki jokeyleri KOMPOZİT beceriye göre
 *    bantlara sayar, her bandın eksiğini döner.
 *  - `createJockeyCandidate` — bir bant için yeni jokey üretir; kompozit
 *    HER ZAMAN o bantta kalır (yoksa sonraki sayım onu başka banda yazar ve
 *    vitrin her istekte şişerdi).
 *  - `jockeySalaryFor` — kiralama bedeli kompozitten türetilir: güçlü jokey
 *    pahalıdır, en düşük bant yeni oyuncunun bütçesine uyar.
 *
 * Rastgelelik DIŞARIDAN verilir (`random`): üretimde `crypto.randomInt`,
 * testte seed'li kaynak. Bu motor rastgeleliği DEĞİLDİR — pazara gelen
 * adayın kendisidir (personel adayıyla aynı gerekçe, CLAUDE.md kural 3).
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { JockeyConfig, JockeyMarketBand, JockeyMarketConfig } from '@at-sevdalisi/game-config';
import type { Jockey } from '@at-sevdalisi/shared-types';
import { calculateJockeySkillComposite } from './jockey';

/** `crypto.randomInt` imzası: `[minInclusive, maxExclusive)` tam sayı. */
export type MarketRandom = (minInclusive: number, maxExclusive: number) => number;

export type JockeySkillFields = Pick<
  Jockey,
  'startSkill' | 'tacticalSkill' | 'sprintSkill' | 'horseControl' | 'riskManagement' | 'trackKnowledge'
>;

/** Veritabanına yazılacak yeni (sahipsiz) jokey. */
export type JockeyCandidate = Pick<Jockey, 'id' | 'name' | 'experience' | 'salary'> & JockeySkillFields;

const SKILL_KEYS = [
  'startSkill',
  'tacticalSkill',
  'sprintSkill',
  'horseControl',
  'riskManagement',
  'trackKnowledge',
] as const satisfies ReadonlyArray<keyof JockeySkillFields>;

const MIN_SKILL = 0;
const MAX_SKILL = 100;

/** Kompozitin düştüğü bant (`[skillMin, skillMax)`); hiçbirine düşmüyorsa `null`. */
export function findMarketBand(
  composite: number,
  bands: readonly JockeyMarketBand[],
): JockeyMarketBand | null {
  return bands.find((band) => composite >= band.skillMin && composite < band.skillMax) ?? null;
}

export interface JockeyMarketShortfall {
  band: JockeyMarketBand;
  missing: number;
}

/** Her bantta `available` sayısına ulaşmak için üretilmesi gereken jokey sayısı. */
export function planJockeyMarketRefill(
  available: readonly JockeySkillFields[],
  config: JockeyConfig,
): JockeyMarketShortfall[] {
  const counts = new Map<JockeyMarketBand, number>();
  for (const jockey of available) {
    const band = findMarketBand(calculateJockeySkillComposite(jockey, config), config.market.bands);
    if (band !== null) counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return config.market.bands
    .map((band) => ({ band, missing: Math.max(0, band.available - (counts.get(band) ?? 0)) }))
    .filter((shortfall) => shortfall.missing > 0);
}

/** Kompozitin bantlar boyunca konumu: 0 = en düşük bandın tabanı, 1 = en yüksek bandın tavanı. */
function marketPosition(composite: number, market: JockeyMarketConfig): number {
  const floor = market.bands[0]!.skillMin;
  const ceiling = market.bands[market.bands.length - 1]!.skillMax;
  return clamp((composite - floor) / (ceiling - floor), 0, 1);
}

export function jockeySalaryFor(composite: number, market: JockeyMarketConfig): number {
  const { min, max, curve, roundTo } = market.salary;
  const raw = min + (max - min) * marketPosition(composite, market) ** curve;
  return Math.round(raw / roundTo) * roundTo;
}

function shiftSkills(skills: JockeySkillFields, delta: number): JockeySkillFields {
  const next = { ...skills };
  for (const key of SKILL_KEYS) next[key] += delta;
  return next;
}

function clampSkills(skills: JockeySkillFields): JockeySkillFields {
  const next = { ...skills };
  for (const key of SKILL_KEYS) next[key] = clamp(next[key], MIN_SKILL, MAX_SKILL);
  return next;
}

function uniformSkills(value: number): JockeySkillFields {
  const skills = {} as JockeySkillFields;
  for (const key of SKILL_KEYS) skills[key] = value;
  return skills;
}

export interface CreateJockeyCandidateInput {
  id: string;
  band: JockeyMarketBand;
  random: MarketRandom;
}

/**
 * Bant için yeni jokey. Beceriler bant tabanının ± `skillSpread` çevresinde
 * tam sayıdır (her jokeyin güçlü/zayıf yanı olsun diye); kompozit banttan
 * taşarsa altı beceri BİRLİKTE kaydırılır (ağırlık toplamı 1 olduğu için
 * kompozit de aynı kadar kayar). Sınırda kırpma yüzünden yine taşarsa
 * düzgün becerilere (hepsi = taban) düşer — kompozit tam tabandır.
 */
export function createJockeyCandidate(input: CreateJockeyCandidateInput, config: JockeyConfig): JockeyCandidate {
  const { band, random } = input;
  const { skillSpread, firstNames, lastNames } = config.market;
  const base = random(band.skillMin, band.skillMax);
  let skills = uniformSkills(base);
  for (const key of SKILL_KEYS) skills[key] = base + random(-skillSpread, skillSpread + 1);

  const maxShift = skillSpread * 2 + 2;
  for (let step = 0; step < maxShift && calculateJockeySkillComposite(skills, config) < band.skillMin; step += 1) {
    skills = shiftSkills(skills, 1);
  }
  for (let step = 0; step < maxShift && calculateJockeySkillComposite(skills, config) >= band.skillMax; step += 1) {
    skills = shiftSkills(skills, -1);
  }
  skills = clampSkills(skills);
  if (findMarketBand(calculateJockeySkillComposite(skills, config), [band]) === null) {
    skills = uniformSkills(base);
  }

  const composite = calculateJockeySkillComposite(skills, config);
  const name = `${firstNames[random(0, firstNames.length)]} ${lastNames[random(0, lastNames.length)]}`;
  return {
    id: input.id,
    name,
    experience: Math.round(marketPosition(composite, config.market) * config.experienceForMaxScore),
    salary: jockeySalaryFor(composite, config.market),
    ...skills,
  };
}

/** API açılışında koşar — bozuk pazar config'iyle API AÇILMAZ. */
export function validateJockeyMarketConfig(market: JockeyMarketConfig): string[] {
  const problems: string[] = [];
  const { bands, skillSpread, salary } = market;
  if (!(Number.isInteger(skillSpread) && skillSpread >= 0)) problems.push('skillSpread ≥ 0 tam sayı olmalı.');
  if (bands.length === 0) problems.push('En az bir beceri bandı olmalı.');
  bands.forEach((band, index) => {
    const label = `bands[${index}]`;
    if (!(Number.isInteger(band.skillMin) && Number.isInteger(band.skillMax) && band.skillMin < band.skillMax)) {
      problems.push(`${label}: skillMin < skillMax tam sayılar olmalı.`);
    }
    if (!(band.skillMin - skillSpread >= MIN_SKILL && band.skillMax + skillSpread <= MAX_SKILL)) {
      problems.push(`${label}: bant ± skillSpread 0..100 içinde kalmalı.`);
    }
    if (!(Number.isInteger(band.available) && band.available >= 0)) problems.push(`${label}: available ≥ 0 tam sayı olmalı.`);
    const previous = bands[index - 1];
    if (previous && band.skillMin < previous.skillMax) problems.push(`${label}: bantlar artan ve çakışmasız olmalı.`);
  });
  if (!(Number.isInteger(salary.roundTo) && salary.roundTo >= 1)) problems.push('salary.roundTo ≥ 1 tam sayı olmalı.');
  if (!(salary.min >= 0 && salary.max >= salary.min)) problems.push('salary: 0 ≤ min ≤ max olmalı.');
  if (!(salary.curve > 0)) problems.push('salary.curve > 0 olmalı.');
  if (market.firstNames.length === 0 || market.lastNames.length === 0) problems.push('Ad ve soyad listeleri boş olamaz.');
  return problems;
}
