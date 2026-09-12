import { describe, expect, it } from 'vitest';
import { canAfford, credit, debit, transfer } from '../../../src/domain/economy/wallet';
import { InsufficientFundsError, InvalidAmountError } from '../../../src/domain/economy/errors';

/**
 * brief §53 Economy testleri:
 *  - Negatif para oluşmamalı.
 *  - Satın alma atomik olmalıdır (transfer fonksiyonu tek adımda ifade eder).
 */
describe('wallet.canAfford', () => {
  it('yeterli bakiye varken true döner', () => {
    expect(canAfford({ money: 100, gems: 0 }, 100, 'money')).toBe(true);
  });

  it('yetersiz bakiyede false döner', () => {
    expect(canAfford({ money: 50, gems: 0 }, 100, 'money')).toBe(false);
  });
});

describe('wallet.debit', () => {
  it('yeterli bakiyeden doğru şekilde düşer', () => {
    const result = debit({ money: 1000, gems: 0 }, 300, 'money');
    expect(result.money).toBe(700);
  });

  it('yetersiz bakiyede InsufficientFundsError fırlatır ve bakiyeyi değiştirmez', () => {
    const balance = { money: 50, gems: 0 };
    expect(() => debit(balance, 100, 'money')).toThrow(InsufficientFundsError);
    // Orijinal nesne değişmemeli (saf fonksiyon garantisi)
    expect(balance.money).toBe(50);
  });

  it('asla negatif bakiye üretmez', () => {
    expect(() => debit({ money: 0, gems: 0 }, 1, 'money')).toThrow(InsufficientFundsError);
  });

  it('geçersiz (negatif/ondalık) miktar için InvalidAmountError fırlatır', () => {
    expect(() => debit({ money: 100, gems: 0 }, -10, 'money')).toThrow(InvalidAmountError);
    expect(() => debit({ money: 100, gems: 0 }, 10.5, 'money')).toThrow(InvalidAmountError);
    expect(() => debit({ money: 100, gems: 0 }, 0, 'money')).toThrow(InvalidAmountError);
  });
});

describe('wallet.credit', () => {
  it('bakiyeye doğru şekilde ekler', () => {
    const result = credit({ money: 100, gems: 5 }, 50, 'gems');
    expect(result.gems).toBe(55);
    expect(result.money).toBe(100);
  });
});

describe('wallet.transfer', () => {
  it('iki cüzdan arasında tutarlı şekilde transfer yapar (toplam korunur)', () => {
    const seller = { money: 0, gems: 0 };
    const buyer = { money: 5000, gems: 0 };

    const result = transfer(buyer, seller, 2000, 'money');

    expect(result.from.money).toBe(3000);
    expect(result.to.money).toBe(2000);
    // Toplam para korunmalı (yaratılmamalı/yok edilmemeli)
    expect(result.from.money + result.to.money).toBe(buyer.money + seller.money);
  });

  it('alıcının parası yetersizse transfer tamamen başarısız olur (atomiklik)', () => {
    const seller = { money: 100, gems: 0 };
    const buyer = { money: 10, gems: 0 };

    expect(() => transfer(buyer, seller, 2000, 'money')).toThrow(InsufficientFundsError);
  });
});
