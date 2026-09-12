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
  CareConfig,
  EconomyConfig,
  GeneticsConfig,
  HorseGrowthConfig,
  JockeyConfig,
  ProgressionConfig,
  RaceBalanceConfig,
  StableConfig,
  StaffConfig,
  TrainingConfig,
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

export * from './types';
