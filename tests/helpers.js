import { LocalStore } from '../js/data/store.js';
import { buildInitialPayload } from '../js/core/setup.js';
export const HOY = '2026-10-20';

// Igual que los datos reales del 20/10/2026 (efectivo $85.000).
export async function storeReal() {
  const s = new LocalStore();
  await s.replaceAll(buildInitialPayload({
    cutoff: HOY,
    accounts: [{ name: 'Davivienda', type: 'banco', balance: 1900000 }, { name: 'Efectivo', type: 'efectivo', balance: 85000 },
      { name: 'Nu Cajita', type: 'ahorro', balance: 710354 }],
    salaryToday: 2236000, savingsToday: 368000, bank: 'Davivienda', savings: 'Nu Cajita',
    settings: { dia_pago: 20, salario_referencia: 2250000, ahorro_valor: 300000, ahorro_extra_meta: 200000 },
  }));
  return s;
}
export const acc = (s, name) => s.state.accounts.find((a) => a.name === name).id;
export const cat = (s, name) => s.state.categories.find((c) => c.name === name).id;
