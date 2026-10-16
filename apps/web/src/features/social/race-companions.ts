import type { RaceCompanionView } from '@at-sevdalisi/shared-types';

/**
 * "Birlikte yarıştıkların" satırının durumu (08.10.2026). Arkadaşlık yalnızca
 * bitmiş bir yarışta birlikte koşulan oyuncularla kurulur — kural SUNUCUDADIR
 * (`FRIENDSHIP_REQUIRES_SHARED_RACE`); bu modül yalnızca ekranda ne
 * gösterileceğini söyler (saf, DOM'suz test).
 */
export interface CompanionAction {
  /** `true` ise "Arkadaş Ekle" düğmesi gösterilir. */
  canRequest: boolean;
  label: string;
}

const ACTIONS: Record<RaceCompanionView['relation'], CompanionAction> = {
  none: { canRequest: true, label: 'Arkadaş Ekle' },
  outgoing: { canRequest: false, label: 'İstek gönderildi' },
  incoming: { canRequest: false, label: 'Sana istek gönderdi — yukarıdan yanıtla' },
  friend: { canRequest: false, label: 'Arkadaşın' },
};

export function companionAction(relation: RaceCompanionView['relation']): CompanionAction {
  return ACTIONS[relation];
}

export function describeSharedRaces(sharedRaces: number): string {
  return sharedRaces === 1 ? '1 ortak yarış' : `${sharedRaces} ortak yarış`;
}
