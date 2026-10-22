// Arma los datos iniciales (cuentas, categorías, movimientos de hoy y ajustes) en el formato
// que recibe replace_all_data. Los ids son locales: la base de datos los cambia por los suyos.

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, ACCOUNT_TYPES } from './defaults.js';
import { planInitialBalances } from './calc.js';

export function buildInitialPayload({ cutoff, accounts, salaryToday = 0, savingsToday = 0,
  bank = null, savings = null, settings = {} }) {
  const names = accounts.map((a) => a.name.trim());
  if (!accounts.length) throw new Error('Agrega al menos una cuenta.');
  if (names.some((n) => !n)) throw new Error('Todas las cuentas necesitan un nombre.');
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new Error('Hay dos cuentas con el mismo nombre.');
  if (accounts.some((a) => !ACCOUNT_TYPES[a.type])) throw new Error('Elige el tipo de cada cuenta.');
  if (!accounts.some((a) => a.type === 'banco' || a.type === 'efectivo')) {
    throw new Error('Agrega al menos una cuenta de banco o de efectivo.');
  }
  if (salaryToday && !names.includes(bank)) throw new Error('Elige la cuenta donde llegó el salario.');
  if (savingsToday && (!names.includes(bank) || !names.includes(savings) || bank === savings)) {
    throw new Error('Elige de qué cuenta y a qué cuenta de ahorro pasaste dinero hoy.');
  }

  const balances = Object.fromEntries(accounts.map((a) => [a.name.trim(), Number(a.balance) || 0]));
  const plan = planInitialBalances(cutoff, balances, salaryToday, savingsToday, bank, savings);

  const accRows = accounts.map((a, i) => ({
    id: i + 1, name: a.name.trim(), type: a.type, opening_balance: plan.openings[a.name.trim()],
    opening_date: plan.openingDate, active: true, sort_order: i + 1,
  }));
  const catRows = DEFAULT_CATEGORIES.map(([name, group_name, kind, system_key], i) => ({
    id: 1000 + i, name, group_name, kind, system_key, active: true,
  }));
  const accId = (n) => accRows.find((a) => a.name === n)?.id ?? null;
  const catId = (n) => catRows.find((c) => c.name === n)?.id ?? null;
  const txRows = plan.transactions.map((t) => ({
    date: cutoff, kind: t.kind, amount: t.amount, from_account_id: t.from ? accId(t.from) : null,
    to_account_id: t.to ? accId(t.to) : null, category_id: t.category ? catId(t.category) : null,
    description: t.description, notes: '',
  }));
  const allSettings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(settings)) allSettings[k] = String(v);
  allSettings.configurado = '1';
  return { accounts: accRows, categories: catRows, transactions: txRows, settings: allSettings };
}
