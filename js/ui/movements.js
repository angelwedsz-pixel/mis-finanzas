// Mis movimientos: buscar, filtrar, corregir, borrar y descargar.

import { enrich, incomeAndExpenses, payDay, periodWords } from '../core/calc.js';
import { periodFor, periodsBetween, shortDate } from '../core/periods.js';
import { readMoney } from '../core/money.js';
import { esc, money, moneyInput, bindMoneyInputs, formData, toast, openDialog, confirmDialog, download } from './dom.js';
import { csvExport, errorMessage, friendlyType, sortTx, txList } from './common.js';

export function openTxEditor(ctx, id) {
  const { store } = ctx;
  const st = store.state;
  const tx = st.transactions.find((t) => t.id === id);
  if (!tx) { toast('Ese movimiento ya no existe.', 'err'); return; }
  const r = enrich(st, tx);
  const kinds = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Entre mis cuentas (ahorro, tarjeta, cajero…)' };
  const accOpts = (sel) => st.accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.active ? '' : ' (desactivada)'}</option>`).join('');
  const catOpts = (kind, sel) => st.categories.filter((c) => c.kind === kind)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  const d = openDialog(friendlyType(r), `<form id="edit" autocomplete="off">
    <label class="field"><span>¿Qué fue?</span><select name="kind">${Object.entries(kinds).map(([k, l]) => `<option value="${k}" ${k === tx.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="grid cols-2 keep">
      <label class="field"><span>Valor</span>${moneyInput('amount', tx.amount)}</label>
      <label class="field"><span>Fecha</span><input type="date" name="date" value="${tx.date}"></label></div>
    <label class="field" data-k="from"><span>Sale de</span><select name="from">${accOpts(tx.from_account_id)}</select></label>
    <label class="field" data-k="to"><span>Llega a</span><select name="to">${accOpts(tx.to_account_id)}</select></label>
    <label class="field" data-k="cat-gasto"><span>Categoría</span><select name="cat_gasto">${catOpts('gasto', tx.category_id)}</select></label>
    <label class="field" data-k="cat-ingreso"><span>Categoría</span><select name="cat_ingreso">${catOpts('ingreso', tx.category_id)}</select></label>
    <label class="field"><span>Nota</span><input type="text" name="desc" value="${esc(tx.description)}" maxlength="200"></label>
    <label class="field"><span>Notas adicionales</span><textarea name="notes" maxlength="1000">${esc(tx.notes)}</textarea></label>
    <button class="btn primary block">Guardar cambios</button>
    <button type="button" class="btn danger block" data-del style="margin-top:8px">Borrar este movimiento</button>
  </form>`);
  const form = d.querySelector('#edit');
  bindMoneyInputs(form);
  const sync = () => {
    const k = form.kind.value;
    form.querySelector('[data-k=from]').classList.toggle('hidden', k === 'ingreso');
    form.querySelector('[data-k=to]').classList.toggle('hidden', k === 'gasto');
    form.querySelector('[data-k=cat-gasto]').classList.toggle('hidden', k !== 'gasto');
    form.querySelector('[data-k=cat-ingreso]').classList.toggle('hidden', k !== 'ingreso');
  };
  form.kind.onchange = sync; sync();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      await store.updateTransaction(id, {
        kind: f.kind, date: f.date, amount: readMoney(f.amount),
        from_account_id: f.kind === 'ingreso' ? null : Number(f.from),
        to_account_id: f.kind === 'gasto' ? null : Number(f.to),
        category_id: f.kind === 'gasto' ? Number(f.cat_gasto) : f.kind === 'ingreso' ? Number(f.cat_ingreso) : null,
        description: f.desc, notes: f.notes,
      });
      d.close();
      toast('Listo, corregido. Los saldos ya se actualizaron.');
      ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
  form.querySelector('[data-del]').onclick = async () => {
    if (!(await confirmDialog('¿Borrar este movimiento?', `${friendlyType(r)} de ${money(tx.amount)} del ${shortDate(tx.date, ctx.today)}. No se puede deshacer.`, 'Sí, borrar'))) return;
    try {
      await store.deleteTransaction(id);
      d.close();
      toast('Movimiento borrado. Los saldos ya se actualizaron.');
      ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
}

export function renderMovements(ctx) {
  const { store, ui, today, main } = ctx;
  const st = store.state;
  const pd = payDay(st.settings);
  const first = st.accounts.map((a) => a.opening_date).sort()[0] || today;
  const periods = periodsBetween(first, today, pd).reverse();
  const f = ui.mov ?? (ui.mov = { period: 'actual', text: '', account: '', category: '', kind: '' });

  let start = null, end = null;
  if (f.period === 'actual') { const p = periodFor(today, pd); start = p.start; end = p.end; }
  else if (f.period === 'fechas') { start = f.from || null; end = f.to || null; }
  else if (f.period !== 'todo') { const p = periods.find((x) => x.start === f.period); if (p) { start = p.start; end = p.end; } }

  const text = f.text.trim().toLowerCase();
  let rows = st.transactions.filter((t) => (!start || t.date >= start) && (!end || t.date <= end)
    && (!f.account || t.from_account_id === Number(f.account) || t.to_account_id === Number(f.account))
    && (!f.category || t.category_id === Number(f.category))
    && (!f.kind || t.kind === f.kind)
    && (!text || (t.description || '').toLowerCase().includes(text) || (t.notes || '').toLowerCase().includes(text)));
  rows = sortTx(rows);
  const { income, expenses } = incomeAndExpenses(rows);

  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Historial</div><h1>Mis movimientos</h1>
    <div class="muted small">Toca un movimiento para corregirlo o borrarlo.</div></div></div>
    <div class="card" style="margin-bottom:14px"><form id="filters" autocomplete="off">
      <div class="grid cols-2">
        <label class="field"><span>¿Qué fechas?</span><select name="period">
          <option value="actual" ${f.period === 'actual' ? 'selected' : ''}>${periodWords(st.settings).this}</option>
          <option value="todo" ${f.period === 'todo' ? 'selected' : ''}>Todo</option>
          <option value="fechas" ${f.period === 'fechas' ? 'selected' : ''}>Elegir fechas</option>
          ${periods.slice(1).map((p) => `<option value="${p.start}" ${f.period === p.start ? 'selected' : ''}>${esc(shortDate(p.start, today))} – ${esc(shortDate(p.end, today))}</option>`).join('')}
        </select></label>
        <label class="field"><span>Buscar</span><input type="search" name="text" value="${esc(f.text)}" placeholder="Ej: almuerzo"></label>
      </div>
      <div class="grid cols-2 keep ${f.period === 'fechas' ? '' : 'hidden'}">
        <label class="field"><span>Desde</span><input type="date" name="from" value="${esc(f.from || '')}"></label>
        <label class="field"><span>Hasta</span><input type="date" name="to" value="${esc(f.to || today)}"></label></div>
      <details ${f.account || f.category || f.kind ? 'open' : ''}><summary class="muted small" style="cursor:pointer;margin-bottom:10px">Más filtros</summary>
        <div class="grid cols-3">
          <label class="field"><span>Cuenta</span><select name="account"><option value="">Todas</option>
            ${st.accounts.map((a) => `<option value="${a.id}" ${String(a.id) === f.account ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Categoría</span><select name="category"><option value="">Todas</option>
            ${st.categories.map((c) => `<option value="${c.id}" ${String(c.id) === f.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Tipo</span><select name="kind"><option value="">Todos</option>
            <option value="gasto" ${f.kind === 'gasto' ? 'selected' : ''}>Gastos</option>
            <option value="ingreso" ${f.kind === 'ingreso' ? 'selected' : ''}>Ingresos</option>
            <option value="transferencia" ${f.kind === 'transferencia' ? 'selected' : ''}>Ahorros y entre cuentas</option></select></label>
        </div></details>
    </form></div>
    <div class="grid cols-3" style="margin-bottom:14px">
      <div class="card tight metric"><div class="label">Te entró</div><div class="value">${money(income)}</div></div>
      <div class="card tight metric"><div class="label">Gastaste</div><div class="value">${money(expenses)}</div></div>
      <div class="card tight metric"><div class="label">Movimientos</div><div class="value">${rows.length}</div></div>
    </div>
    <div class="card">${rows.length ? txList(st, rows, { today }) : '<p class="muted">No hay movimientos para mostrar. Prueba con otras fechas o borra la búsqueda.</p>'}</div>
    ${rows.length ? '<button class="btn block" id="csv" style="margin-top:12px">Descargar en Excel (CSV)</button>' : ''}`;

  const form = main.querySelector('#filters');
  let timer = null;
  const apply = () => {
    const v = formData(form);
    ui.mov = { period: v.period, text: v.text || '', account: v.account || '', category: v.category || '',
      kind: v.kind || '', from: v.from, to: v.to };
    const pos = form.text.selectionStart;
    const focusText = document.activeElement === form.text;
    ctx.rerender();
    if (focusText) { const t = main.querySelector('#filters [name=text]'); t.focus(); t.setSelectionRange(pos, pos); }
  };
  form.addEventListener('change', apply);
  form.text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(apply, 350); });
  form.onsubmit = (e) => { e.preventDefault(); apply(); };
  main.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => openTxEditor(ctx, Number(b.dataset.tx))));
  main.querySelector('#csv')?.addEventListener('click', () => {
    download(`movimientos_${today}.csv`, csvExport(st, rows), 'text/csv;charset=utf-8');
  });
}
