/**
 * AUDIT_AND_HARDENING Öncelik 6 (bu oturum) — "Race Engine Gerçekçilik ve
 * Denge": denetim, `race-engine.ts`'in segment performans formülünde BEŞ
 * ayrı çarpansal (multiplicative) modifikatörün (condition, surface,
 * weather, ön-yarış fatigue, stamina-tükenme cezası) ARKA ARKAYA
 * ÇARPILDIĞINI tespit etti. Bu, KONTROLSÜZ bir yığılma (stacking) riski
 * taşır: her modifikatör TEK BAŞINA makul bir aralıkta olsa bile (ör.
 * [0.6, 1.0]), BEŞİNİN ÇARPIMI çok daha SERT bir sonuç üretir — örnek
 * (bu projenin GERÇEK config değerleriyle): kötü kondisyon (0.6) × kötü
 * zemin (0.85) × kötü hava (0.90) × yüksek yorgunluk (0.8) × tükenmiş
 * stamina (0.85) ≈ **0.31** — yani BEŞ "orta derecede kötü" faktör bir
 * araya geldiğinde atın performansının %69'u SİLİNİR. Bu, "aynı anda her
 * şeyi doğru yapan" bir at için de simetrik bir avantaj YARATIR (brief
 * §89 İlke 1'in "sadece tek bir formülü çözen her zaman kazanmamalı"
 * ilkesiyle ÇELİŞİR) — matematiği çözüp TÜM eksenlerde optimize eden bir
 * oyuncu, çarpımsal yığılma sayesinde ORANTISIZ bir üstünlük kazanır.
 *
 * Çözüm — ÇARPMA yerine "ceza toplama" (additive penalty): her
 * modifikatör `1.0`'dan ne kadar SAPTIĞI (`1 - factor` = "ceza") olarak
 * ele alınır, cezalar TOPLANIR, sonuç `1 - toplamCeza` olarak geri
 * dönüştürülür. TEK BİR modifikatör nötr değilken davranış AYNIDIR
 * (`1 - (1 - f) = f`) — yani mevcut testlerin/dengenin "sadece BİR şey
 * kötüyken" davranışı DEĞİŞMEZ. Ama BİRDEN FAZLA modifikatör AYNI ANDA
 * kötüyken sonuç artık ÇARPIMSAL DEĞİL, DOĞRUSAL (additive) şekilde
 * kötüleşir — yukarıdaki örnekte toplam ceza = 0.4+0.15+0.10+0.2+0.15 =
 * 1.0 → combined = 0 olurdu, bu yüzden `MIN_COMBINED_MODIFIER` tabanı
 * (0.5) ile AÇIKÇA ve KASITLI olarak kırpılır: hiçbir kombinasyon, bir
 * atın performansını yarısından fazla SİLEMEZ. Bu, denetimin istediği
 * "kontrolsüz çarpımsal yığılmayı azalt" ile TAM olarak örtüşür: sonuç
 * artık AÇIKÇA TANIMLANMIŞ ve TEST EDİLEBİLİR bir tabanla SINIRLIDIR.
 */
const MIN_COMBINED_MODIFIER = 0.5;

/**
 * `factors`'ın HER BİRİ "1.0 = nötr" ölçeğinde bir çarpansal modifikatör
 * olmalıdır (ör. 0.85 = "%15 ceza", 1.05 = "%5 bonus"). Dönüş değeri HER
 * ZAMAN `[MIN_COMBINED_MODIFIER, +∞)` aralığındadır — üst sınır BİLEREK
 * kırpılmaz (birden fazla eşzamanlı BONUS, ör. mükemmel hava + mükemmel
 * kondisyon, çarpımsal yığılmanın DEZAVANTAJ tarafı kadar riskli değildir;
 * bu projenin config'indeki bonus modifikatörleri zaten çok küçüktür, ör.
 * `sunny_grass_dry` → 1.05).
 */
export function combineConditionModifiers(factors: number[]): number {
  const totalPenalty = factors.reduce((sum, factor) => sum + (1 - factor), 0);
  return Math.max(MIN_COMBINED_MODIFIER, 1 - totalPenalty);
}
