// Primera vez: tus cuentas, cuánto tienes hoy y tu salario. También permite traer los
// datos de la versión de computador.

import { ACCOUNT_TYPES } from '../core/defaults.js';
import { buildInitialPayload } from '../core/setup.js';
import { validatePaySettings } from '../core/calc.js';
import { readMoney } from '../core/money.js';
import { esc, moneyInput, bindMoneyInputs, formData, toast } from './dom.js';
import { errorMessage } from './common.js';
import { readComputerBackup, readJsonBackup, describe } from '../data/importar.js';

const w = { step: 1, accounts: null };

function accountRow(a, i) {
  return `<div class="acc-row" data-row="${i}">
    <label class="field full"><span>Nombre de la cuenta</span><input type="text" name="name_${i}" value="${esc(a.name)}" maxlength="60" placeholder="Ej: Bancolombia"></label>
    <label class="field"><span>Tipo</span><select name="type_${i}">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${k === a.type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="field"><span>${a.type === 'credito' ? 'Debes hoy' : 'Tienes hoy'}</span>${moneyInput(`bal_${i}`, a.balance || null, '0')}</label>
    <button type="button" class="link full" data-remove="${i}" style="text-align:left">Quitar esta cuenta</button></div>`;
}

function readAccounts(form) {
  const f = formData(form);
  const out = [];
  form.querySelectorAll('[data-row]').forEach((row) => {
    const i = row.dataset.row;
    out.push({ name: (f[`name_${i}`] || '').trim(), type: f[`type_${i}`], balanceText: f[`bal_${i}`] || '' });
  });
  return out;
}

export function renderWizard(ctx) {
  const { main, today, store } = ctx;
  if (!w.accounts) w.accounts = [{ name: 'Banco', type: 'banco', balance: 0 }, { name: 'Efectivo', type: 'efectivo', balance: 0 }, { name: 'Ahorro', type: 'ahorro', balance: 0 }];
  const bar = (n) => `<div class="muted small">Paso ${n} de 3</div><div class="steps"><div style="width:${n / 3 * 100}%"></div></div>`;

  if (w.step === 1) {
    main.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto">${bar(1)}
      <h1>Bienvenido a Mis finanzas</h1>
      <p class="muted">Te ayuda a saber <b>cuánto puedes gastar hasta tu próximo pago</b>, sin hojas de cálculo.</p>
      <ul class="muted" style="line-height:1.8;padding-left:20px"><li>Anotas tus gastos en segundos.</li><li>Una tarjeta te dice si vas bien.</li>
        <li>Ves cuánto llevas ahorrado.</li><li>Tus datos están protegidos con tu usuario y contraseña.</li></ul>
      <button class="btn primary block" id="go">Empezar</button>
      <div class="spacer"></div>
      <details><summary class="muted small" style="cursor:pointer">¿Ya usabas la versión de computador o tienes una copia?</summary>
        <p class="muted small">Elige el archivo <b>finanzas.db</b> de la app de computador (carpeta <i>data</i>) o una copia .json de esta app. Se lee sin modificarlo.</p>
        <input type="file" id="imp" class="hidden" accept=".db,.json,application/json,application/octet-stream">
        <button class="btn block" id="imp-btn">Traer mis datos…</button></details></div>`;
    main.querySelector('#go').onclick = () => { w.step = 2; ctx.rerender(); };
    const input = main.querySelector('#imp');
    main.querySelector('#imp-btn').onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files[0]; input.value = '';
      if (!file) return;
      try {
        const payload = file.name.toLowerCase().endsWith('.json') ? await readJsonBackup(file) : await readComputerBackup(file);
        payload.settings = { ...(payload.settings || {}), configurado: '1' };
        await store.replaceAll(payload);
        toast(`Listo: se trajeron ${describe(payload)}.`);
        ctx.go('#/inicio');
      } catch (err) { toast(errorMessage(err), 'err'); }
    };
    return;
  }

  if (w.step === 2) {
    main.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto">${bar(2)}
      <h1>¿Dónde tienes tu dinero?</h1>
      <p class="muted">Escribe tus cuentas y <b>cuánto tienes hoy</b> en cada una. En una tarjeta de crédito, escribe lo que debes.</p>
      <form id="accs" autocomplete="off">${w.accounts.map(accountRow).join('')}
        <button type="button" class="btn block" id="add">Agregar otra cuenta</button>
        <div class="row" style="margin-top:14px"><button type="button" class="btn" id="back">Atrás</button>
        <button class="btn primary grow">Siguiente</button></div></form></div>`;
    const form = main.querySelector('#accs');
    bindMoneyInputs(form);
    const keep = () => { w.accounts = readAccounts(form).map((a) => ({ name: a.name, type: a.type, balance: (() => { try { return readMoney(a.balanceText, 'x', { allowZero: true }); } catch { return 0; } })() })); };
    form.addEventListener('change', (e) => { if (e.target.name?.startsWith('type_')) { keep(); ctx.rerender(); } });
    main.querySelector('#add').onclick = () => { keep(); w.accounts.push({ name: '', type: 'banco', balance: 0 }); ctx.rerender(); };
    form.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      keep(); w.accounts.splice(Number(b.dataset.remove), 1); ctx.rerender();
    }));
    main.querySelector('#back').onclick = () => { keep(); w.step = 1; ctx.rerender(); };
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        const rows = readAccounts(form).filter((a) => a.name);
        w.accounts = rows.map((a) => ({ name: a.name, type: a.type, balance: readMoney(a.balanceText, `El saldo de ${a.name}`, { allowZero: true }) }));
        buildInitialPayload({ cutoff: today, accounts: w.accounts });   // valida nombres y tipos
        w.step = 3; ctx.rerender();
      } catch (err) { toast(errorMessage(err), 'err'); }
    };
    return;
  }

  const banks = w.accounts.filter((a) => a.type === 'banco' || a.type === 'efectivo');
  const savings = w.accounts.filter((a) => a.type === 'ahorro');
  main.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto">${bar(3)}
    <h1>Tu salario y tu ahorro</h1>
    <form id="sal" autocomplete="off">
      <label class="field"><span>¿Cada cuánto te pagan?</span><select name="freq">
        <option value="mensual">Una vez al mes (mensual)</option><option value="quincenal">Dos veces al mes (quincenal)</option></select></label>
      <label class="field" data-mensual><span>¿Qué día del mes te pagan?</span><input type="number" name="dia" min="1" max="31" value="30" inputmode="numeric"></label>
      <div class="grid cols-2 keep hidden" data-quincenal>
        <label class="field"><span>Primer pago (día)</span><input type="number" name="d1" min="1" max="31" value="15" inputmode="numeric"></label>
        <label class="field"><span>Segundo pago (día)</span><input type="number" name="d2" min="1" max="31" value="30" inputmode="numeric"></label></div>
      <div class="grid cols-2">
        <label class="field"><span data-sal-label>¿Cuánto te pagan normalmente al mes?</span>${moneyInput('ref')}</label>
        <label class="field"><span>¿Cuánto quieres ahorrar cada vez que te pagan?</span>${moneyInput('goal', null, 'Ej: 300.000')}</label>
        <label class="field"><span>Ahorro extra, solo si te sobra (opcional)</span>${moneyInput('extra', null, '0')}</label>
      </div>
      <div class="card tight" style="margin:6px 0 14px"><b>¿Hoy te pagaron?</b>
        <p class="muted small">Si ese dinero ya está en los saldos que escribiste, cuéntale a la app para que no lo sume dos veces.</p>
        <label class="check"><input type="checkbox" name="paid"><span>Sí, hoy me pagaron</span></label>
        <div data-paid class="hidden">
          <div class="grid cols-2"><label class="field"><span>¿Cuánto te llegó hoy?</span>${moneyInput('sal')}</label>
            <label class="field"><span>¿A qué cuenta llegó?</span><select name="sal_acc">${banks.map((a) => `<option>${esc(a.name)}</option>`).join('')}</select></label></div>
          ${savings.length ? `<label class="check"><input type="checkbox" name="saved"><span>Hoy ya pasé plata a mi ahorro</span></label>
            <div data-saved class="hidden grid cols-2"><label class="field"><span>¿Cuánto pasaste?</span>${moneyInput('tr')}</label>
              <label class="field"><span>¿A qué ahorro?</span><select name="tr_to">${savings.map((a) => `<option>${esc(a.name)}</option>`).join('')}</select></label></div>` : ''}
        </div></div>
      <div class="row"><button type="button" class="btn" id="back">Atrás</button><button class="btn primary grow">Guardar y empezar</button></div>
    </form></div>`;
  const form = main.querySelector('#sal');
  bindMoneyInputs(form);
  form.freq.onchange = () => {
    const q = form.freq.value === 'quincenal';
    form.querySelector('[data-mensual]').classList.toggle('hidden', q);
    form.querySelector('[data-quincenal]').classList.toggle('hidden', !q);
    form.querySelector('[data-sal-label]').textContent = q ? '¿Cuánto te pagan normalmente cada quincena?' : '¿Cuánto te pagan normalmente al mes?';
  };
  form.paid.onchange = () => form.querySelector('[data-paid]').classList.toggle('hidden', !form.paid.checked);
  if (form.saved) form.saved.onchange = () => form.querySelector('[data-saved]').classList.toggle('hidden', !form.saved.checked);
  main.querySelector('#back').onclick = () => { w.step = 2; ctx.rerender(); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    const btn = form.querySelector('button.primary');
    try {
      const dia = parseInt(f.dia, 10), d1 = parseInt(f.d1, 10), d2 = parseInt(f.d2, 10);
      validatePaySettings(f.freq, dia, d1, d2);
      const paid = !!f.paid;
      const sal = paid ? readMoney(f.sal, 'Lo que te llegó hoy') : 0;
      const tr = paid && f.saved ? readMoney(f.tr, 'Lo que pasaste al ahorro') : 0;
      const payload = buildInitialPayload({
        cutoff: today,
        accounts: w.accounts.map((a) => ({ ...a, balance: a.type === 'credito' ? -a.balance : a.balance })),
        salaryToday: sal, savingsToday: tr, bank: f.sal_acc || null, savings: f.tr_to || null,
        settings: {
          frecuencia_pago: f.freq,
          ...(f.freq === 'quincenal' ? { dia_pago_1: Math.min(d1, d2), dia_pago_2: Math.max(d1, d2) } : { dia_pago: dia }),
          salario_referencia: readMoney(f.ref, 'Tu salario', { allowZero: true }),
          ahorro_modo: 'fijo', ahorro_valor: readMoney(f.goal, 'Lo que quieres ahorrar', { allowZero: true }),
          ahorro_extra_meta: readMoney(f.extra, 'El ahorro extra', { allowZero: true }),
        },
      });
      btn.disabled = true;
      await store.replaceAll(payload);
      w.step = 1; w.accounts = null;
      toast('¡Listo! Ya puedes empezar.');
      ctx.go('#/inicio');
    } catch (err) { toast(errorMessage(err), 'err'); btn.disabled = false; }
  };
}
