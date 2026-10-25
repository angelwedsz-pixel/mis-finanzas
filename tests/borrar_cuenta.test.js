import test from 'node:test';
import assert from 'node:assert/strict';
import { storeReal, acc, cat, HOY } from './helpers.js';
import { accountsWithBalance } from '../js/core/calc.js';

test('borrar una cuenta sin movimientos', async () => {
  const s = await storeReal();
  const nueva = await s.addAccount({ name: 'Sobrante', type: 'banco', opening_balance: 0, opening_date: HOY });
  await s.deleteAccount(nueva.id);
  assert.equal(s.state.accounts.some((a) => a.name === 'Sobrante'), false);
});

test('borrar una cuenta con movimientos exige confirmarlo y borra sus movimientos', async () => {
  const s = await storeReal();
  const ef = acc(s, 'Efectivo');
  await s.addTransaction({ date: HOY, kind: 'gasto', from_account_id: ef, category_id: cat(s, 'Almuerzos') ?? s.state.categories.find((c) => c.kind === 'gasto').id, amount: 15000 });
  await s.addTransaction({ date: HOY, kind: 'transferencia', from_account_id: acc(s, 'Davivienda'), to_account_id: ef, amount: 50000 });
  const antes = s.state.transactions.length;
  await assert.rejects(() => s.deleteAccount(ef));
  await s.deleteAccount(ef, { withTransactions: true });
  assert.equal(s.state.accounts.some((a) => a.id === ef), false);
  assert.equal(s.state.transactions.some((t) => t.from_account_id === ef || t.to_account_id === ef), false);
  assert.equal(s.state.transactions.length, antes - 2);
  // Davivienda vuelve a su saldo sin el traslado borrado
  const dav = accountsWithBalance(s.state).find((a) => a.name === 'Davivienda');
  assert.ok(Number.isFinite(dav.balance));
});
