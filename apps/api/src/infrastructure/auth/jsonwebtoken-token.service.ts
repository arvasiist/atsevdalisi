import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { InvalidAuthTokenError } from '../../domain/auth/errors';
import type { TokenPayload, TokenService } from '../../application/ports/token.service';
import { AppConfigService } from '../config/config.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `TokenService`'in `jsonwebtoken` (HS256, simetrik `JWT_SECRET`) tabanlı
 * implementasyonu. AUDIT_REPORT.md Bulgu S1 hardening (bu oturum).
 *
 * NOT — `docs/ARCHITECTURE.md` §9.1 Hata 6: bağımlılık açık `@Inject()`
 * ile enjekte edilir (Vitest/esbuild örtük tip tabanlı enjeksiyonu
 * desteklemez).
 */
@Injectable()
export class JsonWebTokenService implements TokenService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  sign(payload: { sub: string; sid?: string }, expiresInSeconds: number): string {
    const claims = payload.sid === undefined ? { sub: payload.sub } : { sub: payload.sub, sid: payload.sid };
    return jwt.sign(claims, this.config.env.jwtSecret, { expiresIn: expiresInSeconds });
  }

  verify(token: string): TokenPayload {
    let decoded: string | jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, this.config.env.jwtSecret);
    } catch {
      // `jwt.verify` süresi dolmuş/bozuk/yanlış imzalı token için kendi
      // hata sınıflarını (`TokenExpiredError`/`JsonWebTokenError`) fırlatır —
      // bunlar `http-exception.filter.ts`'nin `DOMAIN_ERROR_MAP`'inde
      // TANIMLI DEĞİLDİR (bkz. o dosyanın "unmapped hata" tuzağı), bu
      // yüzden burada YAKALANIP kendi domain hatamıza çevrilir.
      throw new InvalidAuthTokenError();
    }

    if (typeof decoded !== 'object' || decoded === null || typeof decoded.sub !== 'string' || !UUID_PATTERN.test(decoded.sub)) {
      throw new InvalidAuthTokenError('Oturum token\'ı geçerli bir "sub" (oyuncu id) claim\'i içermiyor.');
    }

    // `sid` SQL'de `uuid`e çevrilir — bozuk bir değer 500 değil 401 olmalı.
    const sid = decoded.sid;
    if (sid !== undefined && (typeof sid !== 'string' || !UUID_PATTERN.test(sid))) {
      throw new InvalidAuthTokenError();
    }
    return {
      sub: decoded.sub,
      ...(sid === undefined ? {} : { sid }),
      ...(typeof decoded.iat === 'number' ? { iat: decoded.iat } : {}),
    };
  }
}
