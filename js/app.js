// Arranque de la app: sesión, navegación entre pantallas y modo de prueba.

import { todayIso } from './core/periods.js';
import { LocalStore } from './data/store.js';
import * as cloud from './data/supabase.js';
import { demoPayload } from './core/demo.js';
import { esc, icon, toast, formData } from './ui/dom.js';
import { errorMessage } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderRecord } from './ui/record.js';
import { renderMovements } from './ui/movements.js';
import { renderAccounts } from './ui/accounts.js';
import { renderSettings } from './ui/settings.js';
import { renderHelp } from './ui/help.js';
import { renderWizard } from './ui/wizard.js';

const DEMO_FLAG = 'mf-modo-prueba';
const DEMO_DATA = 'mf-datos-prueba';
const root = document.getElementById('app');

const ROUTES = {
  inicio: renderHome, anotar: renderRecord, movimientos: renderMovements,
  cuentas: renderAccounts, ajustes: renderSettings, ayuda: renderHelp,
};
const NAV = [['inicio', 'home', 'Inicio'], ['movimientos', 'list', 'Movimientos'], ['anotar', 'plus', 'Anotar'],
  ['cuentas', 'bank', 'Cuentas'], ['ajustes', 'gear', 'Ajustes']];

const ctx = {
  store: null, ui: {}, username: '', demo: false, auth: cloud, params: {},
  main: null, today: todayIso(),
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  rerender() { render(); },
  logout: (everywhere = false) => logout(everywhere),
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  return { route: path || 'inicio', params: Object.fromEntries(new URLSearchParams(query)) };
}

function loading(text = 'Cargando tus datos…') {
  root.innerHTML = `<div class="loading"><div><div class="spinner"></div>${esc(text)}</div></div>`;
}

function shell() {
  const { route } = parseHash();
  const active = ROUTES[route] ? route : 'inicio';
  root.innerHTML = `<div class="app">
    <main id="main">${ctx.demo ? `<div class="demo-banner"><span>Modo de prueba: datos de ejemplo guardados solo en este navegador.</span>
      <button class="btn small" id="exit-demo">Salir</button></div>` : ''}<div id="view"></div></main>
    <nav class="nav">${NAV.map(([r, ic, label]) => `<a href="#/${r}" class="${r === active ? 'active' : ''} ${r === 'anotar' ? 'plus' : ''}">${icon(ic)}<span>${label}</span></a>`).join('')}</nav>
  </div>`;
  root.querySelector('#exit-demo')?.addEventListener('click', () => logout());
  ctx.main = root.querySelector('#view');
}

function render() {
  if (!ctx.store) return;
  ctx.today = todayIso();
  const { route, params } = parseHash();
  ctx.params = params;
  shell();
  try {
    if (!ctx.store.isConfigured()) { renderWizard(ctx); return; }
    (ROUTES[route] || renderHome)(ctx);
  } catch (err) {
    console.error(err);
    ctx.main.innerHTML = `<div class="notice err">Algo salió mal al mostrar esta pantalla: ${esc(errorMessage(err))}</div>`;
  }
  window.scrollTo(0, 0);
}

async function startStore(store) {
  loading();
  try {
    await store.load();
  } catch (err) {
    if (/sesión terminó/i.test(err.message)) { showLogin('Tu sesión terminó. Vuelve a entrar.'); return; }
    root.innerHTML = `<div class="login-wrap"><div class="card login"><h2>No se pudieron cargar tus datos</h2>
      <p class="muted">${esc(errorMessage(err))}</p><button class="btn primary block" onclick="location.reload()">Intentar de nuevo</button></div></div>`;
    return;
  }
  ctx.store = store;
  render();
}

async function startDemo() {
  ctx.demo = true;
  ctx.username = '';
  safeSet(DEMO_FLAG, '1');
  const store = new LocalStore(DEMO_DATA);
  if (!store.db.accounts.length) await store.replaceAll(demoPayload(todayIso()));
  await startStore(store);
}

async function logout(everywhere = false) {
  if (ctx.demo) {
    safeSet(DEMO_FLAG, null);
    safeSet(DEMO_DATA, null);
    ctx.demo = false; ctx.store = null; ctx.ui = {};
    location.hash = '';
    init();
    return;
  }
  try { if (everywhere) await cloud.logoutEverywhere(); else await cloud.logout(); } catch { /* igual salimos */ }
  ctx.store = null; ctx.ui = {};
  location.hash = '';
  showLogin();
}

function showLogin(message = '') {
  ctx.store = null;
  const ready = cloud.isCloudConfigured();
  root.innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="brand"><div class="logo">MF</div><div><div class="t">Mis finanzas</div><div class="muted small">Entra con tu usuario y contraseña</div></div></div>
    ${message ? `<div class="notice warn" style="margin-bottom:12px">${esc(message)}</div>` : ''}
    ${ready ? `<form id="login" autocomplete="on">
      <label class="field"><span>Usuario</span><input type="text" name="user" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Ej: angel"></label>
      <label class="field"><span>Contraseña</span><input type="password" name="pass" autocomplete="current-password"></label>
      <button class="btn primary block">Entrar</button></form>`
    : `<div class="notice warn">Esta app todavía no está conectada a su base de datos. Quien la instala debe llenar el archivo <b>js/config.js</b> (ver la guía LEEME).</div>`}
    <div class="spacer"></div>
    <button class="link" id="demo">Probar con datos de ejemplo (sin cuenta)</button>
  </div></div>`;
  root.querySelector('#demo').onclick = () => startDemo();
  const form = root.querySelector('#login');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const f = formData(form);
    btn.disabled = true;
    try {
      const user = await cloud.login(f.user, f.pass);
      ctx.username = cloud.emailToUsername(user.email);
      await startStore(new cloud.SupabaseStore(user.id));
    } catch (err) {
      toast(errorMessage(err), 'err');
      btn.disabled = false;
    }
  };
}

async function init() {
  if (safeGet(DEMO_FLAG) === '1') { await startDemo(); return; }
  if (!cloud.isCloudConfigured()) { showLogin(); return; }
  loading('Abriendo…');
  try {
    const user = await cloud.currentUser();
    if (!user) { showLogin(); return; }
    ctx.username = cloud.emailToUsername(user.email);
    cloud.getClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !ctx.demo) { ctx.store = null; showLogin('Tu sesión terminó. Vuelve a entrar.'); }
    });
    await startStore(new cloud.SupabaseStore(user.id));
  } catch (err) {
    showLogin(errorMessage(err));
  }
}

window.addEventListener('hashchange', () => { if (ctx.store) render(); });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* no es indispensable */ });
}

init();
