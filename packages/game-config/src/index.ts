/**
 * Tip güvenli config loader. Brief §52: "Hard-coded değerlerden kaçınılmalıdır."
 *
 * Bu paket, config/*.config.json dosyalarını derleme zamanında import eder
 * (resolveJsonModule sayesinde), böylece:
 *  - Yanlış bir anahtar adı derleme zamanında hata verir (fs.readFile + JSON.parse'ın
 *    aksine, o yöntemde tip güvenliği çalışma zamanına kadar sağlanamazdı).
 *  - Hem apps/api (Node.js) hem apps/web (tarayıcı/edge) tarafında sorunsuz çalışır;
 *    hiçbir dosya sistemi erişimi gerekmez.
 *
 * NOT: Bu, config değerlerinin "derleme zamanında sabitlendiği" anlamına gelmez —
 * production'da config değerleri değiştirilmek istendiğinde, ilgili JSON dosyası
 * güncellenip servis yeniden build/deploy edilir. Çalışma zamanında (build'siz)
 * değiştirilebilir bir "balance tool" (brief §82) istenirse, ileride bu loader'ın
 * arkasına bir Redis/DB tabanlı override katmanı eklenebilir — dışa açılan
 * fonksiyon imzaları (loadRaceConfig() vb.) aynı kalacağı için bu, çağıran kodu
 * etkilemeyen bir iç değişiklik olur.
 */
import type {
  AuthConfig,
  AdminConfig,
  AudioConfig,
  CameraConfig,
  CareConfig,
  EconomyConfig,
  FarmConfig,
  GeneticsConfig,
  GiftConfig,
  ChatConfig,
  GrandstandConfig,
  HorseGrowthConfig,
  JockeyConfig,
  OnlineConfig,
  ProgressionConfig,
  RaceBalanceConfig,
  RaceLobbyConfig,
  SocialConfig,
  StableConfig,
  StaffConfig,
  HorseAppearanceConfig,
  HorsePresenceConfig,
  AtmosphereConfig,
  LightingConfig,
  PerformanceConfig,
  InteractiveRaceConfig,
  TrainingConfig,
  VfxConfig,
  WeatherConfig,
} from './types';

import raceConfigJson from '../../../config/race.config.json';
import trainingConfigJson from '../../../config/training.config.json';
import economyConfigJson from '../../../config/economy.config.json';
import geneticsConfigJson from '../../../config/genetics.config.json';
import weatherConfigJson from '../../../config/weather.config.json';
import horseGrowthConfigJson from '../../../config/horse-growth.config.json';
import progressionConfigJson from '../../../config/progression.config.json';
import careConfigJson from '../../../config/care.config.json';
import stableConfigJson from '../../../config/stable.config.json';
import jockeyConfigJson from '../../../config/jockey.config.json';
import staffConfigJson from '../../../config/staff.config.json';
import horseAppearanceConfigJson from '../../../config/horse-appearance.config.json';
import horsePresenceConfigJson from '../../../config/horse-presence.config.json';
import atmosphereConfigJson from '../../../config/atmosphere.config.json';
import lightingConfigJson from '../../../config/lighting.config.json';
import performanceConfigJson from '../../../config/performance.config.json';
import interactiveRaceConfigJson from '../../../config/interactive-race.config.json';
import farmConfigJson from '../../../config/farm.config.json';
import onlineConfigJson from '../../../config/online.config.json';
import cameraConfigJson from '../../../config/camera.config.json';
import vfxConfigJson from '../../../config/vfx.config.json';
import audioConfigJson from '../../../config/audio.config.json';
import grandstandConfigJson from '../../../config/grandstand.config.json';
import socialConfigJson from '../../../config/social.config.json';
import giftConfigJson from '../../../config/gift.config.json';
import chatConfigJson from '../../../config/chat.config.json';
import raceLobbyConfigJson from '../../../config/race-lobby.config.json';
import adminConfigJson from '../../../config/admin.config.json';
import authConfigJson from '../../../config/auth.config.json';

export function loadRaceConfig(): RaceBalanceConfig {
  return raceConfigJson as unknown as RaceBalanceConfig;
}

export function loadTrainingConfig(): TrainingConfig {
  return trainingConfigJson as unknown as TrainingConfig;
}

export function loadEconomyConfig(): EconomyConfig {
  return economyConfigJson as unknown as EconomyConfig;
}

export function loadGeneticsConfig(): GeneticsConfig {
  return geneticsConfigJson as unknown as GeneticsConfig;
}

export function loadWeatherConfig(): WeatherConfig {
  return weatherConfigJson as unknown as WeatherConfig;
}

export function loadHorseGrowthConfig(): HorseGrowthConfig {
  return horseGrowthConfigJson as unknown as HorseGrowthConfig;
}

export function loadProgressionConfig(): ProgressionConfig {
  return progressionConfigJson as unknown as ProgressionConfig;
}

export function loadCareConfig(): CareConfig {
  return careConfigJson as unknown as CareConfig;
}

export function loadStableConfig(): StableConfig {
  return stableConfigJson as unknown as StableConfig;
}

export function loadJockeyConfig(): JockeyConfig {
  return jockeyConfigJson as unknown as JockeyConfig;
}

export function loadStaffConfig(): StaffConfig {
  return staffConfigJson as unknown as StaffConfig;
}

/** 01.10.2026 — atın görünüşü (don/işaret ağırlıkları + kalıtım). */
export function loadHorseAppearanceConfig(): HorseAppearanceConfig {
  return horseAppearanceConfigJson as unknown as HorseAppearanceConfig;
}

export function loadFarmConfig(): FarmConfig {
  return farmConfigJson as unknown as FarmConfig;
}

export function loadOnlineConfig(): OnlineConfig {
  return onlineConfigJson as unknown as OnlineConfig;
}

/**
 * Faz 6 "Config ayrımı" (bu turda EKLENDİ) — `apps/web/src/features/
 * race-viewer/camera-director.ts`/`photo-finish.ts`'in DAHA ÖNCE
 * modül-seviyesi sabit olarak gömülü değerlerinin config karşılığı.
 * Diğer `loadXConfig()` fonksiyonlarıyla AYNI desen: bu paket hem
 * `apps/api` (Node.js) hem `apps/web` (tarayıcı/edge) tarafında
 * sorunsuz çalışır (dosya başı doc yorumu) — bu üçü İLK KEZ `apps/web`
 * tarafından tüketilen config'lerdir (`apps/web/package.json`'a bu
 * turda `@at-sevdalisi/game-config` bağımlılığı EKLENDİ).
 */
export function loadCameraConfig(): CameraConfig {
  return cameraConfigJson as unknown as CameraConfig;
}

export function loadVfxConfig(): VfxConfig {
  return vfxConfigJson as unknown as VfxConfig;
}

export function loadAudioConfig(): AudioConfig {
  return audioConfigJson as unknown as AudioConfig;
}

/**
 * Tribün (proje sahibinin açık talebi, 27.09.2026) — ücretli seyirci
 * girişi. Diğer `loadXConfig()` fonksiyonlarıyla AYNI desen; tipin tam
 * gerekçesi (ve neden bir SINK olduğu) `GrandstandConfig` doc yorumunda.
 */
export function loadGrandstandConfig(): GrandstandConfig {
  return grandstandConfigJson as unknown as GrandstandConfig;
}

/**
 * Arkadaşlık + mesajlaşma (proje sahibinin açık talebi, 27.09.2026).
 *
 * **`maxMessageLength` DB KISITIYLA EŞLEŞMEK ZORUNDADIR** —
 * `direct_messages.body` üzerindeki `CHECK (char_length(body) BETWEEN 1 AND
 * 500)` (migration 0033) bu değeri sabitler. İkisi ayrı yerlerde
 * yaşadığından, uyuşmazlık sessiz bir çalışma zamanı hatası olurdu (domain
 * 1000 karakteri kabul eder, INSERT patlar). Bunu yakalayan şey
 * `apps/api/test/domain/social/social-config.spec.ts`'tir: o test
 * `maxMessageLength`'i 500'e sabitler, böylece config'i değiştiren kişi
 * migration'ı da güncellemesi gerektiğini ANINDA görür.
 */
export function loadSocialConfig(): SocialConfig {
  return socialConfigJson as unknown as SocialConfig;
}

/**
 * Yönetim (admin) ayarları (brief §34, §42 PHASE 15-B) —
 * `config/admin.config.json`.
 *
 * **`load*Config()` AİLESİNİN TAMAMI GİBİ SAF BİR CAST'TİR** — çalışma
 * zamanı doğrulaması YOKTUR (bkz. `loadSocialConfig` doc yorumu). Yani
 * JSON'a yazılan bir yazım hatası sessizce `undefined` olur ve
 * `LIMIT undefined` gibi bir sorguya dönüşür. Bu yüzden değerler
 * `admin-config.spec.ts` tarafından sabitlenir.
 */
export function loadAdminConfig(): AdminConfig {
  return adminConfigJson as unknown as AdminConfig;
}

/**
 * Hediye gönderimi (proje sahibinin açık talebi, 27.09.2026) — üç parçanın
 * üçüncüsü. Diğer `loadXConfig()` fonksiyonlarıyla AYNI desen; bu config
 * BİR PARA YOLUNU beslediği için (min/max/günlük limit) değerleri
 * `gift-config.spec.ts` ile sabitlenir — yükleyici saf bir cast'tir,
 * çalışma zamanı doğrulaması YOKTUR.
 */
export function loadGiftConfig(): GiftConfig {
  return giftConfigJson as unknown as GiftConfig;
}

/**
 * Yarış sohbeti + canlı izleyici sayısı (brief §13/§27, proje sahibinin
 * açık talebi, 27.09.2026). Diğer `loadXConfig()` fonksiyonlarıyla AYNI
 * desen — bu yükleyici de saf bir CAST'tir, çalışma zamanı doğrulaması
 * YOKTUR.
 *
 * **`maxMessageLength` DB KISITIYLA EŞLEŞMEK ZORUNDADIR** —
 * `race_messages.body` üzerindeki `CHECK (char_length(body) BETWEEN 1 AND
 * 300)` (migration 0035) bu değeri sabitler. İkisi ayrı yerlerde
 * yaşadığından, uyuşmazlık sessiz bir çalışma zamanı hatası olurdu (domain
 * 1000 karakteri kabul eder, INSERT patlar). Bunu yakalayan şey
 * `apps/api/test/domain/chat/chat-config.spec.ts`'tir: o test değeri
 * MİGRASYON DOSYASINI OKUYARAK karşılaştırır, yani config'i değiştiren
 * kişi migration'ı da güncellemesi gerektiğini ANINDA görür
 * (`loadSocialConfig` ile AYNI gerekçe).
 */
export function loadChatConfig(): ChatConfig {
  return chatConfigJson as unknown as ChatConfig;
}

/**
 * Oyuncunun oluşturduğu ücretli yarış (brief §1-§7, §42 PHASE 1).
 * Diğer `loadXConfig()` fonksiyonlarıyla AYNI desen — saf bir CAST, çalışma
 * zamanı doğrulaması YOKTUR. Bu yüzden sınırların iç tutarlılığı
 * (`minPlayers <= maxPlayers`, `minPlayers <= min(fieldSizes)`,
 * `fieldSizes`'ın tamamı `maxPlayers`'tan küçük ya da eşit) bir testle
 * sabitlenir: `apps/api/test/domain/race/race-lobby-config.spec.ts`.
 *
 * **NEDEN `loadRaceConfig()`'e EKLENMEDİ:** bkz. `RaceLobbyConfig` doc
 * yorumu — o dosya Race Engine'in fizik sabitleridir ve `configVersion`
 * üzerinden TÜM eski replay'lerin determinizm sözleşmesine bağlıdır;
 * buradaki değerler simülasyona hiç girmez.
 */
export function loadRaceLobbyConfig(): RaceLobbyConfig {
  return raceLobbyConfigJson as unknown as RaceLobbyConfig;
}

export * from './types';

/**
 * E-posta + şifre girişi (30.09.2026, migration 0046). Diğer `load*Config()`
 * gibi saf bir cast'tir; değerler `auth-config.spec.ts` ile sabitlenir.
 * `scrypt` parametreleri YALNIZCA yeni özetler için kullanılır — eski
 * özetler kendi parametrelerini taşır.
 */
export function loadAuthConfig(): AuthConfig {
  return authConfigJson as unknown as AuthConfig;
}

/** 01.10.2026 — atın durumu → 3D davranış (salt görsel). */
export function loadHorsePresenceConfig(): HorsePresenceConfig {
  return horsePresenceConfigJson as unknown as HorsePresenceConfig;
}

/** 01.10.2026 — hipodrom atmosferi (kalabalık heyecanı, tribün animasyonu, LOD). */
export function loadAtmosphereConfig(): AtmosphereConfig {
  return atmosphereConfigJson as unknown as AtmosphereConfig;
}

/** 01.10.2026 — 3D sahnelerin ortak ışık ayarları (ton eşleme, HDRI, bloom, yumuşak gölge). */
export function loadLightingConfig(): LightingConfig {
  return lightingConfigJson as unknown as LightingConfig;
}

export function loadPerformanceConfig(): PerformanceConfig {
  return performanceConfigJson as unknown as PerformanceConfig;
}

export function loadInteractiveRaceConfig(): InteractiveRaceConfig {
  return interactiveRaceConfigJson as unknown as InteractiveRaceConfig;
}
