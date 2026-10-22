// Ajustes: salario y ahorro, categorías, copias de seguridad y tu cuenta.

import { periodSummary, payDay, settingsWithDefaults, periodWords, validatePaySettings } from '../core/calc.js';
import { periodFor } from '../core/periods.js';
import { readMoney, cop } from '../core/money.js';
import { esc, money, moneyInput, bindMoneyInputs, formData, toast, openDialog, confirmDialog, download } from './dom.js';
import { errorMessage } from './common.js';
import { readComputerBackup, readJsonBackup, describe } from '../data/importar.js';

const TABS = ['Salario', 'Categorías', 'Copias', 'Mi cuenta'];

function salaryTab(ctx) {
  const s = settingsWithDefaults(ctx.store.state.settings);
  const goal = periodSummary(ctx.store.state, periodFor(ctx.today, payDay(s)), ctx.today).availability.savingsGoal;
  const fixed = s.ahorro_modo === 'fijo';
  const q = s.frecuencia_pago === 'quincenal';
  const words = periodWords(s);
  return `<form id="sal" autocomplete="off" class="card">
    <p class="muted small" style="margin-top:0">Cámbialo cuando cambie tu salario o quieras ahorrar más. Lo que ya anotaste no se modifica.</p>
    <label class="field"><span>¿Cada cuánto te pagan?</span><select name="frecuencia_pago">
      <option value="mensual" ${q ? '' : 'selected'}>Una vez al mes (mensual)</option>
      <option value="quincenal" ${q ? 'selected' : ''}>Dos veces al mes (quincenal)</option></select></label>
    <label class="field ${q ? 'hidden' : ''}" data-mensual><span>¿Qué día del mes te pagan?</span><input type="number" name="dia_pago" min="1" max="31" inputmode="numeric" value="${esc(s.dia_pago)}"></label>
    <div class="grid cols-2 keep ${q ? '' : 'hidden'}" data-quincenal>
      <label class="field"><span>Primer pago (día)</span><input type="number" name="dia_pago_1" min="1" max="31" inputmode="numeric" value="${esc(s.dia_pago_1)}"></label>
      <label class="field"><span>Segundo pago (día)</span><input type="number" name="dia_pago_2" min="1" max="31" inputmode="numeric" value="${esc(s.dia_pago_2)}"></label></div>
    <p class="muted small ${q ? '' : 'hidden'}" data-quincenal-note style="margin-top:-4px">Si un mes no tiene ese día (por ejemplo el 30 en febrero), se usa el último día del mes.</p>
    <label class="field"><span data-sal-label>${q ? '¿Cuánto te pagan normalmente cada quincena?' : '¿Cuánto te pagan normalmente al mes?'}</span>${moneyInput('salario_referencia', Number(s.salario_referencia) || 0)}</label>
    <label class="field"><span>¿Cómo quieres ahorrar cada vez que te pagan?</span><select name="ahorro_modo">
      <option value="fijo" ${fixed ? 'selected' : ''}>Una cantidad fija</option>
      <option value="porcentaje" ${!fixed ? 'selected' : ''}>Un porcentaje de lo que me paguen</option></select></label>
    <label class="field ${fixed ? '' : 'hidden'}" data-fixed><span>¿Cuánto quieres ahorrar? (pesos)</span>${moneyInput('ahorro_fijo', fixed ? Number(s.ahorro_valor) : 0, 'Ej: 300.000')}</label>
    <label class="field ${fixed ? 'hidden' : ''}" data-pct><span>¿Qué porcentaje? (%)</span><input type="text" inputmode="decimal" name="ahorro_pct" value="${fixed ? '' : esc(s.ahorro_valor)}" placeholder="Ej: 15"></label>
    <label class="field"><span>Ahorro extra, solo si te sobra (opcional)</span>${moneyInput('ahorro_extra_meta', Number(s.ahorro_extra_meta) || 0)}</label>
    <label class="check"><input type="checkbox" name="reservar_ahorro" ${s.reservar_ahorro === '1' ? 'checked' : ''}>
      <span>Separar de mi dinero disponible lo que me falta ahorrar este mes</span></label>
    <button class="btn primary block">Guardar</button>
    <p class="muted small" style="margin-bottom:0">Con esto, tu meta de ahorro de ${words.this.toLowerCase()} es <b>${money(goal)}</b>.</p>
  </form>`;
}

function bindSalary(ctx, root) {
  const form = root.querySelector('#sal');
  bindMoneyInputs(form);
  form.frecuencia_pago.onchange = () => {
    const q = form.frecuencia_pago.value === 'quincenal';
    form.querySelector('[data-mensual]').classList.toggle('hidden', q);
    form.querySelector('[data-quincenal]').classList.toggle('hidden', !q);
    form.querySelector('[data-quincenal-note]').classList.toggle('hidden', !q);
    form.querySelector('[data-sal-label]').textContent = q ? '¿Cuánto te pagan normalmente cada quincena?' : '¿Cuánto te pagan normalmente al mes?';
  };
  form.ahorro_modo.onchange = () => {
    const fixed = form.ahorro_modo.value === 'fijo';
    form.querySelector('[data-fixed]').classList.toggle('hidden', !fixed);
    form.querySelector('[data-pct]').classList.toggle('hidden', fixed);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      const dia = parseInt(f.dia_pago, 10), d1 = parseInt(f.dia_pago_1, 10), d2 = parseInt(f.dia_pago_2, 10);
      validatePaySettings(f.frecuencia_pago, dia, d1, d2);
      let valor;
      if (f.ahorro_modo === 'porcentaje') {
        valor = Number(String(f.ahorro_pct).replace('%', '').replace(',', '.').trim() || 0);
        if (!Number.isFinite(valor) || valor < 0 || valor > 100) throw new Error('Escribe el porcentaje como un número entre 0 y 100, por ejemplo 15.');
      } else valor = readMoney(f.ahorro_fijo, 'Lo que quieres ahorrar', { allowZero: true });
      await ctx.store.setSettings({
        frecuencia_pago: f.frecuencia_pago,
        ...(f.frecuencia_pago === 'quincenal' ? { dia_pago_1: Math.min(d1, d2), dia_pago_2: Math.max(d1, d2) } : { dia_pago: dia }),
        salario_referencia: readMoney(f.salario_referencia, 'Tu salario', { allowZero: true }),
        ahorro_modo: f.ahorro_modo, ahorro_valor: String(valor),
        ahorro_extra_meta: readMoney(f.ahorro_extra_meta, 'El ahorro extra', { allowZero: true }),
        reservar_ahorro: f.reservar_ahorro ? '1' : '0',
      });
      toast('Listo, guardado.');
      ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
}

function categoriesTab(ctx) {
  const cats = [...ctx.store.state.categories].sort((a, b) => b.kind.localeCompare(a.kind) || a.group_name.localeCompare(b.group_name) || a.name.localeCompare(b.name));
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">Categorías</h3>
    <button class="btn small primary" id="cat-add">Nueva</button></div>
    <p class="muted small">Toca una para cambiarla. Desactivar la oculta en los formularios; los movimientos antiguos la conservan.</p>
    <div class="list">${cats.map((c) => `<button class="item" data-cat="${c.id}"><span class="main"><span class="title">${esc(c.name)}</span>
      <span class="meta" style="display:block">${esc(c.group_name)} · ${c.kind === 'gasto' ? 'Gasto' : 'Ingreso'}${c.active ? '' : ' · desactivada'}</span></span></button>`).join('')}</div></div>`;
}

function openCategory(ctx, cat = null) {
  const { store } = ctx;
  const groups = [...new Set(store.state.categories.map((c) => c.group_name))].sort();
  const d = openDialog(cat ? 'Cambiar categoría' : 'Nueva categoría', `<form id="catf" autocomplete="off">
    <label class="field"><span>Nombre</span><input type="text" name="name" value="${esc(cat?.name || '')}" maxlength="60"></label>
    <label class="field"><span>Grupo</span><input type="text" name="group" list="groups" value="${esc(cat?.group_name || '')}" maxlength="60" placeholder="Ej: Hogar"></label>
    <datalist id="groups">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
    ${cat ? '' : `<label class="field"><span>Tipo</span><select name="kind"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></label>`}
    <button class="btn primary block">${cat ? 'Guardar' : 'Crear categoría'}</button>
    ${cat ? `<button type="button" class="btn block" data-toggle style="margin-top:8px">${cat.active ? 'Desactivar' : 'Reactivar'}</button>` : ''}
  </form>`);
  const form = d.querySelector('#catf');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      if (cat) await store.updateCategory(cat.id, { name: f.name, group_name: f.group });
      else await store.addCategory({ name: f.name, group_name: f.group, kind: f.kind });
      d.close(); toast('Categoría guardada.'); ctx.rerender();
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
  form.querySelector('[data-toggle]')?.addEventListener('click', async () => {
    try { await store.setCategoryActive(cat.id, !cat.active); d.close(); toast('Listo.'); ctx.rerender(); }
    catch (err) { toast(errorMessage(err), 'err'); }
  });
}

function backupsTab(ctx) {
  const last = ctx.store.state.settings.ultima_copia;
  return `<div class="stack">
    <div class="card"><h3>Descargar una copia</h3>
      <p class="muted small">Guarda tus datos en un archivo. En el iPhone elige <b>Guardar en Archivos</b> (por ejemplo en iCloud Drive).
      ${last ? `Última copia: ${esc(last.slice(0, 10))}.` : 'Aún no has descargado ninguna copia.'}</p>
      <button class="btn primary block" id="bk-down">Descargar copia</button></div>
    <div class="card"><h3>Restaurar una copia</h3>
      <p class="muted small">Reemplaza tus datos actuales por los de una copia descargada desde esta app.</p>
      <input type="file" id="bk-file" accept=".json,application/json" class="hidden">
      <button class="btn block" id="bk-up">Elegir archivo de copia…</button></div>
    <div class="card"><h3>Traer mis datos de la versión de computador</h3>
      <p class="muted small">Elige el archivo <b>finanzas.db</b> (está en la carpeta <i>data</i> de la app de computador, o descárgalo desde sus Ajustes → Copias).
      El archivo solo se lee: no se modifica.</p>
      <input type="file" id="db-file" accept=".db,application/octet-stream,application/x-sqlite3" class="hidden">
      <button class="btn block" id="db-up">Elegir finanzas.db…</button></div>
  </div>`;
}

function bindBackups(ctx, root) {
  const { store, today } = ctx;
  root.querySelector('#bk-down').onclick = async () => {
    download(`mis_finanzas_copia_${today}.json`, JSON.stringify(store.exportData(), null, 1), 'application/json');
    try { await store.setSettings({ ultima_copia: new Date().toISOString() }); } catch { /* no es grave */ }
    toast('Copia descargada.');
    ctx.rerender();
  };
  const replaceFrom = async (reader, file, label) => {
    try {
      const payload = await reader(file);
      const ok = await confirmDialog(`¿Reemplazar tus datos?`,
        `Se cargarán ${describe(payload)} desde ${label}. Tus datos actuales se reemplazarán. Si quieres, descarga antes una copia.`, 'Sí, reemplazar');
      if (!ok) return;
      if (!payload.settings) payload.settings = {};
      payload.settings.configurado = '1';
      await store.replaceAll(payload);
      toast(`Listo: ${describe(payload)} cargados.`);
      ctx.go('#/inicio');
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
  const wire = (btnId, inputId, reader, label) => {
    const input = root.querySelector(inputId);
    root.querySelector(btnId).onclick = () => input.click();
    input.onchange = () => { const f = input.files[0]; input.value = ''; if (f) replaceFrom(reader, f, label); };
  };
  wire('#bk-up', '#bk-file', readJsonBackup, 'la copia');
  wire('#db-up', '#db-file', readComputerBackup, 'la versión de computador');
}

function accountTab(ctx) {
  return `<div class="stack">
    <div class="card"><h3>Mi cuenta</h3>
      <p class="muted">${ctx.demo ? 'Estás en <b>modo de prueba</b>: los datos son de ejemplo y se guardan solo en este navegador.' : `Usuario: <b>${esc(ctx.username || '')}</b>`}</p>
      <button class="btn block" id="logout">${ctx.demo ? 'Salir del modo de prueba' : 'Cerrar sesión'}</button></div>
    ${ctx.demo ? '' : `<form class="card" id="pw" autocomplete="off"><h3>Cambiar contraseña</h3>
      <label class="field"><span>Contraseña actual</span><input type="password" name="cur" autocomplete="current-password"></label>
      <label class="field"><span>Contraseña nueva (mínimo 8 caracteres)</span><input type="password" name="new1" autocomplete="new-password"></label>
      <label class="field"><span>Repite la nueva</span><input type="password" name="new2" autocomplete="new-password"></label>
      <button class="btn primary block">Cambiar contraseña</button></form>
    <div class="card"><h3>¿Perdiste el celular?</h3><p class="muted small">Cierra la sesión en todos los dispositivos donde hayas entrado.</p>
      <button class="btn danger block" id="logout-all">Cerrar sesión en todos los dispositivos</button></div>`}
    <a class="btn block" href="#/ayuda">Ayuda</a>
  </div>`;
}

function bindAccount(ctx, root) {
  root.querySelector('#logout').onclick = () => ctx.logout();
  root.querySelector('#logout-all')?.addEventListener('click', async () => {
    if (await confirmDialog('¿Cerrar sesión en todos lados?', 'Tendrás que volver a entrar con tu usuario y contraseña en cada dispositivo.', 'Sí, cerrar todo')) {
      ctx.logout(true);
    }
  });
  const form = root.querySelector('#pw');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      await ctx.auth.changePassword(f.cur, f.new1, f.new2);
      form.reset();
      toast('Contraseña cambiada.');
    } catch (err) { toast(errorMessage(err), 'err'); }
  };
}

export function renderSettings(ctx) {
  const { ui, main } = ctx;
  const t = ui.settingsTab ?? 0;
  const body = [salaryTab, categoriesTab, backupsTab, accountTab][t](ctx);
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Configuración</div><h1>Ajustes</h1></div></div>
    <div class="segmented" id="tabs">${TABS.map((x, i) => `<button type="button" class="${i === t ? 'on' : ''}" data-t="${i}">${x}</button>`).join('')}</div>
    <div id="tab">${body}</div>`;
  main.querySelector('#tabs').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (b) { ui.settingsTab = Number(b.dataset.t); ctx.rerender(); }
  };
  const root = main.querySelector('#tab');
  if (t === 0) bindSalary(ctx, root);
  if (t === 1) {
    root.querySelector('#cat-add').onclick = () => openCategory(ctx);
    root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () =>
      openCategory(ctx, ctx.store.state.categories.find((c) => c.id === Number(b.dataset.cat)))));
  }
  if (t === 2) bindBackups(ctx, root);
  if (t === 3) bindAccount(ctx, root);
}

export const _cop = cop;
