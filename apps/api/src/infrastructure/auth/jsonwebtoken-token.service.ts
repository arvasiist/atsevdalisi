import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { InvalidAuthTokenError } from '../../domain/auth/errors';
import type { TokenPayload, TokenService } from '../../application/ports/token.service';
import { AppConfigService } from '../config/config.service';

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

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.config.env.jwtSecret, {
      expiresIn: this.config.env.jwtExpiresInSeconds,
    });
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

    if (typeof decoded !== 'object' || decoded === null || typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
      throw new InvalidAuthTokenError('Oturum token\'ı geçerli bir "sub" (oyuncu id) claim\'i içermiyor.');
    }

    return { sub: decoded.sub };
  }
}
