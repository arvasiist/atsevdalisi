# features/pedigree

Master Development Brief'in "Pedigree görselleştirme" isteği (mevcut
breeding/genetics domain verisiyle ağaç şeklinde bir UI paneli) için
bu turda eklenen katman.

## Bu turda eklenenler

- **`pedigree-tree.ts`** (saf fonksiyon) — `@at-sevdalisi/shared-types`'ın
  zaten var olan `Pedigree` tipini (`horseId`/`sireId`/`damId`/
  `grandSireId`/`grandDamId`/`bloodline`) bir UI ağacına (`PedigreeTreeNode[]`)
  dönüştürür. Şemanın KENDİ 2-nesil/asimetrik sınırını (`apps/api/src/
  domain/breeding/pedigree.ts`'in doc yorumu — sadece baba hattı
  büyükbaba VE anne hattı büyükanne kayıtlıdır, diğer iki büyükebeveyn
  şemada HİÇ YOK) UYDURMADAN, olduğu gibi yansıtır.
- **`PedigreeTree.tsx`** — bu ağacı `GlassPanel` (Faz 2'nin paylaşılan
  UI dili) ile render eden bileşen. Kayıt tamlığı yüzdesi (`getPedigreeCompleteness`)
  ve kan hattı (`bloodline`, varsa) da gösterilir.

**Doğrulama:** `pedigree-tree.ts`, `tsconfig.logic.json`'a eklendi;
gerçek `tsc --noEmit` (0 hata) ve `tsx` ile çalıştırılan 11 test case'i
(bkz. `test/features/pedigree/pedigree-tree.spec.ts`) PASS.
`PedigreeTree.tsx`, `RaceHud.tsx` ile AYNI kısıta tabi (`@types/react`
bu sandbox'ta kurulu değil) — `ts.transpileModule` ile sözdizimi
kontrolünden geçti (0 diagnostic). Three.js'e bağımlı DEĞİLDİR (saf
React + CSS) — `@types/react` ileride eklenirse `RaceHud.spec.tsx` ile
AYNI şekilde `@testing-library/react` ile GERÇEKTEN render edilebilir.

## ÖNEMLİ — bu bileşen HENÜZ hiçbir sayfaya BAĞLANMADI (gerçek bir bulgu, uydurma değil)

`grep -rn "pedigrees" apps/api/src/` ile doğrulandı: `apps/api`'de
`pedigrees` tablosunu okuyan/yazan **HİÇBİR** repository veya HTTP uç
noktası yoktur — tek kod `domain/breeding/pedigree.ts`'in SAF
fonksiyonlarıdır (`createFoalPedigree` bir `Pedigree` NESNESİ üretir ama
onu VERİTABANINA YAZAN bir repository ÇAĞRISI YOKTUR; `breeding`
akışının kendisinin bir controller'ı bile yoktur). `PublicHorse`
(`packages/shared-types/src/horse.ts`) da pedigree alanları İÇERMEZ.

Bu, `RaceViewer.tsx`'in başlangıçta hiçbir sayfaya mount edilmemiş
olmasıyla AYNI kategoride bir durumdur — ama O sorunun aksine, bunun
çözümü sadece bir mount noktası eklemek DEĞİLDİR; GERÇEK bir backend
zinciri eksiktir:

1. `PedigreeRepository` (port + `postgres-pedigree.repository.ts`) —
   `pedigrees` tablosuna okuma/yazma.
2. `BreedingController`/`GetPedigreeUseCase` — `GET /horses/:id/pedigree`
   (veya breeding akışının kendi controller'ı, henüz o da yok).
3. Yetiştiricilik akışının (`domain/breeding/breeding.ts`) ürettiği
   `Pedigree`'nin foal doğduğunda GERÇEKTEN kaydedilmesi — bu şu an
   YAPILMIYOR gibi görünüyor (kanıt: hiçbir repository çağrısı yok).
4. Ahırım (`/stable`) sayfasına (veya bir at detay ekranına) `<PedigreeTree>`
   mount'u + isim haritası (`horseNamesById`) oluşturma mantığı.

Bu dört madde, bu dilimin (asset-gerektirmeyen, düşük riskli, bağımsız
commit) kapsamının AÇIKÇA dışındadır — gerçek bir backend zinciri
(repository + controller + e2e test, `apps/api`'nin KENDİ ciddi
disiplinine uygun şekilde) gerektirir. Bu README, bir sonraki oturumun
bu boşluğu (görselleştirme HAZIR, veri zinciri EKSİK) fark etmesi için
buraya bilinçli olarak kaydedilmiştir.
