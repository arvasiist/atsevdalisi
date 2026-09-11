import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './api/middleware/http-exception.filter';

/**
 * Uygulama giriş noktası. brief §90 STEP 7 "Backend skeleton oluştur"
 * kapsamında FAZ 0'da oluşturulmuştur; iş mantığı (use-case'ler) FAZ 1'de
 * eklenecektir.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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
