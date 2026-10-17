import { Module } from '@nestjs/common';
import { GetHippodromeCatalogUseCase } from '../../application/use-cases/get-hippodrome-catalog.use-case';
import { HippodromeController } from './hippodrome.controller';

/** Hipodrom kataloğu (16.10.2026, brief §9). */
@Module({
  controllers: [HippodromeController],
  providers: [GetHippodromeCatalogUseCase],
})
export class HippodromeModule {}
