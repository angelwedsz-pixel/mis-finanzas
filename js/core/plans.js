// Planes: límites de gasto por categoría, pagos fijos y metas de ahorro.
//
// Se guardan como ajustes (tabla settings), uno por registro, así no hace falta cambiar la base
// de datos. Cada clave lleva un prefijo y un código corto; el valor es un JSON pequeño:
//   lim_xxxx  -> {"c":"Almuerzos","m":300000}                         límite por período de pago
//   fijo_xxxx -> {"n":"Arriendo","m":800000,"d":5,"c":"Arriendo","a":"Davivienda"}
//   meta_xxxx -> {"n":"Viaje","m":2000000,"f":"2027-06-30","a":"Nu Cajita"}
// Las categorías y cuentas se guardan por nombre (no por número) para que sigan funcionando
// después de restaurar una copia, donde los números cambian.

import { ValidationError, accountBalances, transactionsIn } from './calc.js';
import { payDate, parts, diffDays } from './periods.js';

export const PLAN_PREFIX = { limite: 'lim_', fijo: 'fijo_', meta: 'meta_' };
const MAX_VALUE = 200;   // largo máximo de un ajuste en la base de datos

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function newPlanKey(kind) {
  const prefix = PLAN_PREFIX[kind];
  if (!prefix) throw new Error('Tipo de plan no válido.');
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
}

function parse(value) {
  try { const v = JSON.parse(value); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

// Lee todos los planes guardados en los ajustes.
export function readPlans(settings = {}) {
  const limits = [], bills = [], goals = [];
  for (const [key, value] of Object.entries(settings)) {
    const v = key.startsWith('lim_') || key.startsWith('fijo_') || key.startsWith('meta_') ? parse(value) : null;
    if (!v) continue;
    if (key.startsWith('lim_')) limits.push({ key, category: String(v.c || ''), amount: Number(v.m) || 0 });
    else if (key.startsWith('fijo_')) {
      bills.push({ key, name: String(v.n || ''), amount: Number(v.m) || 0, day: Number(v.d) || 1,
        category: String(v.c || ''), account: String(v.a || '') });
    } else {
      goals.push({ key, name: String(v.n || ''), target: Number(v.m) || 0, date: v.f || '', account: String(v.a || '') });
    }
  }
  limits.sort((a, b) => a.category.localeCompare(b.category));
  bills.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  goals.sort((a, b) => a.name.localeCompare(b.name));
  return { limits, bills, goals };
}

function encode(obj) {
  const text = JSON.stringify(obj);
  if (text.length > MAX_VALUE) throw new ValidationError('El nombre es demasiado largo. Usa uno más corto.');
  return text;
}

function cleanName(name, what) {
  const n = String(name || '').trim();
  if (!n) throw new ValidationError(`Escribe un nombre para ${what}.`);
  if (n.length > 40) throw new ValidationError('El nombre es demasiado largo (máximo 40 caracteres).');
  return n;
}

function positive(amount, what) {
  const m = Math.round(Number(amount));
  if (!(m > 0)) throw new ValidationError(`${what} debe ser mayor que cero.`);
  if (m > 1e12) throw new ValidationError(`${what} es demasiado grande.`);
  return m;
}

// Valida y convierte un plan a texto para guardarlo. kind: 'limite' | 'fijo' | 'meta'.
export function encodePlan(kind, data, state, ownKey = null) {
  const { limits } = readPlans(state.settings);
  if (kind === 'limite') {
    const cat = state.categories.find((c) => c.kind === 'gasto' && same(c.name, data.category));
    if (!cat) throw new ValidationError('Elige una categoría de gasto.');
    if (limits.some((l) => l.key !== ownKey && same(l.category, cat.name))) {
      throw new ValidationError(`Ya tienes un límite para «${cat.name}». Tócalo para cambiarlo.`);
    }
    return encode({ c: cat.name, m: positive(data.amount, 'El límite') });
  }
  if (kind === 'fijo') {
    const day = Number(data.day);
    if (!(Number.isInteger(day) && day >= 1 && day <= 31)) throw new ValidationError('El día de pago debe estar entre 1 y 31.');
    const cat = state.categories.find((c) => c.kind === 'gasto' && same(c.name, data.category));
    if (!cat) throw new ValidationError('Elige la categoría del pago.');
    const acc = state.accounts.find((a) => same(a.name, data.account));
    if (!acc) throw new ValidationError('Elige con qué cuenta lo pagas normalmente.');
    return encode({ n: cleanName(data.name, 'el pago'), m: positive(data.amount, 'El valor'), d: day, c: cat.name, a: acc.name });
  }
  if (kind === 'meta') {
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new ValidationError('La fecha de la meta no es válida.');
    const acc = data.account ? state.accounts.find((a) => a.type === 'ahorro' && same(a.name, data.account)) : null;
    if (data.account && !acc) throw new ValidationError('Elige una cuenta de ahorro.');
    return encode({ n: cleanName(data.name, 'la meta'), m: positive(data.target, 'El valor de la meta'),
      ...(data.date ? { f: data.date } : {}), ...(acc ? { a: acc.name } : {}) });
  }
  throw new Error('Tipo de plan no válido.');
}

// Cuando se renombra una categoría o una cuenta, los planes que la usan se actualizan.
// Devuelve los ajustes que hay que guardar ({clave: valor}).
export function renameInPlans(settings, field, oldName, newName) {
  if (oldName === newName) return {};
  const out = {};
  const fields = field === 'category' ? ['c'] : ['a'];
  for (const [key, value] of Object.entries(settings)) {
    if (!/^(lim_|fijo_|meta_)/.test(key)) continue;
    const v = parse(value);
    if (!v) continue;
    let changed = false;
    for (const f of fields) if (v[f] && same(v[f], oldName)) { v[f] = newName; changed = true; }
    if (changed) { const text = JSON.stringify(v); if (text.length <= MAX_VALUE) out[key] = text; }
  }
  return out;
}

// ---------- Límites de gasto ----------
export function limitsStatus(state, period) {
  const rows = transactionsIn(state, period.start, period.end).filter((r) => r.kind === 'gasto');
  return readPlans(state.settings).limits.map((l) => {
    const spent = rows.filter((r) => same(r.category, l.category)).reduce((acc, r) => acc + r.amount, 0);
    const pct = l.amount > 0 ? spent / l.amount : 0;
    return { ...l, spent, left: l.amount - spent, pct, status: pct > 1 ? 'mal' : pct >= 0.8 ? 'cuidado' : 'bien' };
  });
}

// ---------- Pagos fijos ----------
function monthOf(date, delta = 0) {
  const { y, m } = parts(date);
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

// Un pago fijo cuenta como pagado en un mes si ese mes hay un gasto con el mismo nombre
// (así lo deja anotado el botón "Ya lo pagué").
function paidIn(state, bill, y, m) {
  const start = payDate(y, m, 1), end = payDate(y, m, 31);
  return state.transactions.find((t) => t.kind === 'gasto' && t.date >= start && t.date <= end && same(t.description, bill.name)) || null;
}

export function billsStatus(state, today, periodEnd = null) {
  return readPlans(state.settings).bills.map((b) => {
    const cur = monthOf(today);
    const dueThisMonth = payDate(cur.y, cur.m, b.day);
    const paidTx = paidIn(state, b, cur.y, cur.m);
    let due, status;
    if (paidTx) {
      const nx = monthOf(today, 1);
      due = payDate(nx.y, nx.m, b.day);
      status = 'pagado';
    } else {
      due = dueThisMonth;
      const days = diffDays(today, due);
      status = days < 0 ? 'vencido' : days <= 5 ? 'pronto' : 'pendiente';
    }
    const daysLeft = diffDays(today, due);
    const beforeNextPay = !paidTx && (!periodEnd || due <= periodEnd);
    return { ...b, due, daysLeft, status, paidTx, beforeNextPay };
  });
}

// Suma de pagos fijos sin pagar que vencen antes del próximo pago (o ya vencidos).
export function pendingBillsTotal(state, today, periodEnd) {
  return billsStatus(state, today, periodEnd).filter((b) => b.beforeNextPay).reduce((acc, b) => acc + b.amount, 0);
}

// ---------- Metas de ahorro ----------
export function goalsStatus(state, today) {
  const bal = accountBalances(state);
  const savingsAccs = state.accounts.filter((a) => a.type === 'ahorro');
  return readPlans(state.settings).goals.map((g) => {
    const acc = g.account ? savingsAccs.find((a) => same(a.name, g.account)) : null;
    const current = acc ? bal.get(acc.id) || 0 : savingsAccs.reduce((s, a) => s + (bal.get(a.id) || 0), 0);
    const missing = Math.max(0, g.target - current);
    let months = null, perMonth = null, late = false;
    if (g.date && missing > 0) {
      const days = diffDays(today, g.date);
      late = days < 0;
      months = Math.max(1, Math.ceil(days / 30.44));
      perMonth = late ? missing : Math.ceil(missing / months / 1000) * 1000;
    }
    return { ...g, accountFound: !g.account || !!acc, current, missing, pct: g.target > 0 ? Math.min(1, Math.max(0, current / g.target)) : 0,
      done: missing === 0, months, perMonth, late };
  });
}
