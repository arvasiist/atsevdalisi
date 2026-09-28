import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GiftController } from '../../src/api/gift/gift.controller';
import { RaceLobbyController } from '../../src/api/race/race-lobby.controller';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../../src/api/rate-limit/rate-limit.decorator';
import { SocialController } from '../../src/api/social/social.controller';
import { REPO_ROOT } from '../support/repo-root';

/** Kaynak dosyası okumanın TEK yolu — `process.cwd()` KULLANILMAZ. */
const API_SRC = join(REPO_ROOT, 'apps', 'api', 'src');
const readSource = (...parts: string[]): string => readFileSync(join(API_SRC, ...parts), 'utf-8');

/**
 * `apps/api/test/security/phase16-hardening.spec.ts` — §42 PHASE 16
 * "Security + Anti Cheat + Rate Limit" (brief §31 + §32), 28.09.2026.
 *
 * **BU DOSYA YENİ BİR ÖZELLİK DEĞİL, BİR KANITTIR.** §31 (istemci otorite
 * değildir) ve §32 (beş işleme hız sınırı) maddeleri kodda ZATEN
 * karşılanıyordu; eksik olan, bunun **CI tarafından kilitlenmesiydi**.
 * Buradaki iddiaların her biri, sessizce bozulabilecek bir şeyi tutar:
 *
 *  - §32: bir `@RateLimit(...)` silinirse `RateLimitGuard` (opt-in çalışır,
 *    bkz. `rate-limit.decorator.ts`) o rotayı SESSİZCE sınırsız bırakır —
 *    ne derleyici ne başka bir test fark eder.
 *  - §31: settle ucuna bir `@Body()` eklenirse istemci, koşacak yarışın
 *    sonucunu/girdisini belirleyebilir hâle gelir — CLAUDE.md kural 1.
 *
 * **NEDEN `domain/` ALTINDA DEĞİL:** bu dosya `@nestjs/common` ve gerçek
 * controller sınıflarını import eder; `domain/` framework'süz saf TS
 * olmak zorundadır (CLAUDE.md kural 4). Bu yüzden ayrı bir `security/`
 * klasöründe durur — ama e2e DEĞİLDİR: veritabanına, Redis'e veya HTTP'ye
 * hiç dokunmaz, bu yüzden hızlı grupta koşar.
 *
 * **§32'NİN "Chat" MADDESİ AYRI ELE ALINIR:** sohbet bir HTTP rotası
 * DEĞİL, bir WebSocket olayıdır (`chat.message`, `race.gateway.ts`) — yani
 * `@RateLimit` decorator'ı oraya UYGULANAMAZ; sınır gateway'in içinde,
 * soket başına sabit penceredir. Bu yüzden o madde metadata ile değil,
 * **kaynak okunarak** doğrulanır (aşağıda).
 */

// ============================================================
// §32 — HIZ SINIRI
// ============================================================

/**
 * `@RateLimit(...)` meta verisini OKUR — kaynakta `@RateLimit` kelimesini
 * ARAMAZ.
 *
 * NEDEN METADATA, NEDEN METİN ARAMA DEĞİL: `RateLimitGuard` kararını
 * `Reflector.getAllAndOverride(RATE_LIMIT_KEY, ...)` ile verir. Testin de
 * AYNI kanaldan okuması, "testin gördüğü" ile "guard'ın gördüğü"nün
 * AYNI ŞEY olduğunu garanti eder. Kaynak metninde `@RateLimit` aramak,
 * decorator yorum satırına alındığında ya da başka bir sınıfa taşındığında
 * YEŞİL kalırdı — yani hiçbir şey kanıtlamazdı.
 */
function rateLimitOf(controller: object, method: string): RateLimitOptions {
  const handler = (controller as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`Test kurgusu bozuk: ${method} bir metot değil.`);
  }
  const options = Reflect.getMetadata(RATE_LIMIT_KEY, handler) as RateLimitOptions | undefined;
  if (options === undefined) {
    throw new Error(`@RateLimit YOK: ${method}`);
  }
  return options;
}

describe('§32 — brief\'in saydığı işlemlerin hız sınırı (metadata kanıtı)', () => {
  /**
   * brief §32'nin BEŞ işlemi. "Chat" burada YOKTUR — WebSocket olduğu
   * için ayrı bir `describe` bloğunda kaynak okunarak doğrulanır.
   */
  const RATE_LIMITED: ReadonlyArray<readonly [string, object, string, string]> = [
    ['Messages', SocialController.prototype, 'sendMessage', 'direct-message'],
    ['Friend Requests', SocialController.prototype, 'sendFriendRequest', 'friend-request'],
    ['Gift', GiftController.prototype, 'sendGift', 'gift-send'],
    ['Race Join', RaceLobbyController.prototype, 'join', 'race-join'],
  ];

  it.each(RATE_LIMITED)('%s → `%s` sınırlıdır', (_op, controller, method, expectedName) => {
    const options = rateLimitOf(controller, method);
    // `name` AYRICA doğrulanır: aynı `name`i paylaşan iki rota SAYACI
    // PAYLAŞIR (bkz. decorator doc yorumu), yani yanlış bir kopyala-yapıştır
    // iki ayrı işlemi tek bütçeye bağlar ve birini diğerine kilitler.
    expect(options.name).toBe(expectedName);
    expect(options.limit).toBeGreaterThan(0);
    expect(options.windowSeconds).toBeGreaterThan(0);
    // Kimliği doğrulanmış rotalarda doğru birim OYUNCUdur, IP değil:
    // IP bazlı limit aynı NAT'taki gerçek oyuncuları birbirine kilitler.
    expect(options.keyBy).toBe('player');
  });
});

describe('§32 — "spam engelle": sosyal yüzeyde KORUMASIZ yazma rotası kalmaz', () => {
  /**
   * KAPALI KÜME İDDİASI. brief §32 "spam engelle" der; tek tek sayılan beş
   * işlem asgariyi verir ama aynı yüzeydeki KARDEŞ yazma rotaları (isteğe
   * yanıt, arkadaş silme, engel kaldırma) korumasız kalsaydı spam kapısı
   * oradan açık kalırdı.
   *
   * Liste ELLE yazılır (kaynak taranarak üretilmez): bir rota SİLİNİRSE
   * burada "fazladan" bir ad kaydı kalır ve test onu bulamayıp KIRILIR —
   * yani liste kendini bayatlatamaz.
   */
  const SOCIAL_WRITES: ReadonlyArray<readonly [string, string]> = [
    ['sendFriendRequest', 'friend-request'],
    ['respondToFriendRequest', 'friend-request-respond'],
    ['removeFriend', 'friend-remove'],
    ['sendMessage', 'direct-message'],
    ['blockPlayer', 'player-block'],
    ['unblockPlayer', 'player-unblock'],
    ['reportPlayer', 'player-report'],
  ];

  it.each(SOCIAL_WRITES)('SocialController.%s sınırlıdır', (method, expectedName) => {
    const options = rateLimitOf(SocialController.prototype, method);
    expect(options.name).toBe(expectedName);
    expect(options.keyBy).toBe('player');
  });

  it('liste GERÇEKTEN kapalıdır: controller üzerindeki her yazma metodu listede', () => {
    // `@Post`/`@Delete`/`@Patch` ile işaretlenmiş metot adları Nest meta
    // verisinden DEĞİL, doğrudan prototipten toplanır: decorator'lar
    // metodu değiştirmez, yalnızca meta veri ekler. `getOverview` gibi
    // okuma uçları `@Get` olduğu için burada GÖRÜNMEZ.
    // Okuma uçları (`getOverview`/`getConversation`/`getInbox`/
    // `getBlockedPlayers`) `get` ile başlar ve bu kümenin DIŞINDADIR —
    // okuma ucuna hız sınırı koymak gerçek kullanıcıyı meşru işinden
    // alıkoyardı (bkz. `RateLimitGuard` doc yorumu).
    const listed = new Set(SOCIAL_WRITES.map(([method]) => method));
    const all = Object.getOwnPropertyNames(SocialController.prototype).filter(
      (name) => name !== 'constructor' && !name.startsWith('get'),
    );
    for (const name of all) {
      expect(listed.has(name), `Listede olmayan metot: ${name}`).toBe(true);
    }
  });
});

describe('§32 — Chat (WebSocket): hız sınırı YAZMADAN ÖNCE uygulanır', () => {
  const gateway = readSource('api', 'realtime', 'race.gateway.ts');

  it('`consumeChatQuota` vardır ve sınırı config\'ten okur (sihirli sayı yok)', () => {
    expect(gateway).toContain('consumeChatQuota');
    expect(gateway).toMatch(/this\.config\.chat\.rateLimit/);
  });

  it('SIRA KANITI: kota kontrolü, mesajı YAZAN use-case çağrısından ÖNCE gelir', () => {
    // Bu, bu bloğun asıl iddiasıdır. Sıra tersine dönerse sınır yine
    // "vardır" ama işe yaramaz: reddedilen mesaj çoktan veritabanına
    // yazılmış olurdu ve kimse fark etmezdi (testler yeşil kalırdı).
    const handlerStart = gateway.indexOf('async handleChatMessage(');
    expect(handlerStart).toBeGreaterThan(-1);
    const body = gateway.slice(handlerStart);

    const quota = body.indexOf('this.consumeChatQuota(');
    const write = body.indexOf('this.sendRaceMessageUseCase.execute(');
    const publish = body.indexOf("emit('chat.message.received'");

    expect(quota).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(-1);
    expect(quota).toBeLessThan(write);
    expect(write).toBeLessThan(publish);
  });
});

// ============================================================
// §31 — ANTI-CHEAT: İSTEMCİ OTORİTE DEĞİLDİR
// ============================================================

describe('§31 — yarış SONUCU istemciden gelmez', () => {
  const raceLobby = readSource('api', 'race', 'race-lobby.controller.ts');

  it('`POST /races/:id/settle` YALNIZCA yol parametresi alır — gövde YOK', () => {
    // brief §31: "Client: Race Result / Prize / Multiplier ... üzerinde
    // authoritative olmamalı." Ödül dağıtımını tetikleyen uçta bir
    // `@Body()` bulunması, istemcinin sonucu ya da tutarı seçebilmesinin
    // ÖN KOŞULUDUR. Bugün öyle bir parametre yoktur; bu test onu öyle
    // tutar.
    const start = raceLobby.indexOf('async settle(');
    expect(start).toBeGreaterThan(-1);
    const signature = raceLobby.slice(start, raceLobby.indexOf('):', start));

    expect(signature).toContain("@Param('id', ParseUUIDPipe)");
    expect(signature).not.toContain('@Body(');
    expect(signature).not.toContain('@Query(');
  });
});

describe('§31 — istemci ÖDEDİĞİ tutarı seçemez', () => {
  const joinDto = readSource('api', 'race', 'dto', 'join-race.dto.ts');

  it('`JoinRaceDto` gövdesi TAM OLARAK üç alan taşır: horseId, tacticalStyle, riskLevel', () => {
    // Alan adları KAYNAKTAN okunur çünkü `!:` ile bildirilen alanlar
    // çalışma anında KENDİ ÖZELLİĞİ OLARAK VAR OLMAZ (`new JoinRaceDto()`
    // boş bir nesnedir) ve esbuild `design:type` üretmediği için
    // `Reflect` üzerinden de görünmezler. Kaynak, tek güvenilir kaynaktır.
    const declared = [...joinDto.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)!?:/gm)].map((m) => m[1]);
    expect(declared.sort()).toEqual(['horseId', 'riskLevel', 'tacticalStyle']);
  });

  it('gövdede PARA/SONUÇ kavramı taşıyan bir alan ADI yoktur', () => {
    // `entry_fee`, ödül havuzu ve çarpan SUNUCUDA, yarış satırından ve
    // config'ten gelir. Gövdeye böyle bir alan eklenmesi, sessizce
    // "istemcinin söylediği tutar" yolunu açardı — CLAUDE.md kural 1.
    const declared = [...joinDto.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)!?:/gm)].map((m) => m[1]);
    for (const field of declared) {
      expect(field).not.toMatch(/fee|prize|money|amount|multiplier|result|score|time|rank/i);
    }
  });
});
