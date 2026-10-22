// Períodos de pago (mensual o quincenal): del día de pago hasta el día anterior al siguiente pago.
// Con día de pago 20: el período de octubre 2026 va del 20/10/2026 al 19/11/2026.
// Si el día de pago no existe en un mes (por ejemplo 31 en febrero), se usa el último día.
// Las fechas se manejan como texto 'AAAA-MM-DD' para evitar problemas de zona horaria.

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const pad = (n) => String(n).padStart(2, '0');

export function iso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

export function parts(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

export function addDays(s, n) {
  const { y, m, d } = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function diffDays(a, b) {   // b - a, en días
  const pa = parts(a), pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

export function todayIso() {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function addMonths(y, m, delta) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function payDate(y, m, payDay) {
  if (!(payDay >= 1 && payDay <= 31)) throw new Error('El día de pago debe estar entre 1 y 31.');
  return iso(y, m, Math.min(payDay, daysInMonth(y, m)));
}

// Días de pago: un número (pago mensual, ej. 20) o una lista (pago quincenal, ej. [15, 30]).
function payDays(days) {
  const list = (Array.isArray(days) ? days : [days]).map(Number);
  for (const d of list) if (!(d >= 1 && d <= 31)) throw new Error('El día de pago debe estar entre 1 y 31.');
  return list;
}

function payDatesInMonth(y, m, days) {
  return [...new Set(payDays(days).map((d) => payDate(y, m, d)))].sort();
}

// Período que contiene la fecha: desde el último día de pago hasta el día antes del siguiente.
export function periodFor(dateStr, days) {
  const { y, m } = parts(dateStr);
  const prev = addMonths(y, m, -1), next = addMonths(y, m, 1);
  const all = [...payDatesInMonth(prev.y, prev.m, days), ...payDatesInMonth(y, m, days),
    ...payDatesInMonth(next.y, next.m, days)];
  const start = all.filter((d) => d <= dateStr).pop();
  const nextPay = all.find((d) => d > dateStr);
  return makePeriod(start, addDays(nextPay, -1));
}

function makePeriod(start, end) {
  return {
    start, end,
    nextPayDate: addDays(end, 1),
    key: start,
    contains: (d) => start <= d && d <= end,
    daysLeft(today) {
      if (today < start) return diffDays(start, end) + 1;
      if (today > end) return 0;
      return diffDays(today, end) + 1;
    },
  };
}

export function shiftPeriod(p, delta, days) {
  let q = p;
  for (let i = 0; i < Math.abs(delta); i++) {
    q = delta > 0 ? periodFor(addDays(q.end, 1), days) : periodFor(addDays(q.start, -1), days);
  }
  return q;
}

export function periodsBetween(first, last, days) {
  const out = [];
  let p = periodFor(first, days);
  const stop = periodFor(last, days);
  while (p.start <= stop.start) {
    out.push(p);
    p = shiftPeriod(p, 1, days);
  }
  return out;
}

export function shortDate(s, today = todayIso()) {
  const { y, m, d } = parts(s);
  const text = `${d} ${MESES[m - 1].slice(0, 3)}`;
  return y === parts(today).y ? text : `${text} ${y}`;
}

export function longDate(s, { weekday = false, today = todayIso() } = {}) {
  const { y, m, d } = parts(s);
  let text = `${d} de ${MESES[m - 1]}`;
  if (y !== parts(today).y) text += ` de ${y}`;
  if (weekday) text = `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${text}`;
  return text;
}

export function numericDate(s) {
  const { y, m, d } = parts(s);
  return `${pad(d)}/${pad(m)}/${y}`;
}
