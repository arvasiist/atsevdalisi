import { CanActivate, ExecutionContext, Inject, Injectable, Type, mixin } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { HORSE_REPOSITORY, type HorseRepository } from '../../application/ports/horse.repository';
import { ForbiddenError } from '../../domain/auth/errors';
import { HorseNotFoundError } from '../../domain/horse/errors';
import type { AuthenticatedRequest } from './current-player.decorator';

type HorseIdSource = 'param' | 'body' | 'query';

/**
 * Parametrik guard üretici (Nest'in `mixin()` deseni, bkz. resmi NestJS
 * dokümantasyonu "Passing properties to a guard") — atın kimliği farklı uç
 * noktalarda farklı yerlerden gelir: `train`/`care`/`feed`/`practice-race`
 * route param'ı (`:id`), At Pazarı ilan oluşturma/PvP kuyruğuna katılma
 * gövde alanı (`horseId`), PvP kuyruğundan ayrılma sorgu parametresi
 * (`horseId`). AUDIT_REPORT.md Bulgu S2 (Critical IDOR: "at eğitimi/bakımı/
 * yarışı client'ın gönderdiği id'lere güveniyor") hardening'i (bu oturum) —
 * bu guard, `AuthGuard`'ın ZATEN doldurduğu `request.player.id` ile atın
 * GERÇEK `ownerId`'sini karşılaştırır; uyuşmazsa 403 (`ForbiddenError`).
 *
 * Format doğrulaması (UUID mi, hiç gönderilmiş mi) BİLEREK bu guard'ın
 * NİHAİ sorumluluğu DEĞİLDİR (400 mesajı/kodu üretmek her rotanın kendi
 * DTO/`ParseUUIDPipe`/elle `isUUID()` kontrolünün işidir) — AMA Nest'te
 * guard'lar pipe'lardan ÖNCE çalıştığından (bkz. docs/ARCHITECTURE.md §9),
 * eksik/hatalı biçimli bir `horseId` bu guard'ın KENDİ `isUUID()` kontrolü
 * OLMADAN doğrudan `horseRepository.findById(...)`'e ('not-a-uuid' gibi)
 * ulaşıp ham bir Postgres tip hatasıyla 500'e dönüşürdü — `matchmaking.
 * controller.ts` `join`'in AYNI kök nedenli (bkz. o dosyanın "Hata 7"
 * yorumu) GERÇEK bir CI hatasıyla daha önce keşfedilen dersin BURADA da
 * uygulanması: eksik/hatalı biçimli bir değer varsa bu guard sessizce
 * `true` döner ve asıl 400 üretimini downstream katmana bırakır.
 */
export function HorseOwnerGuard(
  source: HorseIdSource,
  field: string = source === 'param' ? 'id' : 'horseId',
): Type<CanActivate> {
  @Injectable()
  class HorseOwnerGuardMixin implements CanActivate {
    constructor(@Inject(HORSE_REPOSITORY) private readonly horseRepository: HorseRepository) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const horseId =
        source === 'param'
          ? (request.params as Record<string, string>)[field]
          : source === 'body'
            ? (request.body as Record<string, unknown> | undefined)?.[field]
            : (request.query as Record<string, string>)[field];

      if (typeof horseId !== 'string' || horseId.length === 0 || !isUUID(horseId)) {
        return true;
      }

      const horse = await this.horseRepository.findById(horseId);
      if (!horse) {
        throw new HorseNotFoundError(horseId);
      }
      if (!request.player || horse.ownerId !== request.player.id) {
        throw new ForbiddenError('Bu at size ait değil.');
      }
      return true;
    }
  }

  return mixin(HorseOwnerGuardMixin);
}

/**
 * Bu projede fiilen kullanılan ÜÇ (source, field) kombinasyonu için ÖNCEDEN
 * oluşturulmuş, PAYLAŞILAN sınıf referansları. `mixin()` HER ÇAĞRIDA YENİ
 * bir sınıf üretir — `@UseGuards(HorseOwnerGuard('param'))` gibi doğrudan
 * (inline) çağrılırsa, o sınıf modülün `providers` dizisinde AYRI bir
 * çağrıyla tekrar oluşturulup eklenemez (iki farklı sınıf kimliği olurdu).
 * Bu yüzden `IdempotencyInterceptor`'ın bu projedeki kullanım deseniyle
 * (her modülün onu KENDİ `providers`'ına AÇIKÇA eklemesi, bkz.
 * `stable.module.ts`/`market.module.ts`) TUTARLI olacak şekilde, HER
 * kombinasyon TEK BİR sabit olarak dışa aktarılır — hem `@UseGuards()`'ta
 * hem ilgili modülün `providers`'ında AYNI referans kullanılır.
 */
export const HorseOwnerGuardByParam = HorseOwnerGuard('param');
export const HorseOwnerGuardByBodyField = HorseOwnerGuard('body');
export const HorseOwnerGuardByQueryField = HorseOwnerGuard('query');
