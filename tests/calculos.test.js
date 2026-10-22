import test from 'node:test';
import assert from 'node:assert/strict';
import { accountsWithBalance, computeAvailability, periodSummary, savingsGoal, spendingPace,
  periodsOverview, savingsSeries, savingsHistory, frequentCategories, payDay, DuplicateError } from '../js/core/calc.js';
import { periodFor } from '../js/core/periods.js';
import { cop, parseCop, readMoney } from '../js/core/money.js';
import { storeReal, HOY, acc, cat } from './helpers.js';

const saldo = (s, n) => accountsWithBalance(s.state).find((a) => a.name === n).balance;
const resumen = (s, d = HOY) => periodSummary(s.state, periodFor(d, payDay(s.state.settings)), d);

test('configuración inicial no duplica el ahorro', async () => {
  const s = await storeReal();
  assert.equal(saldo(s, 'Davivienda'), 1900000);
  assert.equal(saldo(s, 'Nu Cajita'), 710354);
  assert.equal(saldo(s, 'Efectivo'), 85000);
  const r = resumen(s);
  assert.equal(r.salaryReceived, 2236000); assert.equal(r.contributions, 368000); assert.equal(r.expenses, 0);
});

test('disponible real del 20 de octubre', async () => {
  const r = resumen(await storeReal());
  const av = r.availability;
  assert.equal(av.liquid, 1985000); assert.equal(av.savingsPending, 0); assert.equal(av.available, 1985000);
  assert.equal(av.daysLeft, 31); assert.equal(av.perDay, 64032);
  assert.equal(av.extraSaved, 68000); assert.equal(av.extraPending, 132000);
});

test('transferencia no es gasto ni ingreso', async () => {
  const s = await storeReal();
  await s.addTransaction({ date: HOY, kind: 'transferencia', amount: 100000, from_account_id: acc(s, 'Davivienda'), to_account_id: acc(s, 'Nu Cajita') });
  assert.equal(saldo(s, 'Davivienda'), 1800000); assert.equal(saldo(s, 'Nu Cajita'), 810354);
  const r = resumen(s);
  assert.equal(r.expenses, 0); assert.equal(r.income, 2236000); assert.equal(r.contributions, 468000);
});

test('compra con tarjeta y pago se cuentan una sola vez', async () => {
  const s = await storeReal();
  const card = (await s.addAccount({ name: 'Visa', type: 'credito', opening_balance: -200000, opening_date: HOY })).id;
  await s.addTransaction({ date: HOY, kind: 'gasto', amount: 60000, from_account_id: card, category_id: cat(s, 'Gasolina') });
  assert.equal(saldo(s, 'Visa'), -260000);
  assert.equal(resumen(s).totals.cardDebt, 260000);
  await s.addTransaction({ date: HOY, kind: 'transferencia', amount: 260000, from_account_id: acc(s, 'Davivienda'), to_account_id: card });
  const r = resumen(s);
  assert.equal(saldo(s, 'Visa'), 0); assert.equal(saldo(s, 'Davivienda'), 1640000);
  assert.equal(r.expenses, 60000); assert.equal(r.totals.cardDebt, 0); assert.equal(r.contributions, 368000);
});

test('retiro de ahorro reduce el ahorro', async () => {
  const s = await storeReal();
  await s.addTransaction({ date: HOY, kind: 'transferencia', amount: 50000, from_account_id: acc(s, 'Nu Cajita'), to_account_id: acc(s, 'Efectivo') });
  const r = resumen(s);
  assert.equal(r.withdrawals, 50000); assert.equal(r.availability.savedThisPeriod, 318000);
  assert.deepEqual(savingsHistory(s.state), { contributions: 368000, withdrawals: 50000 });
});

test('validaciones y duplicados', async () => {
  const s = await storeReal();
  const e = acc(s, 'Efectivo'), al = cat(s, 'Almuerzos');
  await assert.rejects(s.addTransaction({ date: HOY, kind: 'gasto', amount: 0, from_account_id: e, category_id: al }), /mayor que cero/);
  await assert.rejects(s.addTransaction({ date: HOY, kind: 'transferencia', amount: 10, from_account_id: e, to_account_id: e }), /distintas/);
  await assert.rejects(s.addTransaction({ date: HOY, kind: 'gasto', amount: 10, from_account_id: e, category_id: cat(s, 'Salario') }), /no corresponde/);
  await assert.rejects(s.addTransaction({ date: '2026-10-01', kind: 'gasto', amount: 10, from_account_id: e, category_id: al }), /empieza/);
  await s.addTransaction({ date: HOY, kind: 'gasto', amount: 15000, from_account_id: e, category_id: al, description: 'almuerzo' });
  await assert.rejects(s.addTransaction({ date: HOY, kind: 'gasto', amount: 15000, from_account_id: e, category_id: al, description: 'almuerzo' }), DuplicateError);
  await s.addTransaction({ date: HOY, kind: 'gasto', amount: 15000, from_account_id: e, category_id: al, description: 'almuerzo' }, { allowDuplicate: true });
  assert.equal(saldo(s, 'Efectivo'), 55000);
});

test('editar y borrar recalcula', async () => {
  const s = await storeReal();
  const t = await s.addTransaction({ date: HOY, kind: 'gasto', amount: 15000, from_account_id: acc(s, 'Efectivo'), category_id: cat(s, 'Almuerzos') });
  await s.updateTransaction(t.id, { date: HOY, kind: 'transferencia', amount: 20000, from_account_id: acc(s, 'Davivienda'), to_account_id: acc(s, 'Efectivo') });
  assert.equal(resumen(s).expenses, 0); assert.equal(saldo(s, 'Efectivo'), 105000);
  await s.deleteTransaction(t.id);
  assert.equal(saldo(s, 'Davivienda'), 1900000); assert.equal(saldo(s, 'Efectivo'), 85000);
});

test('salario no se suma solo y saldos no se reinician', async () => {
  const r = resumen(await storeReal(), '2026-11-20');
  assert.equal(r.salaryCount, 0); assert.equal(r.totals.liquid, 1985000); assert.equal(r.availability.savingsPending, 300000);
});

test('meta en porcentaje y ajustes', async () => {
  assert.equal(savingsGoal('porcentaje', 15, 2236000, 2250000), 335400);
  assert.equal(savingsGoal('porcentaje', 15, 0, 2250000), 337500);
  const s = await storeReal();
  await s.setSettings({ ahorro_modo: 'porcentaje', ahorro_valor: '20' });
  const r = resumen(s);
  assert.equal(r.availability.savingsGoal, 447200); assert.equal(r.availability.savingsPending, 79200);
});

test('semáforo', () => {
  assert.equal(spendingPace(0, 1, 31, 1900000).status, 'bien');
  assert.equal(spendingPace(300000, 10, 21, 500000).status, 'mal');
  assert.equal(spendingPace(300000, 10, 21, 640000).status, 'cuidado');
  assert.equal(spendingPace(0, 1, 10, -1).status, 'mal');
  const a = computeAvailability({ liquid: 2000000, cardDebt: 0, goal: 300000, savedThisPeriod: 100000, daysLeft: 20 });
  assert.equal(a.available, 1800000); assert.equal(a.perDay, 90000);
});

test('resumen por períodos, serie de ahorro y frecuentes', async () => {
  const s = await storeReal();
  const o = periodsOverview(s.state, HOY, 3);
  assert.deepEqual(o.map((x) => x.income), [0, 0, 2236000]);
  const serie = savingsSeries(s.state);
  assert.equal(serie[0].balance, 342354); assert.equal(serie.at(-1).balance, 710354);
  for (let i = 0; i < 3; i++) await s.addTransaction({ date: HOY, kind: 'gasto', amount: 1000 + i, from_account_id: acc(s, 'Efectivo'), category_id: cat(s, 'Parqueadero') });
  assert.equal(frequentCategories(s.state, 'gasto', 3, HOY)[0], cat(s, 'Parqueadero'));
});

test('copia exportada se restaura igual', async () => {
  const s = await storeReal();
  await s.addTransaction({ date: HOY, kind: 'gasto', amount: 15000, from_account_id: acc(s, 'Efectivo'), category_id: cat(s, 'Almuerzos') });
  const copia = JSON.parse(JSON.stringify(s.exportData()));
  await s.addTransaction({ date: HOY, kind: 'gasto', amount: 500000, from_account_id: acc(s, 'Davivienda'), category_id: cat(s, 'Imprevistos') });
  await s.replaceAll(copia);
  assert.equal(saldo(s, 'Davivienda'), 1900000); assert.equal(saldo(s, 'Efectivo'), 70000);
  assert.equal(s.state.transactions.length, 3);
});

test('formato de pesos', () => {
  assert.equal(cop(1900000), '$1.900.000'); assert.equal(cop(-50000), '-$50.000'); assert.equal(cop(0), '$0');
  assert.equal(parseCop('$1.900.000'), 1900000); assert.equal(parseCop('15000'), 15000);
  assert.throws(() => parseCop('abc'));
  assert.throws(() => readMoney('', 'El valor'), /escribe cuánto/);
});
