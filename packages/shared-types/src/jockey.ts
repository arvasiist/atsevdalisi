import type { ISODateTimeString, UUID } from './common';

/** brief §7 Jockey, §13 */
export interface Jockey {
  id: UUID;
  name: string;
  experience: number;
  startSkill: number;
  tacticalSkill: number;
  sprintSkill: number;
  horseControl: number;
  riskManagement: number;
  trackKnowledge: number;
  salary: number;
  ownerId: UUID | null; // null = NPC/sistem jokeyi
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

/**
 * `GET /players/:id/jockey` yanıtı (PHASE 6.2).
 *
 * **NEDEN `Jockey | null` DÖNMEK YETMEZ.** `composite` alanı SUNUCUDA
 * hesaplanır (`calculateJockeySkillComposite`, `domain/jockey/jockey.ts`)
 * ve motora giren TEK sayıdır — istemciye gönderilmezse oyuncu kendi
 * jokeyinin gücünü göremez ve "jokey işe yarıyor mu" sorusu cevapsız
 * kalır. İstemcide yeniden hesaplamak (altı alanı ağırlıklarla çarpmak)
 * ise formülün İKİNCİ bir kopyasını doğururdu: config değişince
 * istemcinin gösterdiği sayı ile motorun kullandığı sayı sessizce
 * ayrışırdı. Bu yüzden `composite` sunucudan gelir.
 *
 * `salary` ZATEN `Jockey` içinde vardır ve burada TEKRARLANMAZ — kiralama
 * bedeli jokeyin kendi alanıdır, kiralama işleminin bir özelliği değil.
 */
export interface PlayerJockeyView {
  jockey: Jockey;
  /**
   * Motora giren 0-100 jokey puanı. **BİR SONRAKİ YARIŞTA geçerlidir** —
   * yarış sırasında kullanılan değer `race_entries.horse_snapshot`'a
   * DONDURULUR ve oyuncu yarış kilitlendikten sonra jokey değiştirse bile
   * o yarışı etkilemez (bkz. `RaceEntrantSnapshot.jockeySkillComposite`).
   */
  composite: number;
}

/**
 * `POST /jockeys/:jockeyId/hire` yanıtı (PHASE 6.2) — PARA YOLU.
 *
 * `balanceAfter` döner çünkü bu bir harcamadır ve istemci üst bardaki
 * bakiyeyi ek bir istek atmadan güncelleyebilmelidir (`/wallet`
 * yüklemesindeki `mockDeposit` yanıtıyla AYNI desen).
 */
export interface HireJockeyResultView {
  jockey: Jockey;
  /** Ödenen kiralama bedeli (`jockeys.salary`) — 0 olabilir (ücretsiz jokey). */
  paid: number;
  balanceAfter: number;
}
