import { IsInt, IsString, IsUUID } from 'class-validator';

/**
 * 16.10.2026 — çiftleştirme merkezi gövdeleri. ⚠️ `whitelist: true` alanı
 * DTO'da olmayanı siler; değerler ayrıca controller/domain'de doğrulanır
 * (esbuild altında dekoratörler atlanır — CLAUDE.md kural 5).
 */
export class StudListingDto {
  @IsInt()
  fee!: number;
}

export class CreateBreedingOfferDto {
  @IsUUID()
  mareId!: string;

  @IsUUID()
  stallionId!: string;

  @IsString()
  foalName!: string;
}
