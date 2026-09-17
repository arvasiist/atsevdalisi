import type { Horse } from '@at-sevdalisi/shared-types';

/**
 * `HorseRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). Bkz. `application/ports/player.repository.ts` ile
 * AYNI desen (docs/ARCHITECTURE.md §4).
 */
export interface HorseRepository {
  findById(id: string): Promise<Horse | null>;
  findByOwnerId(ownerId: string): Promise<Horse[]>;
  /** Yeni bir at kaydı ekler (ve ona eşlik eden `horse_stats` satırını, bkz. postgres implementasyonu). */
  save(horse: Horse): Promise<void>;
  /**
   * FAZ 1 wiring, dördüncü dilim — var olan bir atın DEĞİŞKEN alanlarını
   * (health/fitness/fatigue/energy/morale/weightKg/status/level/xp) günceller.
   * İlk kullanım: `TrainHorseUseCase` (antrenman sonrası fatigue/status).
   *
   * AUDIT_REPORT.md Bulgu C2 (Medium) — bu metod (kilitSİZ okuma +
   * ayrı yazma) `TrainHorseUseCase`/`PerformCareActionUseCase`/
   * `FeedHorseUseCase`'İN ARTIK KULLANMADIĞI, kilitsiz eski yol — bkz.
   * `updateWithLock` (aşağıda). Diğer çağıranlar (`BuyMarketListingUseCase`
   * ÜZERİNDEN `MarketPurchaseRepository`, mülkiyet devri gibi TEK seferlik/
   * kilitli bir transaction İÇİNDEN çağrılan yerler) için hâlâ geçerlidir.
   */
  update(horse: Horse): Promise<void>;
  /**
   * AUDIT_REPORT.md Bulgu C2 (Medium — "training/care/feeding use-case'leri
   * FOR UPDATE satır kilidi kullanmıyor, eşzamanlı isteklerde lost update
   * riski var") hardening'i (bu oturum). `PlayerRepository.updateWithLock`
   * ile AYNI desen (bkz. o metodun doc yorumu, `docs/SECURITY.md` §5):
   * `SELECT ... FOR UPDATE` ile satırı kilitler, `mutate`'i KİLİTLİ/GÜNCEL
   * veriyle çağırır, sonra TEK transaction içinde `UPDATE` yazar — iki
   * eşzamanlı istek (ör. aynı ata art arda iki antrenman) artık birbirinin
   * fatigue/health/status yazımını SESSİZCE EZEMEZ (ikinci istek, birincinin
   * COMMIT'İNDEN SONRAKİ güncel değeri görür).
   *
   * KAPSAM NOTU (dürüstlük): bu yalnızca `horses` tablosunun satırını
   * kilitler — `horse_stats` (zaten atomik `SET x = x + delta` DEĞİL, tam
   * değer YAZAR ama tek sütun) ve `horse_health` (Bakım/Besleme'nin ayrıca
   * yazdığı) BU KİLİDİN KAPSAMI DIŞINDADIR (`application` katmanının `pg`
   * `PoolClient`'ı BİLMEMESİ gerektiği mimari kuralı nedeniyle transaction
   * client'ı bu port'un imzasına SIZDIRILMAZ). Bu, ANA/en sık rastlanan
   * race senaryosunu (aynı oyuncu, aynı at, iki hızlı ardışık istek —
   * ör. çift tıklama/iki sekme) tamamen kapatır; `horse_health`'in KENDİ,
   * daha küçük kapsamlı bir benzer riski hâlâ vardır ve ayrı bir takip
   * maddesi olarak bırakılmıştır (bkz. `perform-care-action.use-case.ts`/
   * `feed-horse.use-case.ts` doc yorumları).
   */
  updateWithLock<T>(id: string, mutate: (horse: Horse) => { horse: Horse; result: T }): Promise<T | null>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const HORSE_REPOSITORY = Symbol('HORSE_REPOSITORY');
