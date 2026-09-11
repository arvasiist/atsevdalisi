import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './config.service';

/**
 * Ortam değişkenlerini (.env) ve config/*.config.json (bkz.
 * @at-sevdalisi/game-config) dosyalarını tek bir servis üzerinden erişilebilir
 * kılar. Brief §52: "Hard-coded değerlerden kaçınılmalıdır."
 */
@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
