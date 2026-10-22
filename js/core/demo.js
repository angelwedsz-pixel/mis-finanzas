// Datos de ejemplo (inventados) para el modo de prueba.

import { periodFor, shiftPeriod, addDays, parts } from './periods.js';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './defaults.js';

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

export function demoPayload(today) {
  const pd = 20;
  const r = rng(42);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const current = periodFor(today, pd);
  const first = shiftPeriod(current, -3, pd);
  const start = addDays(first.start, -1);
  const accounts = [
    { id: 1, name: 'Banco (ejemplo)', type: 'banco', opening_balance: 350000, opening_date: start, sort_order: 1 },
    { id: 2, name: 'Efectivo (ejemplo)', type: 'efectivo', opening_balance: 60000, opening_date: start, sort_order: 2 },
    { id: 3, name: 'Ahorro (ejemplo)', type: 'ahorro', opening_balance: 500000, opening_date: start, sort_order: 3 },
    { id: 4, name: 'Tarjeta (ejemplo)', type: 'credito', opening_balance: 0, opening_date: start, sort_order: 4 },
  ];
  const categories = DEFAULT_CATEGORIES.map(([name, group_name, kind, system_key], i) => ({ id: 100 + i, name, group_name, kind, system_key }));
  const cat = (n) => categories.find((c) => c.name === n).id;
  const tx = [];
  const add = (date, kind, amount, from, to, category, description) => {
    if (date > today) return;
    tx.push({ date, kind, amount, from_account_id: from, to_account_id: to, category_id: category ? cat(category) : null, description });
  };
  let p = first;
  while (p.start <= current.start) {
    add(p.start, 'ingreso', pick([2236000, 2250000, 2241000]), null, 1, 'Salario', 'Salario');
    add(p.start, 'transferencia', 300000, 1, 3, null, 'Ahorro del mes');
    add(addDays(p.start, 1), 'transferencia', 150000, 1, 2, null, 'Retiro en cajero');
    add(addDays(p.start, 2), 'transferencia', 480000, 1, 4, null, 'Pago tarjeta');
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) {
      const wd = new Date(Date.UTC(parts(d).y, parts(d).m - 1, parts(d).d)).getUTCDay();
      if (wd >= 1 && wd <= 5) add(d, 'gasto', pick([13000, 15000, 16500, 18000]), r() < 0.4 ? 2 : 1, null, 'Almuerzos', 'Almuerzo');
      if (wd === 1 || wd === 4) add(d, 'gasto', pick([50000, 55000, 60000]), 4, null, 'Gasolina', 'Tanqueada');
      if (wd === 6) add(d, 'gasto', pick([25000, 40000, 65000]), 4, null, 'Ocio y gustos', 'Salida');
      if (wd === 0) add(d, 'gasto', pick([70000, 85000, 95000]), 1, null, 'Mercado', 'Mercado de la semana');
      if (parts(d).d === 7) add(d, 'gasto', 70000, 1, null, 'Parqueadero', 'Parqueadero mensual');
    }
    p = shiftPeriod(p, 1, pd);
  }
  return {
    accounts, categories, transactions: tx,
    settings: { ...DEFAULT_SETTINGS, dia_pago: '20', salario_referencia: '2250000', ahorro_valor: '300000',
      ahorro_extra_meta: '200000', configurado: '1' },
  };
}
