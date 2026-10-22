// Inicio: cuánto te queda, semáforo, anotar un gasto rápido y resumen.

import { periodSummary, periodsOverview, savingsHistory, savingsSeries, frequentCategories, payDay, periodWords, DuplicateError } from '../core/calc.js';
import { periodFor, periodsBetween, shortDate, longDate } from '../core/periods.js';
import { readMoney } from '../core/money.js';
import { esc, icon, money, moneyInput, bindMoneyInputs, chips, bindChips, formData, toast } from './dom.js';
import { activeAccounts, categoryOptions, errorMessage, sortTx, txList } from './common.js';
import { openTxEditor } from './movements.js';

const STATUS = { bien: 'Vas bien', cuidado: 'Ve con cuidado', mal: 'Ojo: así no alcanza' };
const VIEWS = ['¿En qué se va mi plata?', 'Pago a pago', 'Mi ahorro', 'Lo último'];

function periodChoices(state, today) {
  const pd = payDay(state.settings);
  const first = state.accounts.map((a) => a.opening_date).sort()[0] || today;
  return periodsBetween(first, today, pd).reverse();
}

function heroHtml(s, today, words) {
  const av = s.availability, pace = s.pace;
  if (!s.isCurrent) {
    return `<div class="hero"><span class="pill">${words.closed}</span>
      <div class="muted" style="margin-top:12px">Dinero para el día a día al cierre</div>
      <div class="big">${money(av.liquid)}</div>
      <div class="sub">Gastaste <b>${money(s.expenses)}</b> y ahorraste <b>${money(av.savedThisPeriod)}</b>.</div></div>`;
  }
  const sub = av.available > 0
    ? `Son unos <b>${money(av.perDay)} por día</b> durante ${av.daysLeft} día${av.daysLeft !== 1 ? 's' : ''} (contando hoy).`
    : 'Tus compromisos ya superan el dinero que tienes.';
  const note = s.expenses > 0
    ? `Llevas gastando unos ${money(pace.dailyPace)} por día. A este ritmo terminarías con ${money(pace.projectedLeft)}.`
    : `Aún no has anotado gastos en ${words.this.toLowerCase()}.`;
  return `<div class="hero ${pace.status}">
    <span class="pill"><span class="dot ${pace.status}"></span>${STATUS[pace.status]}</span>
    <div class="muted" style="margin-top:12px">Te quedan para gastar hasta el ${esc(longDate(s.period.nextPayDate, { today }))}</div>
    <div class="big">${money(av.available)}</div>
    <div class="sub">${sub}</div>
    <div class="note">${note}</div></div>
    <details class="card tight" style="margin-top:10px"><summary class="muted small" style="cursor:pointer">¿De dónde sale esta cifra?</summary>
      <div class="small" style="margin-top:10px;line-height:1.8">
      Tienes en el banco y en efectivo: <b>${money(av.liquid)}</b><br>
      − Lo que debes en tarjetas: <b>${money(av.cardDebt)}</b><br>
      − Lo que te falta pasar a tu ahorro en ${words.this.toLowerCase()}: <b>${money(av.savingsPending)}</b><br>
      = <b>Te queda ${money(av.available)}</b></div>
      <div class="muted small" style="margin-top:8px">Lo que ya pasaste al ahorro no se descuenta otra vez. Tu salario solo cuenta cuando lo anotas.</div>
    </details>`;
}

function quickExpenseHtml(ctx) {
  const { store, ui, today } = ctx;
  const st = store.state;
  const accounts = activeAccounts(st, ['banco', 'efectivo', 'credito']);
  const freq = frequentCategories(st, 'gasto', 6, today);
  const all = categoryOptions(st, 'gasto');
  const quick = freq.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  const others = all.filter((c) => !quick.includes(c));
  const lastCat = ui.lastCat && all.some((c) => c.id === ui.lastCat) ? ui.lastCat : quick[0]?.id;
  const inQuick = quick.some((c) => c.id === lastCat);
  return `<div class="card"><h2>Anotar un gasto</h2>
    <form id="qr" autocomplete="off">
      <label class="field"><span>¿Cuánto gastaste?</span>${moneyInput('amount')}</label>
      ${chips('cat', [...quick.map((c) => ({ value: String(c.id), label: c.name })), ...(others.length ? [{ value: 'otra', label: 'Otra…' }] : [])],
        inQuick ? String(lastCat) : (others.some((c) => c.id === lastCat) ? 'otra' : String(quick[0]?.id ?? 'otra')), { label: '¿En qué?' })}
      <label class="field ${inQuick || !others.length ? 'hidden' : ''}" id="qr-other"><span>Elige la categoría</span>
        <select name="cat_other">${others.map((c) => `<option value="${c.id}" ${c.id === lastCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${chips('acc', accounts.map((a) => ({ value: String(a.id), label: a.name })), String(ui.lastAcc ?? accounts[0]?.id), { label: '¿Con qué pagaste?' })}
      <div class="grid cols-2 keep">
        <label class="field"><span>Nota (opcional)</span><input type="text" name="desc" placeholder="Ej: almuerzo" maxlength="200"></label>
        <label class="field"><span>¿Cuándo?</span><input type="date" name="date" value="${today}" max="${today}"></label>
      </div>
      <button class="btn primary block" type="submit">Guardar gasto</button>
    </form>
    <a class="btn block" style="margin-top:8px" href="#/anotar">${icon('plus')} Anotar otra cosa (salario, ahorro, tarjeta…)</a>
  </div>`;
}

function moneyCards(s) {
  const accs = s.accounts.filter((a) => a.active || a.balance !== 0);
  const t = s.totals;
  return `<h2 style="margin-top:6px">Tu dinero</h2>
    <div class="grid cols-2 keep">${accs.map((a) => `<div class="card tight metric">
      <div class="label">${esc(a.name)}${a.type === 'credito' ? ' (debes)' : ''}</div>
      <div class="value">${money(a.type === 'credito' ? Math.max(0, -a.balance) : a.balance)}</div></div>`).join('')}</div>
    <p class="muted small" style="margin:10px 2px 0">Para el día a día: <b>${money(t.liquid)}</b> · Ahorrado: <b>${money(t.savings)}</b> · Deudas: <b>${money(t.cardDebt)}</b></p>`;
}

function monthSummary(s, words) {
  const av = s.availability;
  const done = Math.max(0, av.savedThisPeriod);
  const goal = av.savingsGoal > 0 ? `<div class="progress"><div style="width:${Math.min(100, done / av.savingsGoal * 100)}%"></div></div>
      <div class="note">${done >= av.savingsGoal ? `¡Cumpliste tu meta de ${money(av.savingsGoal)}!` : `Te faltan ${money(av.savingsGoal - done)} para tu meta de ${money(av.savingsGoal)}.`}</div>` : '';
  const top = s.byCategory[0];
  return `<h2>${s.isCurrent ? words.this : 'Resumen de ' + words.that}</h2>
    <div class="grid cols-3">
      <div class="card metric"><div class="label">Salario recibido</div><div class="value">${money(s.salaryReceived)}</div>
        ${s.isCurrent && !s.salaryCount ? '<div class="note">Aún no lo anotas.</div>' : ''}</div>
      <div class="card metric"><div class="label">Gastado</div><div class="value">${money(s.expenses)}</div>
        ${top ? `<div class="note">Donde más gastas: ${esc(top.category)} (${money(top.amount)})</div>` : ''}</div>
      <div class="card metric"><div class="label">Ahorrado en ${words.this.toLowerCase()}</div><div class="value">${money(av.savedThisPeriod)}</div>${goal}
        ${av.extraGoal > 0 ? `<div class="note">Extra opcional: ${money(av.extraSaved)} de ${money(av.extraGoal)}.</div>` : ''}</div>
    </div>`;
}

function barsHtml(rows, total) {
  const top = Math.max(...rows.map((r) => r.amount), 1);
  return `<div class="bars">${rows.map((r) => `<div><div class="bar-head"><span>${esc(r.category)}</span>
    <span><b>${money(r.amount)}</b><span class="bar-pct">${Math.round(r.amount / (total || 1) * 100)}%</span></span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, r.amount / top * 100).toFixed(1)}%"></div></div></div>`).join('')}</div>`;
}

function monthChart(data) {
  const W = 640, H = 220, pad = 30, n = data.length;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses, Math.max(0, d.saved)]));
  const gw = (W - pad) / n, bw = Math.min(18, gw / 4);
  const series = [['income', '#E4E4E7'], ['expenses', '#E5383B'], ['saved', '#8B8B96']];
  let bars = '';
  data.forEach((d, i) => {
    series.forEach(([k, color], j) => {
      const v = Math.max(0, d[k]);
      const h = (v / max) * (H - 40);
      const x = pad + i * gw + gw / 2 - (1.5 * bw) + j * bw;
      bars += `<rect x="${x.toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}"><title>${esc(money(v))}</title></rect>`;
    });
    bars += `<text x="${(pad + i * gw + gw / 2).toFixed(1)}" y="${H - 6}" fill="#A1A1AA" font-size="12" text-anchor="middle">${esc(d.label)}</text>`;
  });
  return `<div class="legend"><span><i style="background:#E4E4E7"></i>Ingresos</span><span><i style="background:#E5383B"></i>Gastos</span><span><i style="background:#8B8B96"></i>Ahorro neto</span></div>
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos, gastos y ahorro por período de pago">
    <line x1="${pad}" x2="${W}" y1="${H - 22}" y2="${H - 22}" stroke="#2A2A31"/>${bars}</svg></div>`;
}

function savingsChart(points) {
  if (points.length < 2) return '';
  const W = 640, H = 180;
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points.at(-1).date) || t0 + 1;
  const max = Math.max(1, ...points.map((p) => p.balance));
  const X = (d) => 10 + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - 20);
  const Y = (v) => H - 14 - (Math.max(0, v) / max) * (H - 34);
  let d = `M${X(points[0].date).toFixed(1)},${Y(points[0].balance).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) d += ` H${X(points[i].date).toFixed(1)} V${Y(points[i].balance).toFixed(1)}`;
  const area = `${d} V${H - 14} H${X(points[0].date).toFixed(1)} Z`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo de ahorro en el tiempo">
    <path d="${area}" fill="rgba(229,56,59,.13)"/><path d="${d}" fill="none" stroke="#E5383B" stroke-width="2.5"/></svg></div>`;
}

function viewHtml(ctx, s) {
  const { store, ui, today } = ctx;
  const st = store.state;
  const v = ui.homeView ?? 0;
  let body = '';
  if (v === 0) {
    body = s.byCategory.length ? barsHtml(s.byCategory, s.expenses)
      : '<p class="muted">Cuando anotes gastos, aquí verás en qué se te va el dinero.</p>';
  } else if (v === 1) {
    body = `<p class="muted small">Cada grupo de barras es ${periodWords(st.settings).one === 'quincena' ? 'una quincena' : 'un mes de pago'} (empieza el día que te pagan).</p>${monthChart(periodsOverview(st, today))}`;
  } else if (v === 2) {
    const h = savingsHistory(st);
    body = `<div class="grid cols-3"><div class="metric"><div class="label">Ahorro total hoy</div><div class="value">${money(s.totals.savings)}</div></div>
      <div class="metric"><div class="label">Has pasado al ahorro</div><div class="value">${money(h.contributions)}</div></div>
      <div class="metric"><div class="label">Has sacado del ahorro</div><div class="value">${money(h.withdrawals)}</div></div></div>
      <div class="spacer"></div>${savingsChart(savingsSeries(st))}`;
  } else {
    const rows = sortTx(st.transactions).slice(0, 8);
    body = rows.length ? txList(st, rows, { today }) + '<a class="btn block" href="#/movimientos" style="margin-top:10px">Ver todos mis movimientos</a>'
      : '<p class="muted">Todavía no has anotado nada.</p>';
  }
  return `<div class="segmented" id="views">${VIEWS.map((t, i) => `<button type="button" class="${i === v ? 'on' : ''}" data-v="${i}">${esc(t)}</button>`).join('')}</div>
    <div class="card">${body}</div>`;
}

export function renderHome(ctx) {
  const { store, ui, today, main } = ctx;
  const st = store.state;
  const periods = periodChoices(st, today);
  const current = periodFor(today, payDay(st.settings));
  const chosen = periods.find((p) => p.start === ui.period) || periods[0] || current;
  const s = periodSummary(st, chosen, today);
  const words = periodWords(st.settings);

  const guide = st.settings.guia_oculta === '1' ? '' : `<div class="card" style="margin-bottom:14px"><h3>¿Cómo se usa? Son solo 3 cosas</h3>
    <ol class="muted" style="margin:0 0 12px;padding-left:20px;line-height:1.7">
      <li><b>Anota cada gasto</b> en el cuadro <i>Anotar un gasto</i>. Toma segundos.</li>
      <li><b>Cada día de pago</b>, en <i>Anotar</i> elige <i>Me pagaron</i> y luego <i>Ahorré</i>.</li>
      <li><b>Mira la tarjeta</b>: te dice cuánto te queda y si vas bien.</li></ol>
    <div class="row"><button class="btn primary" id="hide-guide">Entendido</button><a class="link" href="#/ayuda">Ver la ayuda completa</a></div></div>`;

  main.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Mis finanzas</div><h1>Hola${ctx.username ? ', ' + esc(ctx.username) : ''}</h1>
      <div class="muted small">Hoy es ${esc(longDate(today, { weekday: true, today }))}</div></div>
      <label class="field" style="margin:0;min-width:200px"><span>${words.one === 'quincena' ? 'Quincena' : 'Mes de pago'}</span>
        <select id="period">${periods.map((p) => `<option value="${p.start}" ${p.start === chosen.start ? 'selected' : ''}>${esc(shortDate(p.start, today))} – ${esc(shortDate(p.end, today))}${p.start === current.start ? ' (actual)' : ''}</option>`).join('')}</select></label>
    </div>
    ${guide}
    ${s.isCurrent && !s.salaryCount ? `<div class="notice warn" style="margin-bottom:14px">Aún no anotas tu pago de ${words.this.toLowerCase()}. La app no lo suma sola. <a href="#/anotar?op=ingreso">Anotar mi salario</a></div>` : ''}
    <div class="home-top">
      <div class="stack">${heroHtml(s, today, words)}</div>
      <div class="stack">${s.isCurrent ? quickExpenseHtml(ctx) : `<div class="notice">Estás viendo ${words.one === 'quincena' ? 'una quincena anterior' : 'un mes de pago anterior'}. Para anotar gastos, vuelve al actual.</div>`}</div>
    </div>
    <div class="spacer"></div>${moneyCards(s)}
    <div class="spacer"></div><div class="spacer"></div>${monthSummary(s, words)}
    <div class="spacer"></div><div class="spacer"></div>${viewHtml(ctx, s)}`;

  main.querySelector('#period').onchange = (e) => { ui.period = e.target.value; ctx.rerender(); };
  main.querySelector('#hide-guide')?.addEventListener('click', async () => {
    try { await store.setSettings({ guia_oculta: '1' }); ctx.rerender(); } catch (e) { toast(errorMessage(e), 'err'); }
  });
  main.querySelector('#views').onclick = (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) { ui.homeView = Number(b.dataset.v); ctx.rerender(); }
  };
  main.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => openTxEditor(ctx, Number(b.dataset.tx))));

  const form = main.querySelector('#qr');
  if (!form) return;
  bindMoneyInputs(form);
  bindChips(form, (name, value) => {
    if (name === 'cat') form.querySelector('#qr-other').classList.toggle('hidden', value !== 'otra');
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const f = formData(form);
    try {
      const amount = readMoney(f.amount, '¿Cuánto gastaste?');
      const catId = Number(f.cat === 'otra' ? f.cat_other : f.cat);
      const accId = Number(f.acc);
      if (!catId) throw new Error('Elige en qué gastaste.');
      if (!accId) throw new Error('Elige con qué pagaste.');
      const tx = { date: f.date || today, kind: 'gasto', amount, from_account_id: accId, category_id: catId, description: f.desc };
      ui.lastCat = catId; ui.lastAcc = accId;
      btn.disabled = true;
      await saveWithDuplicateCheck(store, tx);
      const after = periodSummary(store.state, periodFor(today, payDay(store.state.settings)), today);
      toast(`Guardado. Te quedan ${money(after.availability.available).replace(/&#36;/g, '$')} para gastar.`);
      ctx.rerender();
    } catch (err) {
      if (err?.cancelled) return;
      toast(errorMessage(err), 'err');
    } finally { btn.disabled = false; }
  };
}

// Guarda un movimiento; si es idéntico a otro del mismo día, pregunta antes.
export async function saveWithDuplicateCheck(store, tx) {
  try {
    return await store.addTransaction(tx);
  } catch (e) {
    if (!(e instanceof DuplicateError)) throw e;
    const { confirmDialog } = await import('./dom.js');
    const ok = await confirmDialog('¿Es otro movimiento igual?', 'Ya anotaste uno idéntico ese mismo día. ¿Lo guardo de todas formas?', 'Sí, es otro', false);
    if (!ok) { const c = new Error('cancelado'); c.cancelled = true; throw c; }
    return store.addTransaction(tx, { allowDuplicate: true });
  }
}
