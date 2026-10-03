import type { AccountExportSection, AccountExportSectionName } from '@at-sevdalisi/shared-types';

export const ACCOUNT_EXPORT_REPOSITORY = Symbol('ACCOUNT_EXPORT_REPOSITORY');

export interface AccountExportRepository {
  /** Silinmiş ya da olmayan oyuncu için `null`. */
  exportSections(
    playerId: string,
    maxRowsPerSection: number,
  ): Promise<Record<AccountExportSectionName, AccountExportSection> | null>;
}
