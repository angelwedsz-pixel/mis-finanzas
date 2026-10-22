// Anotar: botones grandes para elegir qué pasó y un formulario corto.

import { periodSummary, payDay, frequentCategories, periodWords } from '../core/calc.js';
import { periodFor } from '../core/periods.js';
import { readMoney } from '../core/money.js';
import { esc, money, moneyInput, bindMoneyInputs, chips, bindChips, formData, toast } from './dom.js';
import { activeAccounts, categoryOptions, errorMessage } from './common.js';
import { saveWithDuplicateCheck } from './home.js';

const OPS = {
  gasto: ['Gasté', 'Pagaste algo: comida, gasolina, una compra… también con tarjeta de crédito.'],
  ingreso: ['Me pagaron', 'Te llegó dinero: tu salario, un trabajo extra, una devolución.'],
  ahorro: ['Ahorré', 'Pasaste plata de tu banco o efectivo a tu ahorro. No es un gasto: sigue siendo tuya.'],
  retiro: ['Saqué del ahorro', 'Sacaste plata de tu ahorro para usarla. No es un ingreso nuevo.'],
  tarjeta: ['Pagué la tarjeta', 'Pagaste tu tarjeta de crédito. No se cuenta como otro gasto.'],
  mover: ['Moví plata', 'Pasaste dinero entre tus cuentas, por ejemplo al sacar del cajero.'],
};

const accChoices = (accs) => accs.map((a) => ({ value: String(a.id), label: a.name }));

function categoryField(st, kind, today, label, defaultId = null) {
  const all = categoryOptions(st, kind);
  const freq = frequentCategories(st, kind, kind === 'gasto' ? 8 : 4, today).map((id) => all.find((c) => c.id === id)).filter(Boolean);
  const others = all.filter((c) => !freq.includes(c));
  const sel = defaultId && freq.some((c) => c.id === defaultId) ? String(defaultId)
    : (defaultId && others.some((c) => c.id === defaultId) ? 'otra' : String(freq[0]?.id ?? 'otra'));
  return `${chips('cat', [...freq.map((c) => ({ value: String(c.id), label: c.name })), ...(others.length ? [{ value: 'otra', label: 'Otra…' }] : [])], sel, { label })}
    <label class="field ${sel === 'otra' ? '' : 'hidden'}" data-other><span>Elige la categoría</span>
    <select name="cat_other">${others.map((c) => `<option value="${c.id}" ${c.id === defaultId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
}

function extraFields(today, placeholder = '') {
  return `<div class="grid cols-2 keep">
    <label class="field"><span>Nota (opcional)</span><input type="text" name="desc" placeholder="${esc(placeholder)}" maxlength="200"></label>
    <label class="field"><span>¿Cuándo?</span><input type="date" name="date" value="${today}" max="${today}"></label></div>`;
}

function formHtml(op, st, today) {
  const salary = st.categories.find((c) => c.system_key === 'salario');
  if (op === 'gasto') {
    const accs = activeAccounts(st, ['banco', 'efectivo', 'credito', 'ahorro']);
    return `<label class="field"><span>¿Cuánto gastaste?</span>${moneyInput('amount')}</label>
      ${categoryField(st, 'gasto', today, '¿En qué?')}
      ${chips('from', accChoices(accs), String(accs[0]?.id), { label: '¿Con qué pagaste?' })}
      ${extraFields(today, 'Ej: almuerzo con amigos')}
      <button class="btn primary block">Guardar gasto</button>`;
  }
  if (op === 'ingreso') {
    const accs = activeAccounts(st);
    return `<label class="field"><span>¿Cuánto te llegó?</span>${moneyInput('amount')}</label>
      <p class="muted small" style="margin:-6px 0 10px">Escribe lo que realmente llegó, aunque sea distinto a otros meses.</p>
      ${categoryField(st, 'ingreso', today, '¿Qué fue?', salary?.id)}
      ${chips('to', accChoices(accs), String(accs[0]?.id), { label: '¿A dónde llegó?' })}
      ${extraFields(today)}<button class="btn primary block">Guardar</button>`;
  }
  const transfer = (sources, targets, amountLabel, srcLabel, dstLabel, button) => {
    if (!sources.length || !targets.length) {
      return `<div class="notice warn">Para esto necesitas tener las cuentas creadas. Agrégalas en <a href="#/cuentas">Mis cuentas</a>.</div>`;
    }
    const dst = targets.find((t) => t.id !== sources[0].id) || targets[0];
    return `<label class="field"><span>${amountLabel}</span>${moneyInput('amount')}</label>
      ${chips('from', accChoices(sources), String(sources[0].id), { label: srcLabel })}
      ${chips('to', accChoices(targets), String(dst.id), { label: dstLabel })}
      ${extraFields(today)}<button class="btn primary block">${button}</button>`;
  };
  if (op === 'ahorro') return transfer(activeAccounts(st, ['banco', 'efectivo']), activeAccounts(st, ['ahorro']),
    '¿Cuánto ahorraste?', '¿De dónde salió?', '¿A qué ahorro?', 'Guardar ahorro');
  if (op === 'retiro') return transfer(activeAccounts(st, ['ahorro']), activeAccounts(st, ['banco', 'efectivo']),
    '¿Cuánto sacaste?', '¿De qué ahorro?', '¿A dónde lo pasaste?', 'Guardar');
  if (op === 'tarjeta') {
    const cards = activeAccounts(st, ['credito']);
    const payers = activeAccounts(st, ['banco', 'efectivo']);
    if (cards.length) {
      return transfer(payers, cards, '¿Cuánto pagaste?', '¿Desde dónde pagaste?', '¿Qué tarjeta?', 'Guardar pago');
    }
    return `<p class="muted small">No tienes tu tarjeta creada como cuenta, así que el pago se guarda como un gasto llamado <i>Pago de tarjeta</i>.
      Si quieres anotar cada compra con tarjeta, créala en <a href="#/cuentas">Mis cuentas</a> con lo que debes hoy.</p>
      <label class="field"><span>¿Cuánto pagaste?</span>${moneyInput('amount')}</label>
      ${chips('from', accChoices(payers), String(payers[0]?.id), { label: '¿Desde dónde pagaste?' })}
      ${extraFields(today)}<button class="btn primary block">Guardar pago</button>`;
  }
  const accs = activeAccounts(st);
  return transfer(accs, accs, '¿Cuánto moviste?', '¿De dónde salió?', '¿A dónde llegó?', 'Guardar');
}

function savingsHint(st, today) {
  const s = periodSummary(st, periodFor(today, payDay(st.settings)), today).availability;
  const w = periodWords(st.settings).this.toLowerCase();
  if (s.savingsPending > 0) return `<div class="notice" style="margin-bottom:12px">Te faltan <b>${money(s.savingsPending)}</b> para tu meta de ahorro de ${w} (${money(s.savingsGoal)}).</div>`;
  if (s.savingsGoal > 0) {
    return `<div class="notice ok" style="margin-bottom:12px">Ya cumpliste tu meta de ahorro de ${w} (${money(s.savingsGoal)}).
      ${s.extraGoal > 0 ? `Extra opcional: llevas ${money(s.extraSaved)} de ${money(s.extraGoal)}. Hazlo solo si te alcanza.` : ''}</div>`;
  }
  return '';
}

export function renderRecord(ctx) {
  const { store, ui, today, main, params } = ctx;
  const st = store.state;
  if (params.op && OPS[params.op]) ui.op = params.op;
  const op = OPS[ui.op] ? ui.op : 'gasto';
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Anotar</div><h1>¿Qué pasó con tu dinero?</h1></div></div>
    <div class="options">${Object.entries(OPS).map(([k, [t]]) => `<button type="button" class="option ${k === op ? 'on' : ''}" data-op="${k}">${t}</button>`).join('')}</div>
    <div class="card"><h2>${OPS[op][0]}</h2><p class="muted small" style="margin-top:-4px">${OPS[op][1]}</p>
      ${op === 'ahorro' ? savingsHint(st, today) : ''}
      <form id="rec" autocomplete="off">${formHtml(op, st, today)}</form></div>`;

  main.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => {
    ui.op = b.dataset.op;
    history.replaceState(null, '', '#/anotar');
    ctx.params = {};
    ctx.rerender();
  }));
  const form = main.querySelector('#rec');
  bindMoneyInputs(form);
  bindChips(form, (name, value) => {
    if (name === 'cat') form.querySelector('[data-other]')?.classList.toggle('hidden', value !== 'otra');
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button.primary');
    const f = formData(form);
    try {
      const labels = { gasto: '¿Cuánto gastaste?', ingreso: '¿Cuánto te llegó?' };
      const amount = readMoney(f.amount, labels[op] || 'El valor');
      const catId = f.cat ? Number(f.cat === 'otra' ? f.cat_other : f.cat) : null;
      let tx;
      if (op === 'gasto') tx = { kind: 'gasto', from_account_id: Number(f.from), category_id: catId };
      else if (op === 'ingreso') tx = { kind: 'ingreso', to_account_id: Number(f.to), category_id: catId };
      else if (op === 'tarjeta' && !activeAccounts(st, ['credito']).length) {
        const c = st.categories.find((x) => x.system_key === 'pago_tarjeta_sin_detalle');
        if (!c) throw new Error('Falta la categoría Pago de tarjeta (sin detalle).');
        tx = { kind: 'gasto', from_account_id: Number(f.from), category_id: c.id, description: f.desc || 'Pago de tarjeta' };
      } else {
        const defaults = { ahorro: 'Ahorro', retiro: 'Retiro de ahorro', tarjeta: 'Pago de tarjeta', mover: 'Movimiento entre mis cuentas' };
        tx = { kind: 'transferencia', from_account_id: Number(f.from), to_account_id: Number(f.to), description: f.desc || defaults[op] };
      }
      if (op === 'ingreso' && !f.desc) {
        f.desc = st.categories.find((c) => c.id === catId)?.name || '';
      }
      tx = { description: f.desc, ...tx, date: f.date || today, amount };
      if (op === 'gasto' || op === 'ingreso') tx.description = f.desc;
      btn.disabled = true;
      await saveWithDuplicateCheck(store, tx);
      const left = periodSummary(store.state, periodFor(today, payDay(store.state.settings)), today).availability.available;
      toast(`Guardado. Te quedan ${money(left)} para gastar.`);
      ctx.rerender();
    } catch (err) {
      if (!err?.cancelled) toast(errorMessage(err), 'err');
    } finally { btn.disabled = false; }
  };
}
