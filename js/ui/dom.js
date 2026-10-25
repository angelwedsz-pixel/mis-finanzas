// Utilidades de pantalla: escapar texto, íconos, mensajes, ventanas y campos de dinero.

import { cop } from '../core/money.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3 3 8h18z',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  out: 'M7 17 17 7M9 7h8v8',          // gasto (sale)
  in: 'M17 7 7 17M15 17H7V9',          // ingreso (entra)
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  pig: 'M5 11a7 6 0 0 1 13-2h2v4l-2 1v3h-3v-2H9v2H6v-3a5 5 0 0 1-1-3zM15 10h.01',
  card: 'M3 6h18v12H3zM3 10h18',
  unlock: 'M7 11V7a5 5 0 0 1 9.6-2M5 11h14v10H5z',
  close: 'M6 6l12 12M18 6 6 18',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`;
}

let toastTimer = null;
export function toast(message, kind = 'ok') {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3500);
}

// Ventana (abajo en el celular). content: HTML. onMount(dialog) para enlazar eventos.
export function openDialog(title, content, onMount) {
  const d = document.createElement('dialog');
  d.innerHTML = `<div class="dialog-head"><h2 style="margin:0">${esc(title)}</h2>
    <button class="btn small" data-close aria-label="Cerrar">${icon('close')}</button></div>${content}`;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.showModal();
  onMount?.(d);
  return d;
}

export function confirmDialog(title, message, okLabel = 'Sí, continuar', danger = true) {
  return new Promise((resolve) => {
    const d = openDialog(title, `<p class="muted">${esc(message)}</p>
      <div class="row" style="margin-top:14px"><button class="btn grow" data-no>Cancelar</button>
      <button class="btn grow ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`);
    let answered = false;
    d.querySelector('[data-yes]').onclick = () => { answered = true; d.close(); resolve(true); };
    d.querySelector('[data-no]').onclick = () => { answered = true; d.close(); resolve(false); };
    d.addEventListener('close', () => { if (!answered) resolve(false); });
  });
}

// Campo de dinero: teclado numérico en el celular y puntos de miles mientras escribes.
export function moneyInput(name, value = null, placeholder = 'Ej: 15.000', extra = '') {
  const v = value === null || value === undefined ? '' : cop(value).replace('$', '');
  return `<input type="text" inputmode="numeric" class="money" name="${name}" value="${esc(v)}" placeholder="${esc(placeholder)}" autocomplete="off" ${extra}>`;
}

export function bindMoneyInputs(root) {
  for (const inp of root.querySelectorAll('input.money')) {
    inp.addEventListener('input', () => {
      const neg = inp.value.trim().startsWith('-') && inp.dataset.negative === '1';
      const digits = inp.value.replace(/\D/g, '');
      inp.value = (neg ? '-' : '') + (digits ? Number(digits).toLocaleString('es-CO').replace(/,/g, '.') : '');
    });
  }
}

// Botones "chips" para elegir una opción. Devuelve HTML; el valor queda en un input oculto.
export function chips(name, items, selected, { label = '', extra = null } = {}) {
  const sel = items.some((i) => i.value === selected) ? selected : items[0]?.value;
  return `<div class="field">${label ? `<span class="muted small" style="display:block;margin-bottom:6px">${esc(label)}</span>` : ''}
    <div class="chips" data-chips="${name}">
      ${items.map((i) => `<button type="button" class="chip ${i.value === sel ? 'on' : ''}" data-value="${esc(i.value)}">${esc(i.label)}</button>`).join('')}
      ${extra || ''}
    </div><input type="hidden" name="${name}" value="${esc(sel ?? '')}"></div>`;
}

export function bindChips(root, onChange) {
  for (const group of root.querySelectorAll('[data-chips]')) {
    const hidden = root.querySelector(`input[name="${group.dataset.chips}"]`);
    group.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      hidden.value = b.dataset.value;
      onChange?.(group.dataset.chips, b.dataset.value);
    });
  }
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const money = (v, signed = false) => esc(cop(v, signed));
