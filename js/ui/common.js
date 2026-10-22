// Piezas que comparten varias pantallas.

import { cop } from '../core/money.js';
import { enrich, ValidationError, DuplicateError } from '../core/calc.js';
import { esc, icon, money } from './dom.js';
import { numericDate, shortDate } from '../core/periods.js';

export function friendlyType(r) {
  if (r.kind === 'ingreso') return 'Ingreso';
  if (r.kind === 'gasto') return 'Gasto';
  if (r.to_type === 'ahorro' && r.from_type !== 'ahorro') return 'Ahorro';
  if (r.from_type === 'ahorro' && r.to_type !== 'ahorro') return 'Retiro de ahorro';
  if (r.to_type === 'credito') return 'Pago de tarjeta';
  return 'Entre mis cuentas';
}

const TYPE_ICON = { 'Ingreso': 'in', 'Gasto': 'out', 'Ahorro': 'pig', 'Retiro de ahorro': 'unlock',
  'Pago de tarjeta': 'card', 'Entre mis cuentas': 'swap' };

export function txRow(state, t) {
  const r = enrich(state, t);
  const type = friendlyType(r);
  const title = r.description || r.category || type;
  const where = r.kind === 'transferencia' ? `${r.from_account} → ${r.to_account}` : (r.kind === 'gasto' ? r.from_account : r.to_account);
  const meta = [r.category && r.category !== title ? r.category : (r.kind === 'transferencia' ? type : null), where]
    .filter(Boolean).join(' · ');
  const cls = r.kind === 'gasto' ? 'neg' : r.kind === 'ingreso' ? 'pos' : 'neu';
  const sign = r.kind === 'gasto' ? '− ' : r.kind === 'ingreso' ? '+ ' : '';
  return `<button class="item" data-tx="${r.id}">
    <span class="ico">${icon(TYPE_ICON[type])}</span>
    <span class="main"><span class="title">${esc(title)}</span><span class="meta" style="display:block">${esc(meta)}</span></span>
    <span class="amt ${cls}">${sign}${money(r.amount)}</span></button>`;
}

export function txList(state, rows, { groupByDay = true, today } = {}) {
  if (!rows.length) return '';
  let html = '', lastDay = null;
  for (const t of rows) {
    if (groupByDay && t.date !== lastDay) {
      html += `<div class="day-head">${esc(shortDate(t.date, today))}</div>`;
      lastDay = t.date;
    }
    html += txRow(state, t);
  }
  return `<div class="list">${html}</div>`;
}

export function sortTx(rows) {
  return [...rows].sort((a, b) => (b.date.localeCompare(a.date)) || (b.id - a.id));
}

export function activeAccounts(state, types = null) {
  return state.accounts.filter((a) => a.active && (!types || types.includes(a.type)))
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
}

export function categoryOptions(state, kind) {
  return state.categories.filter((c) => c.kind === kind && c.active)
    .sort((a, b) => a.group_name.localeCompare(b.group_name) || a.name.localeCompare(b.name));
}

export function errorMessage(e) {
  if (e instanceof DuplicateError || e instanceof ValidationError) return e.message;
  return e?.message || 'Ocurrió un error. Intenta de nuevo.';
}

export function csvExport(state, rows) {
  const head = ['Fecha', 'Tipo', 'Descripción', 'Grupo', 'Categoría', 'Desde', 'Hacia', 'Valor', 'Notas'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(';')];
  for (const t of rows) {
    const r = enrich(state, t);
    lines.push([numericDate(r.date), friendlyType(r), r.description, r.category_group, r.category,
      r.from_account, r.to_account, r.amount, r.notes].map(q).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

export const copPlain = cop;
