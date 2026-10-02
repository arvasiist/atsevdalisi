import { Module } from '@nestjs/common';
import { ClientErrorsController } from './client-errors.controller';

/** 02.10.2026 (Faz 13-C) — işletim uçları (istemci hata raporu). */
@Module({ controllers: [ClientErrorsController] })
export class OpsModule {}
