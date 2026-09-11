/**
 * Ortak yardımcı tipler. Bkz. docs/CODING_CONVENTIONS.md.
 */

/** UUID string için okunabilirlik amaçlı takma ad (brand yok, saf string). */
export type UUID = string;

/** ISO-8601 tarih/saat string'i. */
export type ISODateTimeString = string;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/** docs/API.md §1.1-1.2 ile birebir. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
