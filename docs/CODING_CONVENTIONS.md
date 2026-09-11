# CODING_CONVENTIONS.md — Kod Standartları

> Kaynak: `docs/PROJECT_BRIEF.md` §71 (15 kural), §72 (geliştirme
> protokolü), §52 (Configuration sistemi), §89 (tasarım ilkeleri).

## 1. Genel kurallar (brief §71 — birebir)

1. Yeni bir modüle başlamadan önce ilgili kısım repository'de taranır.
2. Mevcut kodu bozmadan önce plan çıkarılır (gerekirse `docs/ARCHITECTURE.md`
   güncellenir).
3. Büyük dosyalar oluşturulmaz; bir dosya tek bir sorumluluğa odaklanır.
4. Domain logic ile UI logic kesinlikle ayrılır.
5. Database erişimi domain sınıflarına gömülmez (Infrastructure katmanında
   kalır, Domain sadece interface/port tanımlar).
6. Magic number kullanılmaz.
7. Her ayarlanabilir değer config'den okunur.
8. Kritik oyun mantığı (Race Engine, Genetics, Economy) unit test ile
   korunur.
9. Online sistemde server-authoritative yaklaşım korunur.
10. Yarış sonucu client tarafından belirlenemez.
11. Aynı seed + aynı snapshot + aynı config = aynı yarış sonucu.
12. Kod yazmadan önce ilgili modülün amacı ve bağımlılıkları belirlenir.
13. Her büyük modülden sonra test çalıştırılır.
14. Build kırılırsa yeni özellik eklenmez; önce build problemi çözülür.
15. Bir sistem değiştirilmeden önce bağlı sistemler kontrol edilir.

## 2. Geliştirme protokolü (brief §72 — her görev için)

```text
1. ANALYZE   — ilgili domain, config, DB, API incelenir
2. PLAN      — arayüz/servis tasarımı belirlenir
3. IMPLEMENT — kod yazılır (küçük, test edilebilir parçalar halinde)
4. TEST      — ilgili unit/entegrasyon testleri çalıştırılır
5. VERIFY    — determinism/denge/güvenlik kontrol edilir
6. DOCUMENT  — ilgili docs/*.md dosyası güncellenir
```

## 3. Config kullanımı (brief §52)

```typescript
// ❌ Yanlış
fatigue += 15;

// ✅ Doğru
fatigue += trainingConfig.sprint.highIntensityFatigue;
```

Tüm config dosyaları `config/*.config.json` altında saklanır ve
`packages/game-config` üzerinden tip güvenli şekilde okunur:

```typescript
import { loadTrainingConfig } from '@at-sevdalisi/game-config';

const trainingConfig = loadTrainingConfig();
fatigue += trainingConfig.sprint.highIntensityFatigue;
```

ESLint kuralı (`@typescript-eslint/no-magic-numbers`, bkz.
`.eslintrc.cjs`) bu kuralı otomatik olarak denetler.

## 4. Katman bağımlılık yönü

```text
apps/api/src/api            → application, shared-types
apps/api/src/application    → domain, (infrastructure sadece interface üzerinden)
apps/api/src/domain         → hiçbir şeye bağımlı değil (framework-free)
apps/api/src/infrastructure → domain (interface implementasyonu için), 3. parti kütüphaneler
```

`domain` klasöründe **hiçbir zaman** şunlar bulunmaz: `@nestjs/*` importu,
ORM/DB client importu, HTTP/Express/Nest dekoratörü.

## 5. Dosya/isimlendirme kuralları

- Dosya adları: `kebab-case.ts` (örn. `train-horse.use-case.ts`).
- Sınıf/Interface adları: `PascalCase`.
- Değişken/fonksiyon adları: `camelCase`.
- Use-case dosyaları `*.use-case.ts`, domain servisleri `*.service.ts`,
  repository interface'leri `*.repository.ts`, NestJS controller'ları
  `*.controller.ts` son ekini taşır.
- Bir dosya ~300 satırı aştığında bölünmesi değerlendirilir (Kural 3).

## 6. Commit ve PR akışı

- Küçük, tek amaçlı commit'ler tercih edilir (brief'in "küçük, test
  edilebilir parçalar halinde ilerle" ilkesiyle uyumlu).
- Commit mesajı formatı: `<tip>(<kapsam>): <özet>` — örn.
  `feat(horse): antrenman use-case'i eklendi`, `docs(race-engine): segment
  formülü güncellendi`.
- Kritik sistemlere (Race Engine, Genetics, Economy) dokunan her PR, ilgili
  test dosyasının güncellendiğini/eklendiğini göstermelidir.

## 7. TypeScript sıkılığı

`tsconfig.base.json` içinde `strict: true` ve
`noUncheckedIndexedAccess: true` açıktır. `any` kullanımı ESLint'te
`warn` seviyesindedir ve yalnızca gerçekten tip tanımlanamayan dış veri
sınırlarında (örn. ham webhook payload'ı) haklı gösterilebilir; bu
durumlarda mutlaka bir yorum satırıyla gerekçelendirilir.
