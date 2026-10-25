// Planes: límites de gasto por categoría, pagos fijos (arriendo, servicios…) y metas de ahorro.

import { payDay, periodWords } from '../core/calc.js';
import { periodFor, longDate, todayIso } from '../core/periods.js';
import { limitsStatus, billsStatus, goalsStatus, readPlans } from '../core/plans.js';
import { readMoney } from '../core/money.js';
import { esc, money, moneyInput, bindMoneyInputs, chips, bindChips, formData, toast, openDialog, confirmDialog } from './dom.js';
import { activeAccounts, categoryOptions, errorMessage } from './common.js';
import { saveWithDuplicateCheck } from './home.js';

const TABS = ['Límites', 'Pagos fijos', 'Metas'];

const bar = (pct, status = '') => `<div class="progress ${status}"><div style="width:${Math.min(100, Math.max(0, pct * 100)).toFixed(1)}%"></div></div>`;

function when(b, today) {
  if (b.status === 'pagado') return `Pagado este mes · el próximo es el ${esc(longDate(b.due, { today }))}`;
  if (b.status === 'vencido') return `Venció el ${esc(longDate(b.due, { today }))} (hace ${-b.daysLeft} día${b.daysLeft !== -1 ? 's' : ''})`;
  if (b.daysLeft === 0) return 'Vence hoy';
  return `Vence el ${esc(longDate(b.due, { today }))} (en ${b.daysLeft} día${b.daysLeft !== 1 ? 's' : ''})`;
}

// ---------- Ventanas ----------
function deleteButton(label) { return `<button type="button" class="btn danger block" data-del style="margin-top:8px">${label}</button>`; }

function bindDelete(ctx, d, key, what) {
  d.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`¿Borrar ${what}?`, 'Tus movimientos no se borran; solo este plan.', 'Sí, borrar'))) return;
    try { await ctx.store.deletePlan(key); d.close(); toast('Listo, borrado.'); ctx.rerender(); }
    catch (err) { toast(errorMessage(err), 'err'); }
  });
}

function openLimit(ctx, item = null) {
  const st = ctx.store.state;
  const used = new Set(readPlans(st.settings).limits.filter((l) => l.key !== item?.key).map((l) => l.category.toLowerCase()));
  const cats = categoryOptions(st, 'gasto').filter((c) => !used.has(c.name.toLowerCase()) && c.system_key !== 'pago_tarjeta_sin_detalle');
  const words = periodWords(st.settings);
  const d = openDialog(item ? 'Cambiar límite' : 'Nuevo límite de gasto', `<form id="pf" autocomplete="off">
    <label class="field"><span>Categoría</span><select name="category">${cats.map((c) => `<option ${item && c.name.toLowerCase() === item.category.toLowerCase() ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>¿Cuánto quieres gastar como máximo por ${esc(words.one)}?</span>${moneyInput('amount', item?.amount ?? null, 'Ej: 300.000')}</label>
    <p class="muted small">La app te avisa cuando llegues al 80% y cuando te pases. No bloquea nada.</p>
    <button class="btn primary block">${item ? 'Guardar' : 'Crear límite'}</button>${item ? deleteButton('Borrar límite') : ''}</form>`);
  const form = d.querySelector('#pf');
  bindMoneyInputs(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      await ctx.store.savePlan('limite', { category: f.category, amount: readMoney(f.amount, 'El límite') }, item?.key);
      d.close(); toast('Límite guardado.'); ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
  if (item) bindDelete(ctx, d, item.key, 'este límite');
}

function openBill(ctx, item = null) {
  const st = ctx.store.state;
  const cats = categoryOptions(st, 'gasto');
  const accs = activeAccounts(st, ['banco', 'efectivo', 'credito']);
  const guessCat = item?.category || 'Servicios públicos';
  const d = openDialog(item ? 'Cambiar pago fijo' : 'Nuevo pago fijo', `<form id="pf" autocomplete="off">
    <label class="field"><span>Nombre</span><input type="text" name="name" maxlength="40" value="${esc(item?.name || '')}" placeholder="Ej: Arriendo, Internet, Netflix"></label>
    <div class="grid cols-2 keep">
      <label class="field"><span>Valor</span>${moneyInput('amount', item?.amount ?? null, 'Ej: 80.000')}</label>
      <label class="field"><span>Día del mes que se paga</span><input type="number" name="day" min="1" max="31" inputmode="numeric" value="${item?.day ?? ''}" placeholder="Ej: 5"></label></div>
    <label class="field"><span>Categoría</span><select name="category">${cats.map((c) => `<option ${c.name.toLowerCase() === guessCat.toLowerCase() ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>¿Con qué lo pagas normalmente?</span><select name="account">${accs.map((a) => `<option ${item && a.name.toLowerCase() === item.account.toLowerCase() ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <p class="muted small">Si el mes tiene menos días, se toma el último día del mes.</p>
    <button class="btn primary block">${item ? 'Guardar' : 'Crear pago fijo'}</button>${item ? deleteButton('Borrar pago fijo') : ''}</form>`);
  const form = d.querySelector('#pf');
  bindMoneyInputs(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      await ctx.store.savePlan('fijo', { name: f.name, amount: readMoney(f.amount, 'El valor'), day: Number(f.day), category: f.category, account: f.account }, item?.key);
      d.close(); toast('Pago fijo guardado.'); ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
  if (item) bindDelete(ctx, d, item.key, 'este pago fijo');
}

// "Ya lo pagué": anota el gasto con el nombre del pago fijo, así queda marcado como pagado.
export function openPayBill(ctx, bill) {
  const { store, today } = ctx;
  const st = store.state;
  const accs = activeAccounts(st, ['banco', 'efectivo', 'credito']);
  const cat = st.categories.find((c) => c.kind === 'gasto' && c.name.toLowerCase() === bill.category.toLowerCase())
    || st.categories.find((c) => c.kind === 'gasto' && c.active);
  const acc = accs.find((a) => a.name.toLowerCase() === bill.account.toLowerCase()) || accs[0];
  if (!accs.length || !cat) { toast('Primero crea una cuenta y una categoría de gasto.', 'err'); return; }
  const d = openDialog(`Pagar ${bill.name}`, `<form id="payf" autocomplete="off">
    <label class="field"><span>¿Cuánto pagaste?</span>${moneyInput('amount', bill.amount)}</label>
    ${chips('acc', accs.map((a) => ({ value: String(a.id), label: a.name })), String(acc.id), { label: '¿Con qué pagaste?' })}
    <label class="field"><span>¿Cuándo?</span><input type="date" name="date" value="${today}" max="${today}"></label>
    <p class="muted small">Se anota como un gasto de <b>${esc(cat.name)}</b> llamado <b>${esc(bill.name)}</b>.</p>
    <button class="btn primary block">Anotar pago</button></form>`);
  const form = d.querySelector('#payf');
  bindMoneyInputs(form);
  bindChips(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      await saveWithDuplicateCheck(store, { date: f.date || today, kind: 'gasto', amount: readMoney(f.amount, 'El valor'),
        from_account_id: Number(f.acc), category_id: cat.id, description: bill.name });
      d.close(); toast(`${bill.name}: pago anotado.`); ctx.rerender();
    } catch (err) { if (!err?.cancelled) toast(errorMessage(err), 'err'); }
  };
}

function openGoal(ctx, item = null) {
  const st = ctx.store.state;
  const savings = activeAccounts(st, ['ahorro']);
  const d = openDialog(item ? 'Cambiar meta' : 'Nueva meta de ahorro', `<form id="pf" autocomplete="off">
    <label class="field"><span>¿Para qué ahorras?</span><input type="text" name="name" maxlength="40" value="${esc(item?.name || '')}" placeholder="Ej: Viaje, Fondo de emergencia, Moto"></label>
    <label class="field"><span>¿Cuánto necesitas?</span>${moneyInput('target', item?.target ?? null, 'Ej: 3.000.000')}</label>
    <label class="field"><span>¿Para cuándo? (opcional)</span><input type="date" name="date" value="${esc(item?.date || '')}" min="${todayIso()}"></label>
    <label class="field"><span>¿En qué cuenta la guardas?</span><select name="account">
      <option value="">Todo mi ahorro</option>${savings.map((a) => `<option ${item && a.name.toLowerCase() === item.account.toLowerCase() ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <p class="muted small">El avance es el saldo de esa cuenta. Con fecha, la app te dice cuánto apartar cada mes.</p>
    <button class="btn primary block">${item ? 'Guardar' : 'Crear meta'}</button>${item ? deleteButton('Borrar meta') : ''}</form>`);
  const form = d.querySelector('#pf');
  bindMoneyInputs(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      await ctx.store.savePlan('meta', { name: f.name, target: readMoney(f.target, 'El valor de la meta'), date: f.date, account: f.account }, item?.key);
      d.close(); toast('Meta guardada.'); ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
  if (item) bindDelete(ctx, d, item.key, 'esta meta');
}

// ---------- Pestañas ----------
function limitsHtml(ctx, period) {
  const words = periodWords(ctx.store.state.settings);
  const rows = limitsStatus(ctx.store.state, period);
  const body = rows.length ? `<div class="list">${rows.map((l) => `<button class="item plan" data-key="${esc(l.key)}">
      <span class="main"><span class="row" style="justify-content:space-between"><span class="title">${esc(l.category)}</span>
        <span class="amt ${l.status === 'mal' ? 'neg' : ''}">${money(l.spent)} <span class="muted small">de ${money(l.amount)}</span></span></span>
        ${bar(l.pct, l.status)}
        <span class="meta" style="display:block">${l.left >= 0 ? `Te quedan ${money(l.left)}` : `Te pasaste por ${money(-l.left)}`} · ${Math.round(l.pct * 100)}%</span></span></button>`).join('')}</div>`
    : `<p class="muted">Ponle un tope a lo que más se te va (por ejemplo restaurantes o compras) y la app te avisa antes de pasarte.</p>`;
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">Límites de ${esc(words.this.toLowerCase())}</h3>
    <button class="btn small primary" data-new="limite">Nuevo</button></div>${body}</div>`;
}

function billsHtml(ctx, period) {
  const { today } = ctx;
  const rows = billsStatus(ctx.store.state, today, period.end);
  const pending = rows.filter((b) => b.beforeNextPay);
  const body = rows.length ? `${pending.length ? `<div class="notice warn" style="margin-bottom:10px">Antes de tu próximo pago te faltan <b>${money(pending.reduce((a, b) => a + b.amount, 0))}</b> en pagos fijos.</div>` : ''}
    <div class="list">${rows.map((b) => `<div class="item plan" style="cursor:default">
      <span class="main" data-key="${esc(b.key)}" style="cursor:pointer"><span class="title">${esc(b.name)} · ${money(b.amount)}</span>
        <span class="meta bill-${b.status}" style="display:block">${when(b, today)}</span></span>
      ${b.status === 'pagado' ? '<span class="tag ok">Pagado</span>' : `<button class="btn small ${b.status === 'vencido' || b.status === 'pronto' ? 'primary' : ''}" data-pay="${esc(b.key)}">Ya lo pagué</button>`}</div>`).join('')}</div>`
    : '<p class="muted">Agrega lo que pagas todos los meses (arriendo, servicios, celular, suscripciones). La app te recuerda cuándo vence y cuánto te falta pagar antes del próximo sueldo.</p>';
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">Pagos fijos del mes</h3>
    <button class="btn small primary" data-new="fijo">Nuevo</button></div>${body}</div>`;
}

function goalsHtml(ctx) {
  const rows = goalsStatus(ctx.store.state, ctx.today);
  const body = rows.length ? `<div class="list">${rows.map((g) => `<button class="item plan" data-key="${esc(g.key)}">
      <span class="main"><span class="row" style="justify-content:space-between"><span class="title">${esc(g.name)}</span>
        <span class="amt">${money(g.current)} <span class="muted small">de ${money(g.target)}</span></span></span>
        ${bar(g.pct, g.done ? 'bien' : '')}
        <span class="meta" style="display:block">${g.done ? '¡Meta cumplida!'
          : `${Math.round(g.pct * 100)}% · faltan ${money(g.missing)}${g.perMonth ? (g.late ? ' · la fecha ya pasó' : ` · aparta ${money(g.perMonth)} al mes`) : ''}`}
          ${g.account ? ` · ${esc(g.account)}${g.accountFound ? '' : ' (cuenta no encontrada)'}` : ' · todo tu ahorro'}</span></span></button>`).join('')}</div>`
    : '<p class="muted">Ponle nombre a lo que ahorras (un viaje, un fondo de emergencia) y mira cuánto te falta.</p>';
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">Metas de ahorro</h3>
    <button class="btn small primary" data-new="meta">Nueva</button></div>${body}</div>`;
}

export function renderPlans(ctx) {
  const { store, ui, today, main, params } = ctx;
  const st = store.state;
  if (params.tab && /^[0-2]$/.test(params.tab)) ui.planTab = Number(params.tab);
  const tab = ui.planTab ?? 0;
  const period = periodFor(today, payDay(st.settings));
  const body = tab === 0 ? limitsHtml(ctx, period) : tab === 1 ? billsHtml(ctx, period) : goalsHtml(ctx);
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Planes</div><h1>Organiza tu plata</h1>
    <div class="muted small">Límites por categoría, pagos que se repiten y metas de ahorro.</div></div></div>
    <div class="segmented" id="ptabs">${TABS.map((t, i) => `<button type="button" class="${i === tab ? 'on' : ''}" data-t="${i}">${t}</button>`).join('')}</div>
    ${body}`;
  main.querySelector('#ptabs').onclick = (e) => {
    const b = e.target.closest('button[data-t]');
    if (b) { ui.planTab = Number(b.dataset.t); history.replaceState(null, '', '#/planes'); ctx.params = {}; ctx.rerender(); }
  };
  main.querySelector('[data-new]')?.addEventListener('click', (e) => {
    const k = e.currentTarget.dataset.new;
    if (k === 'limite') openLimit(ctx); else if (k === 'fijo') openBill(ctx); else openGoal(ctx);
  });
  const plans = readPlans(st.settings);
  main.querySelectorAll('[data-key]').forEach((el) => el.addEventListener('click', () => {
    const key = el.dataset.key;
    if (key.startsWith('lim_')) openLimit(ctx, plans.limits.find((x) => x.key === key));
    else if (key.startsWith('fijo_')) openBill(ctx, plans.bills.find((x) => x.key === key));
    else openGoal(ctx, plans.goals.find((x) => x.key === key));
  }));
  main.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () =>
    openPayBill(ctx, billsStatus(st, today).find((x) => x.key === b.dataset.pay))));
}
