/** 16.10.2026 (brief §10) — yarışın masası/pisti oyuncunun kariyer kademesinin üstünde (409). */
export class CareerTierLockedError extends Error {
  constructor(
    readonly requiredTier: string,
    readonly requiredTierName: string,
    readonly pointsToRequired: number,
  ) {
    super(`Bu yarış için "${requiredTierName}" kariyer kademesi gerekir — ${pointsToRequired} kariyer puanı daha kazan.`);
    this.name = 'CareerTierLockedError';
  }
}
