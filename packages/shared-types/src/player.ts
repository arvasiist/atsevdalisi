import type { ISODateTimeString, UUID } from './common';

/** brief §7 Player */
export interface Player {
  id: UUID;
  username: string;
  displayName: string;
  avatarId: string | null;
  level: number; // 1-50, bkz. brief §36
  xp: number;
  money: number;
  gems: number;
  reputation: number;
  /**
   * Ahır seviyesi (brief §32). `database/migrations/
   * 0012_create_staff_and_stable_level.up.sql` — her oyuncunun TEK bir
   * ahırı vardır (ayrı bir `stables` tablosu yok), bu yüzden seviye
   * doğrudan `players` üzerinde tutulur (bkz. `domain/stable/stable.ts`).
   */
  stableLevel: number;
  /**
   * FAZ 1 wiring, yedinci dilim — Günlük Ödül (brief §37). `null` = hiç
   * talep edilmemiş. `stableLevel` ile AYNI gerekçeyle doğrudan `Player`
   * üzerinde tutulur (gizli/dar bir görünüm gerektiren `horse_health`
   * alanlarının AKSİNE, bu basit bir bookkeeping alanıdır).
   */
  lastDailyRewardClaimedAt: ISODateTimeString | null;
  /**
   * FAZ 1 wiring, on dördüncü dilim (bu oturum) — brief §43 "Elo benzeri
   * sistem PvP için ayrıca uygulanabilir" (bkz. `domain/online/elo.ts`).
   * `stableLevel`/`lastDailyRewardClaimedAt` ile AYNI gerekçeyle doğrudan
   * `Player` üzerinde tutulur (ayrı bir `PlayerRating` tablosu/aggregate'i
   * YOK — `packages/shared-types/src/online.ts`'teki `PlayerRating`
   * arayüzü FAZ 7'den beri TASLAKTA duruyordu ama hiç kullanılmadı; bu
   * dilim onun yerine `Player.rating`'i tercih etti, çünkü `matchesPlayed`
   * alanı henüz hiçbir yerde tüketilmiyor ve tek-alanlı bir genişletme
   * daha az mimari karmaşıklık taşıyor — bkz. `domain/online/README.md`).
   * Yeni oyuncular `config/online.config.json` → `elo.initialRating` ile
   * başlar (bkz. `domain/player/player.ts` `createNewPlayer`).
   */
  rating: number;
  /**
   * brief §34 yönetim rolü — `players.is_admin` (migration 0041).
   *
   * **BU ALAN BİR YETKİ KAPISI DEĞİLDİR ve olamaz.** Sunucu her istekte
   * `players.is_admin`i VERİTABANINDAN yeniden okur; rol token'a gömülmez,
   * böylece yetki iptali anında etki eder (§13.17). Buradaki değer
   * yalnızca istemcinin "yönetim bağlantısını göstereyim mi" sorusunu
   * yanıtlar; kararı sunucu verir ve yönetici olmayan çağıran 403
   * `ADMIN_REQUIRED` alır. `PlayerSummary`de durması güvenlidir çünkü bu
   * tip HİÇBİR ZAMAN başka bir oyuncu için üretilmez (`GET /players/:id`
   * `assertSelf` ile korunur) — yani kişi yalnızca KENDİ bayrağını görür.
   */
  isAdmin: boolean;
  /** 02.10.2026 (Faz 10, migration 0060) — moderatör mü. Yetki kapısı DEĞİLDİR (bkz. `isAdmin`). */
  isModerator: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/** brief §38 Ana Sayfa "Oyuncu" kartı için minimal görünüm. */
/**
 * Oyuncunun KENDİ özeti — `GET /players/:id` (`assertSelf` ile korunur),
 * `POST /players` ve `POST /auth/login` bunu döner. Yani bu tip HİÇBİR
 * ZAMAN başka bir oyuncu için üretilmez; `money`/`gems` taşıması bu
 * yüzdendir (herkese açık profil için bkz. `PlayerProfileView` — o tip
 * bakiyeyi BİLİNÇLİ olarak taşımaz, AUDIT Bulgu S4).
 *
 * **`username` NEDEN EKLENDİ (28.09.2026):** `/profile/:username` ekranı
 * (brief §24) yalnızca kullanıcı adıyla açılır ve bu, oyuncunun KENDİ
 * profiline giden tek keşif yoludur — `nav-links.ts`'teki statik listeye
 * giremez (DİNAMİK rota), yani bağlantıyı üretecek yer üst barın oyuncu
 * bloğudur ve orada yalnızca `PlayerSummary` vardır. `username` gizli
 * DEĞİLDİR: profilin URL'sidir, `GET /players/profile/:username` ile
 * herkese açıktır ve sohbet mesajlarında zaten görünür.
 *
 * **`isAdmin` NEDEN EKLENDİ (28.09.2026, yönetim paneli dilimi):** panel
 * `/admin` rotasında yaşar ve bu rota `nav-links.ts`'e GİREMEZ — oradaki
 * liste her oyuncuya çizilir, yani yönetici olmayan herkes 403 alan bir
 * bağlantı görürdü. Bağlantıyı üst barda koşullu çizmek için istemcinin
 * KENDİ bayrağını bilmesi gerekir; bu tipin "hiçbir zaman başkası için
 * üretilmez" sözleşmesi bunu güvenli kılar. **Sunucudaki kapı DEĞİŞMEZ:**
 * bağlantıyı gizlemek yetki vermez, göstermek de vermez.
 */
export type PlayerSummary = Pick<
  Player,
  'id' | 'username' | 'displayName' | 'avatarId' | 'level' | 'xp' | 'money' | 'gems' | 'isAdmin' | 'isModerator'
>;

/**
 * AUDIT_REPORT.md Bulgu S1 hardening (bu oturum) — brief §41/§50 Google/Apple
 * Sign-In. `POST /players` (kayıt) VE `POST /auth/login` (mevcut hesapla
 * giriş) artık İKİSİ de bunu döner: istemci, sonraki HER isteğe
 * `Authorization: Bearer <token>` header'ı eklemek ZORUNDADIR (`AuthGuard`
 * ile korunan rotalar için — bkz. `apps/api/src/api/auth/auth.guard.ts`).
 * `token` bizim KENDİ imzaladığımız bir JWT'dir (Google/Apple'ın ID
 * token'ı DEĞİL) — sağlayıcı token'ı yalnızca `/auth/login` isteğinde BİR
 * KEZ kullanılır, saklanmaz.
 */
export interface AuthSession extends SessionTokens {
  player: PlayerSummary;
}

/**
 * 02.10.2026 — OTURUM (migration 0057). `token` kısa ömürlü erişim JWT'sidir
 * (`auth.session.accessTokenTtlSeconds`); `refreshToken` HER yenilemede
 * DEĞİŞİR ve eskisi bir daha kullanılırsa oturum kapatılır (çalıntı tespiti).
 * Sunucu refresh token'ın yalnızca SHA-256 özetini saklar.
 */
export interface SessionTokens {
  token: string;
  refreshToken: string;
  /** ISO — erişim token'ının bitişi; istemci bundan önce yeniler. */
  accessTokenExpiresAt: string;
}

/** `GET /auth/sessions` satırı — aktif oturumlar (cihazlar). */
export interface AuthSessionInfo {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  /** Bu isteği yapan oturum mu. */
  current: boolean;
}

/**
 * 30.09.2026 — oyuncunun giriş bilgisi durumu (`GET /auth/credentials`).
 * `email: null` = misafir hesap: yalnızca bu tarayıcıda yaşar, "Hesabını
 * kaydet" ile kalıcı hâle getirilmelidir.
 */
export interface AccountCredentialsView {
  email: string | null;
  /** 02.10.2026 (migration 0058) — kayıtlı e-posta doğrulandı mı; e-posta yoksa `false`. */
  emailVerified: boolean;
  /**
   * 01.10.2026 — hesaba bağlı dış giriş sağlayıcıları (`POST /auth/link`).
   * E-postası olmayan ama Google bağlı bir hesap da kalıcıdır; "misafir" =
   * `email === null && linkedProviders.length === 0`.
   */
  linkedProviders: AccountProvider[];
}

/** Dış giriş sağlayıcısı (`player_auth_providers.provider` CHECK'i ile aynı küme). */
export type AccountProvider = 'google' | 'apple';

/**
 * 01.10.2026 — `GET /auth/providers` (`@Public`). Web, Google düğmesini
 * YALNIZCA `googleClientId` doluysa gösterir; kimlik bilgisi yapılandırılmamış
 * bir sunucuda hiç çalışmayacak bir düğme göstermek yalan olurdu. İstemci
 * kimliği gizli değildir (Google onu tarayıcıya zaten verir).
 */
export interface AuthProvidersView {
  googleClientId: string | null;
}

/** 02.10.2026 — `GET /account/deletion` (migration 0059): hesap silinebilir mi. */
export interface AccountDeletionCheck {
  /** Boşsa silinebilir; doluysa önce bitirilmesi gerekenler. */
  blockers: { code: string; label: string }[];
  /** E-postalı hesapta onay için şifre istenir. */
  requiresPassword: boolean;
}

/**
 * KİŞİSEL VERİ DIŞA AKTARMA (02.10.2026, KVKK md. 11 / GDPR md. 15, 20).
 * Her bölüm oyuncunun KENDİ verisidir; parola özeti, token özeti, başkasının
 * iç kimliği ya da yaptırımı veren yöneticinin kimliği GİRMEZ. Bölüm
 * `maxRowsPerSection`ı aşarsa en yeni satırlar verilir ve `truncated: true`.
 */
export interface AccountExportSection {
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
}

export const ACCOUNT_EXPORT_SECTIONS = [
  'account',
  'loginMethods',
  'sessions',
  'horses',
  'transactions',
  'raceEntries',
  'messages',
  'friendships',
  'blocks',
  'reportsFiled',
  'gifts',
  'notifications',
  'club',
  'sanctions',
  'questClaims',
] as const;

export type AccountExportSectionName = (typeof ACCOUNT_EXPORT_SECTIONS)[number];

export interface AccountDataExport {
  exportedAt: string;
  playerId: string;
  sections: Record<AccountExportSectionName, AccountExportSection>;
}
