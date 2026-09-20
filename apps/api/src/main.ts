import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './api/middleware/http-exception.filter';

/**
 * Uygulama giriş noktası. brief §90 STEP 7 "Backend skeleton oluştur"
 * kapsamında FAZ 0'da oluşturulmuştur; iş mantığı (use-case'ler) FAZ 1'de
 * eklenecektir.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // AUDIT_REPORT.md Bulgu F2 (bu oturum) — `RaceGateway`'in (bkz. o
  // dosyanın doc yorumu) kullandığı socket.io tabanlı WebSocket adaptörünü
  // AÇIKÇA kaydeder — `@nestjs/platform-socket.io` kurulu olsa bile bunu
  // ZIMNİ otomatik algılamaya BIRAKMAMAK için (bu sandbox'ta hiç
  // kurulup/çalıştırılamayan bir paket seti olduğundan, belirsizliği en
  // aza indirmek amacıyla).
  app.useWebSocketAdapter(new IoAdapter(app));

  // AUDIT_REPORT.md Bulgu S5 (High) hardening — güvenlik başlıkları
  // (CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy vb.)
  // daha önce HİÇ ayarlanmıyordu. Bu, saf bir JSON API'dir (`apps/web`
  // ayrı bir origin'de, tarayıcıda `fetch()` ile tüketir) — Helmet'in
  // varsayılan ayarları JSON response'ları hiçbir şekilde ETKİLEMEZ,
  // yalnızca ek güvenlik header'ları ekler; CORS zaten ayrıca
  // `enableCors` ile yönetiliyor (aşağıda), Helmet ile ÇAKIŞMAZ.
  app.use(helmet());

  const apiPrefix = process.env.API_PREFIX ?? 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // docs/API.md §1.2 - tutarlı hata zarfı tüm endpoint'lerde uygulanır.
  app.useGlobalFilters(new HttpExceptionFilter());

  // DTO doğrulama (brief Kural: girdi doğrulama API katmanında yapılır,
  // bkz. docs/SECURITY.md §2).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({ origin: corsOrigin, credentials: true });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`AT SEVDALISI API http://localhost:${port}/${apiPrefix} adresinde çalışıyor`);
}

void bootstrap();
