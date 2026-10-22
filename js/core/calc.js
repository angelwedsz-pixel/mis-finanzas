// Cálculos financieros puros: no dependen de la pantalla ni de la base de datos.
// Son los mismos de la versión de computador (Python), con las mismas reglas:
//  - Las transferencias entre cuentas propias nunca son gasto ni ingreso.
//  - Ahorro real = lo que entra a cuentas de ahorro desde otras cuentas, menos lo que sale.
//  - La meta de ahorro solo se reserva por la parte que falta.
//  - El salario nunca se suma solo: si no lo anotas, no está en tus saldos.

import { DEFAULT_SETTINGS } from './defaults.js';
import { addDays, diffDays, periodFor, shiftPeriod, shortDate } from './periods.js';

export class ValidationError extends Error {}
export class DuplicateError extends ValidationError {
  constructor(existingId) {
    super('Ya anotaste un movimiento idéntico ese mismo día.');
    this.existingId = existingId;
  }
}

export function settingsWithDefaults(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

// Días de pago según la frecuencia: un número (mensual) o dos días (quincenal).
export function paySchedule(settings) {
  const s = settingsWithDefaults(settings);
  if (s.frecuencia_pago === 'quincenal') {
    const a = parseInt(s.dia_pago_1, 10) || 15, b = parseInt(s.dia_pago_2, 10) || 30;
    return [Math.min(a, b), Math.max(a, b)];
  }
  return parseInt(s.dia_pago, 10) || 30;
}
export const payDay = paySchedule;

export function isBiweekly(settings) {
  return settingsWithDefaults(settings).frecuencia_pago === 'quincenal';
}

// Palabras para mostrar: "mes de pago" o "quincena".
export function periodWords(settings) {
  return isBiweekly(settings)
    ? { one: 'quincena', this: 'Esta quincena', that: 'esa quincena', per: 'cada quincena', closed: 'Quincena cerrada' }
    : { one: 'mes de pago', this: 'Este mes de pago', that: 'ese mes de pago', per: 'cada mes', closed: 'Mes de pago cerrado' };
}

export function validatePaySettings(freq, day, day1, day2) {
  if (freq === 'quincenal') {
    const a = Number(day1), b = Number(day2);
    if (![a, b].every((d) => Number.isInteger(d) && d >= 1 && d <= 31)) throw new ValidationError('Los días de pago deben estar entre 1 y 31.');
    const gap = Math.abs(a - b);
    if (Math.min(gap, 30 - gap) < 10) throw new ValidationError('Los dos días de pago deben estar separados al menos 10 días (por ejemplo 15 y 30).');
    return;
  }
  const d = Number(day);
  if (!(Number.isInteger(d) && d >= 1 && d <= 31)) throw new ValidationError('El día de pago debe estar entre 1 y 31.');
}

// ---------- Saldos ----------

export function accountBalances(state, asOf = null) {
  const bal = new Map(state.accounts.map((a) => [a.id, Number(a.opening_balance) || 0]));
  for (const t of state.transactions) {
    if (asOf && t.date > asOf) continue;
    if (t.to_account_id != null && bal.has(t.to_account_id)) bal.set(t.to_account_id, bal.get(t.to_account_id) + t.amount);
    if (t.from_account_id != null && bal.has(t.from_account_id)) bal.set(t.from_account_id, bal.get(t.from_account_id) - t.amount);
  }
  return bal;
}

export function accountsWithBalance(state, asOf = null) {
  const bal = accountBalances(state, asOf);
  const count = new Map();
  for (const t of state.transactions) {
    for (const id of [t.from_account_id, t.to_account_id]) {
      if (id != null) count.set(id, (count.get(id) || 0) + 1);
    }
  }
  return [...state.accounts]
    .sort((a, b) => (b.active - a.active) || (a.sort_order - b.sort_order) || (a.id - b.id))
    .map((a) => ({ ...a, balance: bal.get(a.id) ?? 0, tx_count: count.get(a.id) || 0 }));
}

export function groupTotals(accounts) {
  let liquid = 0, savings = 0, cardDebt = 0;
  for (const a of accounts) {
    if (a.type === 'banco' || a.type === 'efectivo') liquid += a.balance;
    else if (a.type === 'ahorro') savings += a.balance;
    else if (a.type === 'credito') cardDebt += Math.max(0, -a.balance);
  }
  return { liquid, savings, cardDebt };
}

// ---------- Ahorro, ingresos y gastos ----------

function typeOf(state, id) {
  if (id == null) return null;
  const a = state.accounts.find((x) => x.id === id);
  return a ? a.type : null;
}

export function enrich(state, t) {
  const cat = t.category_id != null ? state.categories.find((c) => c.id === t.category_id) : null;
  const from = t.from_account_id != null ? state.accounts.find((a) => a.id === t.from_account_id) : null;
  const to = t.to_account_id != null ? state.accounts.find((a) => a.id === t.to_account_id) : null;
  return {
    ...t,
    from_type: from?.type ?? null, to_type: to?.type ?? null,
    from_account: from?.name ?? null, to_account: to?.name ?? null,
    category: cat?.name ?? null, category_group: cat?.group_name ?? null,
    system_key: cat?.system_key ?? null,
  };
}

export function isSavingsContribution(kind, fromType, toType) {
  return kind === 'transferencia' && toType === 'ahorro' && fromType !== 'ahorro';
}

export function isSavingsWithdrawal(kind, fromType, toType) {
  if (fromType !== 'ahorro') return false;
  if (kind === 'gasto') return true;
  return kind === 'transferencia' && toType !== 'ahorro';
}

export function savingsFlows(rows) {
  let contributions = 0, withdrawals = 0;
  for (const r of rows) {
    if (isSavingsContribution(r.kind, r.from_type, r.to_type)) contributions += r.amount;
    else if (isSavingsWithdrawal(r.kind, r.from_type, r.to_type)) withdrawals += r.amount;
  }
  return { contributions, withdrawals };
}

export function incomeAndExpenses(rows) {
  let income = 0, expenses = 0;
  for (const r of rows) {
    if (r.kind === 'ingreso') income += r.amount;
    else if (r.kind === 'gasto') expenses += r.amount;
  }
  return { income, expenses };
}

export function savingsGoal(mode, value, salaryReceived, salaryReference) {
  if (mode === 'porcentaje') {
    const base = salaryReceived > 0 ? salaryReceived : salaryReference;
    return Math.round(base * Number(value) / 100);
  }
  return Math.round(Number(value) || 0);
}

export function computeAvailability({ liquid, cardDebt, goal, savedThisPeriod, daysLeft,
  reserveSavings = true, extraGoal = 0 }) {
  const savingsPending = reserveSavings ? Math.max(0, goal - savedThisPeriod) : 0;
  const available = liquid - cardDebt - savingsPending;
  const perDay = daysLeft > 0 ? Math.floor(Math.max(0, available) / daysLeft) : 0;
  const extraSaved = Math.max(0, savedThisPeriod - goal);
  return {
    liquid, cardDebt, savingsGoal: goal, savedThisPeriod, savingsPending, available,
    daysLeft, perDay, extraGoal, extraSaved, extraPending: Math.max(0, extraGoal - extraSaved),
  };
}

// Semáforo: ¿al ritmo actual de gasto alcanza hasta el próximo salario?
export function spendingPace(spent, daysElapsed, daysLeft, available) {
  daysElapsed = Math.max(1, daysElapsed);
  const pace = Math.floor(spent / daysElapsed);
  const projected = available - pace * Math.max(0, daysLeft - 1);
  let status = 'bien';
  if (available < 0 || projected < 0) status = 'mal';
  else if (available > 0 && projected < available * 0.10) status = 'cuidado';
  return { status, dailyPace: pace, projectedLeft: projected, daysElapsed };
}

// ---------- Resumen de un mes de pago ----------

export function transactionsIn(state, start, end) {
  return state.transactions
    .filter((t) => (!start || t.date >= start) && (!end || t.date <= end))
    .map((t) => enrich(state, t));
}

export function periodSummary(state, period, today) {
  const s = settingsWithDefaults(state.settings);
  const isCurrent = period.contains(today);
  const asOf = (isCurrent || period.end >= today) ? null : period.end;
  const accounts = accountsWithBalance(state, asOf);
  const totals = groupTotals(accounts);
  const rows = transactionsIn(state, period.start, period.end);
  const { income, expenses } = incomeAndExpenses(rows);
  const { contributions, withdrawals } = savingsFlows(rows);
  const salaryRows = rows.filter((r) => r.kind === 'ingreso' && r.system_key === 'salario');
  const salaryReceived = salaryRows.reduce((acc, r) => acc + r.amount, 0);
  const goal = savingsGoal(s.ahorro_modo, s.ahorro_valor, salaryReceived, Number(s.salario_referencia) || 0);
  const daysLeft = isCurrent ? period.daysLeft(today) : 0;
  const availability = computeAvailability({
    liquid: totals.liquid, cardDebt: totals.cardDebt, goal,
    savedThisPeriod: contributions - withdrawals, daysLeft,
    reserveSavings: s.reservar_ahorro === '1', extraGoal: Number(s.ahorro_extra_meta) || 0,
  });
  const paceSpent = rows.filter((r) => r.kind === 'gasto' && r.system_key !== 'pago_tarjeta_sin_detalle')
    .reduce((acc, r) => acc + r.amount, 0);
  const lastDay = today < period.end ? today : period.end;
  const pace = spendingPace(paceSpent, diffDays(period.start, lastDay) + 1, Math.max(1, daysLeft), availability.available);

  const byCat = new Map();
  for (const r of rows) {
    if (r.kind !== 'gasto') continue;
    const k = r.category || 'Sin categoría';
    byCat.set(k, (byCat.get(k) || 0) + r.amount);
  }
  const byCategory = [...byCat.entries()].map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    period, isCurrent, accounts, totals, income, expenses, contributions, withdrawals,
    salaryReceived, salaryCount: salaryRows.length, availability, pace, byCategory, txCount: rows.length,
  };
}

export function periodsOverview(state, today, count = 6) {
  const pd = payDay(state.settings);
  const current = periodFor(today, pd);
  let p = shiftPeriod(current, -(count - 1), pd);
  const out = [];
  for (let i = 0; i < count; i++) {
    const rows = transactionsIn(state, p.start, p.end);
    const { income, expenses } = incomeAndExpenses(rows);
    const { contributions, withdrawals } = savingsFlows(rows);
    out.push({ label: shortDate(p.start, today), start: p.start, income, expenses, saved: contributions - withdrawals });
    p = shiftPeriod(p, 1, pd);
  }
  return out;
}

export function savingsHistory(state) {
  const rows = state.transactions.map((t) => enrich(state, t));
  const { contributions, withdrawals } = savingsFlows(rows);
  return { contributions, withdrawals };
}

export function savingsSeries(state) {
  const ids = new Set(state.accounts.filter((a) => a.type === 'ahorro').map((a) => a.id));
  if (!ids.size) return [];
  const accs = state.accounts.filter((a) => ids.has(a.id));
  let running = accs.reduce((acc, a) => acc + (Number(a.opening_balance) || 0), 0);
  const start = accs.map((a) => a.opening_date).sort()[0];
  const deltas = new Map();
  for (const t of state.transactions) {
    const inS = t.to_account_id != null && ids.has(t.to_account_id);
    const outS = t.from_account_id != null && ids.has(t.from_account_id);
    let d = 0;
    if (inS && !outS) d += t.amount;
    if (outS && !inS) d -= t.amount;
    if (d) deltas.set(t.date, (deltas.get(t.date) || 0) + d);
  }
  const points = [{ date: start, balance: running }];
  for (const date of [...deltas.keys()].sort()) {
    running += deltas.get(date);
    if (points.length && points[points.length - 1].date === date) points[points.length - 1].balance = running;
    else points.push({ date, balance: running });
  }
  return points;
}

export function frequentCategories(state, kind, limit, today) {
  const since = addDays(today, -120);
  const counts = new Map();
  for (const t of state.transactions) {
    if (t.date >= since && t.category_id != null) counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1);
  }
  return state.categories
    .filter((c) => c.kind === kind && c.active && c.system_key !== 'pago_tarjeta_sin_detalle')
    .sort((a, b) => ((counts.get(b.id) || 0) - (counts.get(a.id) || 0)) || (a.id - b.id))
    .slice(0, limit)
    .map((c) => c.id);
}

// ---------- Validación de un movimiento ----------

export function validateTransaction(state, tx, editingId = null) {
  const { date, kind } = tx;
  let { amount, from_account_id: fromId, to_account_id: toId, category_id: catId } = tx;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new ValidationError('La fecha no es válida.');
  if (!['ingreso', 'gasto', 'transferencia'].includes(kind)) throw new ValidationError('Tipo de movimiento no válido.');
  amount = Number(amount);
  if (!Number.isInteger(amount)) throw new ValidationError('El valor debe ser un número.');
  if (amount <= 0) throw new ValidationError('El valor debe ser mayor que cero.');

  if (kind === 'ingreso') {
    if (toId == null) throw new ValidationError('Elige la cuenta a la que entra el dinero.');
    fromId = null;
  } else if (kind === 'gasto') {
    if (fromId == null) throw new ValidationError('Elige la cuenta de la que sale el dinero.');
    toId = null;
  } else {
    if (fromId == null || toId == null) throw new ValidationError('Elige de dónde sale y a dónde va el dinero.');
    if (fromId === toId) throw new ValidationError('La cuenta de origen y la de destino deben ser distintas.');
    catId = null;
  }

  const previous = editingId != null ? state.transactions.find((t) => t.id === editingId) : null;
  if (editingId != null && !previous) throw new ValidationError('El movimiento ya no existe.');

  for (const accId of [fromId, toId]) {
    if (accId == null) continue;
    const acc = state.accounts.find((a) => a.id === accId);
    if (!acc) throw new ValidationError('Una de las cuentas no existe.');
    const wasUsed = previous && [previous.from_account_id, previous.to_account_id].includes(accId);
    if (!acc.active && !wasUsed) throw new ValidationError(`La cuenta «${acc.name}» está desactivada.`);
    if (date < acc.opening_date) {
      throw new ValidationError(`La cuenta «${acc.name}» empieza el ${acc.opening_date}: su saldo inicial ya incluye todo lo anterior. Anota solo movimientos desde esa fecha.`);
    }
  }

  if (kind === 'ingreso' || kind === 'gasto') {
    if (catId == null) throw new ValidationError('Elige una categoría.');
    const cat = state.categories.find((c) => c.id === catId);
    if (!cat) throw new ValidationError('La categoría no existe.');
    if (cat.kind !== kind) throw new ValidationError('La categoría no corresponde al tipo de movimiento.');
    if (!cat.active && !(previous && previous.category_id === catId)) {
      throw new ValidationError(`La categoría «${cat.name}» está desactivada.`);
    }
  }

  return {
    date, kind, amount,
    from_account_id: fromId ?? null, to_account_id: toId ?? null, category_id: catId ?? null,
    description: String(tx.description || '').trim().slice(0, 200),
    notes: String(tx.notes || '').trim().slice(0, 1000),
  };
}

export function findDuplicate(state, clean, excludeId = null) {
  const d = state.transactions.find((t) => t.id !== excludeId && t.date === clean.date &&
    t.kind === clean.kind && t.amount === clean.amount &&
    (t.from_account_id ?? null) === clean.from_account_id && (t.to_account_id ?? null) === clean.to_account_id &&
    (t.category_id ?? null) === clean.category_id && (t.description || '') === clean.description);
  return d ? d.id : null;
}

// ---------- Configuración inicial ----------

// Si el salario y el ahorro de hoy YA están incluidos en los saldos, los saldos iniciales
// se fijan al día anterior y esos dos movimientos se anotan hoy (así no se cuenta doble).
export function planInitialBalances(cutoff, balances, salaryToday = 0, savingsToday = 0, bank = null, savings = null) {
  const openings = { ...balances };
  const transactions = [];
  let openingDate = cutoff;
  if (salaryToday || savingsToday) {
    openingDate = addDays(cutoff, -1);
    if (salaryToday) {
      openings[bank] -= salaryToday;
      transactions.push({ kind: 'ingreso', amount: salaryToday, from: null, to: bank, category: 'Salario', description: 'Salario' });
    }
    if (savingsToday) {
      openings[bank] += savingsToday;
      openings[savings] -= savingsToday;
      transactions.push({ kind: 'transferencia', amount: savingsToday, from: bank, to: savings, category: null, description: 'Ahorro del salario' });
    }
  }
  return { openingDate, openings, transactions };
}
