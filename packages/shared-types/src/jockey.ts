import type { ISODateTimeString, UUID } from './common';

/** brief §7 Jockey, §13 */
export interface Jockey {
  id: UUID;
  name: string;
  experience: number;
  startSkill: number;
  tacticalSkill: number;
  sprintSkill: number;
  horseControl: number;
  riskManagement: number;
  trackKnowledge: number;
  salary: number;
  ownerId: UUID | null; // null = NPC/sistem jokeyi
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
