// Mis cuentas: saldos, historial por cuenta, agregar, cambiar, desactivar o borrar.

import { ACCOUNT_TYPES } from '../core/defaults.js';
import { accountsWithBalance, enrich } from '../core/calc.js';
import { numericDate } from '../core/periods.js';
import { readMoney, cop } from '../core/money.js';
import { esc, money, moneyInput, bindMoneyInputs, formData, toast, openDialog, confirmDialog } from './dom.js';
import { errorMessage, friendlyType } from './common.js';

function balanceText(a) {
  if (a.type === 'credito') return a.balance <= 0 ? `Debes ${cop(Math.max(0, -a.balance))}` : `A favor ${cop(a.balance)}`;
  return cop(a.balance);
}

function accountForm(acc, today) {
  const type = acc?.type || 'banco';
  const start = acc ? (acc.type === 'credito' ? -acc.opening_balance : acc.opening_balance) : null;
  return `<form id="accf" autocomplete="off">
    <label class="field"><span>Nombre</span><input type="text" name="name" value="${esc(acc?.name || '')}" maxlength="60" placeholder="Ej: Bancolombia"></label>
    <label class="field"><span>¿Qué tipo de cuenta es?</span><select name="type">
      ${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="field"><span data-bal-label>${type === 'credito' ? '¿Cuánto debes en la tarjeta en esa fecha?' : '¿Cuánto tenías en esa fecha?'}</span>
      ${moneyInput('balance', start, '0', 'data-negative="1"')}</label>
    <label class="field"><span>¿Desde qué fecha empiezas a anotar en esta cuenta?</span><input type="date" name="date" value="${acc?.opening_date || today}"></label>
    <p class="muted small">El saldo de esa fecha ya incluye todo lo anterior: no anotes movimientos previos.</p>
    <button class="btn primary block">${acc ? 'Guardar cambios' : 'Crear cuenta'}</button>
    ${acc ? `<button type="button" class="btn block" data-toggle style="margin-top:8px">${acc.active ? 'Desactivar cuenta' : 'Reactivar cuenta'}</button>
      <button type="button" class="btn danger block" data-del style="margin-top:8px">Borrar cuenta</button>` : ''}
  </form>`;
}

function openAccountForm(ctx, acc = null) {
  const { store, today } = ctx;
  const d = openDialog(acc ? 'Cambiar cuenta' : 'Agregar una cuenta', accountForm(acc, today));
  const form = d.querySelector('#accf');
  bindMoneyInputs(form);
  form.type.onchange = () => {
    form.querySelector('[data-bal-label]').textContent = form.type.value === 'credito'
      ? '¿Cuánto debes en la tarjeta en esa fecha?' : '¿Cuánto tenías en esa fecha?';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      const isCard = f.type === 'credito';
      const value = readMoney(f.balance, 'El saldo', { allowZero: true, allowNegative: !isCard });
      const data = { name: f.name, type: f.type, opening_balance: isCard ? -value : value, opening_date: f.date };
      if (acc) await store.updateAccount(acc.id, data); else await store.addAccount(data);
      d.close();
      toast(acc ? 'Cuenta actualizada. Saldos recalculados.' : `Cuenta «${f.name.trim()}» creada.`);
      ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
  form.querySelector('[data-toggle]')?.addEventListener('click', async () => {
    try {
      await store.setAccountActive(acc.id, !acc.active);
      d.close();
      toast(acc.active ? 'Cuenta desactivada. Su historial se conserva.' : 'Cuenta reactivada.');
      ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  });
  form.querySelector('[data-del]')?.addEventListener('click', async () => {
    const n = acc.tx_count;
    const msg = n === 0
      ? `«${acc.name}» no tiene movimientos. Se borrará por completo.`
      : `«${acc.name}» tiene ${n} movimiento${n !== 1 ? 's' : ''}. Se borrarán la cuenta y todos sus movimientos, incluidos los traslados desde o hacia otras cuentas. Esto no se puede deshacer. Si quieres conservar el historial, mejor desactívala.`;
    if (!(await confirmDialog('¿Borrar esta cuenta?', msg, n === 0 ? 'Sí, borrar' : 'Sí, borrar todo'))) return;
    try {
      await store.deleteAccount(acc.id, { withTransactions: true });
      d.close();
      toast(n === 0 ? 'Cuenta borrada.' : `Cuenta borrada junto con ${n} movimiento${n !== 1 ? 's' : ''}.`);
      ctx.rerender();
    }
    catch (err) { toast(errorMessage(err), 'err'); }
  });
}

// Corregir el saldo: escribes cuánto tienes hoy y la app lo deja así, sin crear movimientos.
function openFixBalance(ctx, acc) {
  const { store } = ctx;
  const isCard = acc.type === 'credito';
  const now = isCard ? Math.max(0, -acc.balance) : acc.balance;
  const d = openDialog(`Corregir saldo · ${acc.name}`, `<form id="fixf" autocomplete="off">
    <p class="muted small" style="margin-top:0">Hoy la app calcula <b>${esc(balanceText(acc))}</b>. Si no coincide con lo que ves en tu banco o en tu billetera, escribe la cifra real.</p>
    <label class="field"><span>${isCard ? '¿Cuánto debes hoy en la tarjeta?' : '¿Cuánto tienes hoy en esta cuenta?'}</span>
      ${moneyInput('balance', now, '0', isCard ? '' : 'data-negative="1"')}</label>
    <p class="muted small">No se crea ningún movimiento ni cuenta nueva: se ajusta el saldo inicial para que hoy quede exactamente en esa cifra. Tus movimientos no cambian.</p>
    <button class="btn primary block">Guardar saldo</button></form>`);
  const form = d.querySelector('#fixf');
  bindMoneyInputs(form);
  form.balance.focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const v = readMoney(formData(form).balance, 'El saldo', { allowZero: true, allowNegative: !isCard });
      const diff = await store.setAccountBalanceToday(acc.id, isCard ? -v : v);
      d.close();
      toast(diff === 0 ? 'El saldo ya estaba así.' : `Saldo corregido (${cop(isCard ? -diff : diff, true)}).`);
      ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
}

function openHistory(ctx, acc) {
  const st = ctx.store.state;
  const rows = st.transactions.filter((t) => t.from_account_id === acc.id || t.to_account_id === acc.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  let running = acc.opening_balance;
  const lines = rows.map((t) => {
    const effect = t.to_account_id === acc.id ? t.amount : -t.amount;
    running += effect;
    const r = enrich(st, t);
    return `<tr><td>${numericDate(t.date)}</td><td>${esc(r.description || friendlyType(r))}</td>
      <td class="num">${esc(cop(effect, true))}</td><td class="num">${esc(cop(running))}</td></tr>`;
  }).reverse().join('');
  openDialog(acc.name, `<div class="card tight" style="margin-bottom:12px"><div class="muted small">Saldo de hoy</div>
      <div style="font-size:1.5rem;font-weight:800">${esc(balanceText(acc))}</div></div>
    <div class="grid cols-2 keep" style="margin-bottom:12px">
      <button class="btn primary" data-fix>Corregir saldo</button>
      <button class="btn" data-edit>Cambiar o borrar</button></div>
    <p class="muted small">Saldo inicial el ${numericDate(acc.opening_date)}: <b>${money(acc.opening_balance)}</b></p>
    ${rows.length ? `<div style="overflow-x:auto"><table class="simple"><thead><tr><th>Fecha</th><th>Detalle</th><th class="num">Movimiento</th><th class="num">Saldo</th></tr></thead><tbody>${lines}</tbody></table></div>`
      : '<p class="muted">Esta cuenta aún no tiene movimientos.</p>'}`, (d) => {
    d.querySelector('[data-edit]').onclick = () => { d.close(); openAccountForm(ctx, acc); };
    d.querySelector('[data-fix]').onclick = () => { d.close(); openFixBalance(ctx, acc); };
  });
}

export function renderAccounts(ctx) {
  const { store, main } = ctx;
  const accs = accountsWithBalance(store.state);
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Dinero</div><h1>Mis cuentas</h1>
    <div class="muted small">Toca una cuenta para ver sus movimientos, corregir el saldo, cambiarla o borrarla.</div></div>
    <button class="btn primary" id="add">Agregar cuenta</button></div>
    <div class="grid cols-2">${accs.map((a) => `<button class="card" data-acc="${a.id}" style="text-align:left;cursor:pointer;color:inherit">
      <div class="row" style="justify-content:space-between"><b>${esc(a.name)}</b><span class="muted small">${ACCOUNT_TYPES[a.type]}${a.active ? '' : ' · desactivada'}</span></div>
      <div style="font-size:1.6rem;font-weight:800;margin:8px 0 2px">${esc(balanceText(a))}</div>
      <div class="muted small">Desde el ${numericDate(a.opening_date)} · ${a.tx_count} movimiento${a.tx_count !== 1 ? 's' : ''}</div></button>`).join('')}</div>
    <p class="muted small" style="margin-top:12px">Los saldos se calculan solos a partir del saldo inicial y de lo que anotas. Si alguno no cuadra con tu banco, tócalo y usa <b>Corregir saldo</b> en vez de crear otra cuenta.</p>`;
  main.querySelector('#add').onclick = () => openAccountForm(ctx);
  main.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () =>
    openHistory(ctx, accs.find((a) => a.id === Number(b.dataset.acc)))));
}
