/**
 * Master Development Brief §? "Pedigree görselleştirme" (bu turda EKLENDİ)
 * — `@at-sevdalisi/shared-types`'ın ZATEN VAR OLAN `Pedigree` tipini
 * (`packages/shared-types/src/breeding.ts`, `database/migrations/0008_
 * create_breeding_and_pedigree`) bir UI ağacına dönüştüren SAF fonksiyon.
 *
 * ÖNEMLİ — ŞEMANIN KENDİ SINIRI (uydurma DEĞİL, `pedigree.ts`'in KENDİ doc
 * yorumundan): `Pedigree` yalnızca İKİ nesil geriye gider ve TAM 4
 * büyükebeveyn TUTMAZ — sadece `grandSireId` (aygırın babası, baba hattı
 * büyükbaba) ve `grandDamId` (kısrağın annesi, anne hattı büyükanne).
 * Diğer iki büyükebeveyn (aygırın annesi, kısrağın babası) şemada HİÇ
 * YOKTUR. Bu yüzden bu dosya "4 büyükebeveynli simetrik bir ağaç"
 * UYDURMAZ — `buildPedigreeTree`'nin döndürdüğü ağaç, şemanın GERÇEK
 * şekliyle (asimetrik, 2 dal) BİREBİR eşleşir; eksik iki büyükebeveyn
 * slotu basitçe HİÇ RENDER EDİLMEZ (var olmayan bir şeyi "bilinmiyor"
 * kutusu olarak göstermek bile YANILTICI olurdu — şemada o alan için bir
 * SÜTUN bile yok).
 *
 * ÖNEMLİ — backend wiring: bu turda `apps/api`'de pedigree'yi okuyan/
 * yazan HİÇBİR HTTP uç noktası/repository YOKTUR (`grep`'le doğrulandı —
 * `pedigrees` tablosuna dokunan tek kod `domain/breeding/pedigree.ts`'in
 * SAF fonksiyonlarıdır, bir Postgres repository'si veya controller'ı
 * YOK). Bu, `RaceViewer.tsx`'in `/races/demo`'da fixture veriyle
 * çalışmasıyla AYNI kategoride, BİLİNÇLİ bir kapsam sınırıdır — bu dilim
 * SADECE görselleştirme katmanını sunar, gerçek API wiring'i (breeding
 * controller + pedigree repository + `GET /horses/:id/pedigree`) AYRI,
 * daha büyük bir dilimdir (bkz. bu dosyanın bulunduğu README güncellemesi).
 */

import type { Pedigree } from '@at-sevdalisi/shared-types';

export type PedigreeRole = 'self' | 'sire' | 'dam' | 'paternal_grand_sire' | 'maternal_grand_dam';

export interface PedigreeTreeNode {
  role: PedigreeRole;
  /** `null` ise bu ata KAYITLI DEĞİLDİR (uydurulmaz) — `displayName` bu durumda sabit "Bilinmiyor" metnidir. */
  horseId: string | null;
  /** `horseNamesById`'de bir eşleşme yoksa (ör. isim haritası eksik/kısmi doldurulmuş) `horseId`'nin KENDİSİ gösterilir — sahte bir isim UYDURULMAZ. */
  displayName: string;
  /** `horseId !== null` — bu SOYAĞACINDA bu atanın KAYITLI olup olmadığı (isim eşleşip eşleşmediği değil). */
  isKnown: boolean;
}

const UNKNOWN_LABEL = 'Bilinmiyor';

function resolveNode(
  role: PedigreeRole,
  horseId: string | null,
  horseNamesById: Record<string, string>,
): PedigreeTreeNode {
  if (!horseId) {
    return { role, horseId: null, displayName: UNKNOWN_LABEL, isKnown: false };
  }
  return { role, horseId, displayName: horseNamesById[horseId] ?? horseId, isKnown: true };
}

/**
 * Dönen dizi HER ZAMAN tam olarak 5 eleman içerir (`self`, `sire`, `dam`,
 * `paternal_grand_sire`, `maternal_grand_dam`) — şemanın SABİT şekli
 * (bkz. dosya başı doc yorumu). Sıra, `PedigreeTree.tsx`'in render
 * SIRASIYLA (yukarıdan aşağı nesil) eşleşir.
 */
export function buildPedigreeTree(pedigree: Pedigree, horseNamesById: Record<string, string>): PedigreeTreeNode[] {
  return [
    resolveNode('self', pedigree.horseId, horseNamesById),
    resolveNode('sire', pedigree.sireId, horseNamesById),
    resolveNode('dam', pedigree.damId, horseNamesById),
    resolveNode('paternal_grand_sire', pedigree.grandSireId, horseNamesById),
    resolveNode('maternal_grand_dam', pedigree.grandDamId, horseNamesById),
  ];
}

/** UI'da "soy kaydı boş/yeni bir at" durumunu ayırt etmek için — brief'in istediği bir "tamamlanma yüzdesi" DEĞİL, sadece basit bir varlık kontrolüdür. */
export function hasAnyKnownAncestor(tree: PedigreeTreeNode[]): boolean {
  return tree.some((node) => node.role !== 'self' && node.isKnown);
}

/**
 * Bilinen ata sayısı / toplam ata slotu (4 — self hariç). Brief bir sayı
 * İSTEMEDİ, bu basitçe "soy kaydı ne kadar dolu" göstergesi için makul
 * bir metrik — [0, 1] aralığında.
 */
export function getPedigreeCompleteness(tree: PedigreeTreeNode[]): number {
  const ancestorNodes = tree.filter((node) => node.role !== 'self');
  if (ancestorNodes.length === 0) {
    return 0;
  }
  const knownCount = ancestorNodes.filter((node) => node.isKnown).length;
  return knownCount / ancestorNodes.length;
}
