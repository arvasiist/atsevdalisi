import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { loadOpsConfig } from '@at-sevdalisi/game-config';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** İstek kimliğinin taşınabileceği güvenli karakterler (log enjeksiyonu yok). */
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Gelen geçerli `X-Request-Id`yi alır (yük dengeleyici/izleme zinciri), yoksa
 * ya da bozuksa yenisini üretir. Kimlik hem yanıt başlığına hem hata zarfına
 * (`error.requestId`) yazılır — kullanıcı destek talebinde bunu verir, log
 * satırı bununla bulunur. İçeriği güvenli karakterlerle ve uzunlukla
 * sınırlıdır: istemci log'a keyfi metin sokamaz.
 */
export function resolveRequestId(incoming: unknown, maxLength: number): string {
  if (typeof incoming === 'string' && incoming.length <= maxLength && SAFE_ID.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly maxLength = loadOpsConfig().requestId.maxLength;

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const id = resolveRequestId(req.headers['x-request-id'], this.maxLength);
    req.requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
