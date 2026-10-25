import test from 'node:test';
import assert from 'node:assert/strict';
import { storeReal, acc, cat, HOY } from './helpers.js';
import { accountBalances, payDay } from '../js/core/calc.js';
import { periodFor } from '../js/core/periods.js';
import { readPlans, limitsStatus, billsStatus, goalsStatus, pendingBillsTotal } from '../js/core/plans.js';

test('corregir el saldo de hoy ajusta el saldo inicial sin crear movimientos', async () => {
  const s = await storeReal();
  const ef = acc(s, 'Efectivo');
  const n = s.state.transactions.length;
  const diff = await s.setAccountBalanceToday(ef, 70000);
  assert.equal(accountBalances(s.state).get(ef), 70000);
  assert.equal(diff, -15000);
  assert.equal(s.state.transactions.length, n);
  assert.equal(await s.setAccountBalanceToday(ef, 70000), 0);
});

test('límites de gasto por categoría en el período', async () => {
  const s = await storeReal();
  await s.savePlan('limite', { category: 'Almuerzos', amount: 100000 });
  await assert.rejects(() => s.savePlan('limite', { category: 'almuerzos', amount: 5000 }), /Ya tienes un límite/);
  await s.addTransaction({ date: HOY, kind: 'gasto', from_account_id: acc(s, 'Efectivo'), category_id: cat(s, 'Almuerzos'), amount: 85000 });
  const p = periodFor(HOY, payDay(s.state.settings));
  const [l] = limitsStatus(s.state, p);
  assert.equal(l.spent, 85000);
  assert.equal(l.status, 'cuidado');
  await s.addTransaction({ date: HOY, kind: 'gasto', from_account_id: acc(s, 'Efectivo'), category_id: cat(s, 'Almuerzos'), amount: 20000, description: 'otro' });
  assert.equal(limitsStatus(s.state, p)[0].status, 'mal');
});

test('pagos fijos: pendiente, vencido y pagado con el mismo nombre', async () => {
  const s = await storeReal();
  await s.savePlan('fijo', { name: 'Internet', amount: 95000, day: 25, category: 'Celular e internet', account: 'Davivienda' });
  await s.savePlan('fijo', { name: 'Arriendo', amount: 800000, day: 5, category: 'Arriendo', account: 'Davivienda' });
  const p = periodFor(HOY, payDay(s.state.settings));   // 20 oct - 19 nov
  let rows = billsStatus(s.state, HOY, p.end);
  const internet = rows.find((b) => b.name === 'Internet');
  const arriendo = rows.find((b) => b.name === 'Arriendo');
  assert.equal(internet.due, '2026-10-25');
  assert.equal(internet.status, 'pronto');
  assert.equal(arriendo.status, 'vencido');
  assert.equal(pendingBillsTotal(s.state, HOY, p.end), 895000);
  await s.addTransaction({ date: HOY, kind: 'gasto', from_account_id: acc(s, 'Davivienda'), category_id: cat(s, 'Arriendo'), amount: 800000, description: 'Arriendo' });
  rows = billsStatus(s.state, HOY, p.end);
  assert.equal(rows.find((b) => b.name === 'Arriendo').status, 'pagado');
  assert.equal(rows.find((b) => b.name === 'Arriendo').due, '2026-11-05');
  assert.equal(pendingBillsTotal(s.state, HOY, p.end), 95000);
});

test('metas de ahorro y renombrar cuentas o categorías actualiza los planes', async () => {
  const s = await storeReal();
  await s.savePlan('meta', { name: 'Viaje', target: 2000000, date: '2027-10-20', account: 'Nu Cajita' });
  let [g] = goalsStatus(s.state, HOY);
  assert.equal(g.current, accountBalances(s.state).get(acc(s, 'Nu Cajita')));
  assert.ok(g.perMonth > 0 && g.months === 12);
  const nu = s.state.accounts.find((a) => a.name === 'Nu Cajita');
  await s.updateAccount(nu.id, { name: 'Nu', type: 'ahorro', opening_balance: nu.opening_balance, opening_date: nu.opening_date });
  [g] = goalsStatus(s.state, HOY);
  assert.equal(g.account, 'Nu');
  assert.ok(g.accountFound);
  await s.savePlan('limite', { category: 'Mercado', amount: 400000 });
  await s.updateCategory(cat(s, 'Mercado'), { name: 'Supermercado', group_name: 'Alimentación' });
  assert.equal(readPlans(s.state.settings).limits[0].category, 'Supermercado');
  const key = readPlans(s.state.settings).limits[0].key;
  await s.deletePlan(key);
  assert.equal(readPlans(s.state.settings).limits.length, 0);
  assert.equal(key in s.state.settings, false);
});

test('los planes caben en la base de datos (máximo 200 caracteres)', async () => {
  const s = await storeReal();
  await s.savePlan('fijo', { name: 'x'.repeat(40), amount: 1, day: 31, category: 'Restaurantes y domicilios', account: 'Davivienda' });
  for (const v of Object.values(s.state.settings)) assert.ok(String(v).length <= 200);
  for (const k of Object.keys(s.state.settings)) assert.ok(k.length <= 40);
});
