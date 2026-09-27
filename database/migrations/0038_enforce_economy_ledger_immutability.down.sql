-- Geri alma: defteri yeniden değiştirilebilir yapar. DİKKAT — bu, brief
-- §20'nin değişmezlik güvencesini KALDIRIR; yalnızca geri alma (rollback)
-- senaryosu içindir, üretimde çalıştırılmamalıdır.
DROP TRIGGER IF EXISTS trg_economy_transactions_immutable ON economy_transactions;
DROP FUNCTION IF EXISTS economy_transactions_reject_mutation();
