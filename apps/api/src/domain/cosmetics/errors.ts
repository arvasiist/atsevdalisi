/** 09.10.2026 — kozmetik mağaza hataları. */
export class CosmeticNotFoundError extends Error {
  constructor(public readonly key: string) {
    super('Bu kozmetik ürün bulunamadı.');
    this.name = 'CosmeticNotFoundError';
  }
}

export class CosmeticAlreadyOwnedError extends Error {
  constructor(public readonly key: string) {
    super('Bu ürüne zaten sahipsin.');
    this.name = 'CosmeticAlreadyOwnedError';
  }
}

/** Avatar kaydında sahip olunmayan (mağazadan açılan) bir seçenek. */
export class CosmeticNotOwnedError extends Error {
  constructor(public readonly key: string, itemName: string) {
    super(`"${itemName}" mağazadan açılır; önce satın almalısın.`);
    this.name = 'CosmeticNotOwnedError';
  }
}
