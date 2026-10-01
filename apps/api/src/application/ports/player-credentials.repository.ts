/**
 * `player_credentials` portu (30.09.2026, migration 0046).
 */
export interface PlayerCredentialsRepository {
  /** E-posta (normalleştirilmiş) ile — giriş yolu. */
  findByEmail(email: string): Promise<{ playerId: string; passwordHash: string } | null>;
  /** Oyuncunun kayıtlı e-postası; yoksa `null` (misafir). */
  findEmailByPlayerId(playerId: string): Promise<string | null>;
  /**
   * Oyuncuya e-posta + şifre bağlar. Oyuncunun zaten kaydı varsa
   * `CredentialsAlreadySetError`, e-posta başkasındaysa
   * `EmailAlreadyRegisteredError` fırlatır — ikisi de VERİTABANI kısıtıyla
   * (PK + `lower(email)` tekil indeksi) zorlanır, ön kontrol yalnızca
   * kolaylıktır.
   */
  create(input: { playerId: string; email: string; passwordHash: string }): Promise<void>;
}

export const PLAYER_CREDENTIALS_REPOSITORY = Symbol('PLAYER_CREDENTIALS_REPOSITORY');
