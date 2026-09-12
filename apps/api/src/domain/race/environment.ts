/** Çevre uyumu (docs/ALGORITHMS.md §7, brief §61). */

import type { WeatherConfig } from '@at-sevdalisi/game-config';
import type { RaceSurface, RaceWeather } from '@at-sevdalisi/shared-types';

export interface EnvironmentModifier {
  surfaceModifier: number;
  weatherModifier: number;
}

const NEUTRAL_MODIFIER: EnvironmentModifier = { surfaceModifier: 1, weatherModifier: 1 };

/**
 * `config/weather.config.json` içindeki kombinasyon anahtarları sabit bir
 * zemin+hava listesi içerir (tüm surface × weather kombinasyonlarını değil).
 * Önce tam eşleşme aranır (örn. `sunny_grass_dry`); bulunamazsa sadece
 * hava koşuluna bağlı genel bir anahtar (`windy`/`cold`/`hot`) denenir;
 * o da yoksa nötr modifier (1.0/1.0) döner. Bu, sınırlı config verisiyle
 * de motorun asla hata fırlatmamasını garanti eder.
 */
export function getEnvironmentModifier(
  surface: RaceSurface,
  weather: RaceWeather,
  config: WeatherConfig,
  temperatureC: number | null = null,
): EnvironmentModifier {
  // config/weather.config.json anahtarları: sunny_grass_dry, rainy_grass_wet,
  // rainy_dirt_heavy, sunny_dirt_dry — zemin durumu (dry/wet/heavy) hem
  // hava durumuna hem zemine bağlıdır.
  const surfaceCondition = weather === 'rainy' ? (surface === 'dirt' ? 'heavy' : 'wet') : 'dry';
  const exactKey = `${weather}_${surface}_${surfaceCondition}`;
  if (config.combinations[exactKey]) {
    return config.combinations[exactKey];
  }

  if (config.combinations[weather]) {
    return config.combinations[weather];
  }

  if (temperatureC !== null) {
    if (temperatureC >= 30 && config.combinations['hot']) {
      return config.combinations['hot'];
    }
    if (temperatureC <= 5 && config.combinations['cold']) {
      return config.combinations['cold'];
    }
  }

  return NEUTRAL_MODIFIER;
}
