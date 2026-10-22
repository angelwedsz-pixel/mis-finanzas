// Formato de dinero en pesos colombianos (todo se guarda en pesos enteros).

export function cop(value, signed = false) {
  const n = Math.round(Number(value) || 0);
  const text = '$' + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (n < 0) return '-' + text;
  if (signed && n > 0) return '+' + text;
  return text;
}

// '$1.900.000', '1900000' o '1.900.000' -> 1900000. Lanza Error si no es válido.
export function parseCop(text) {
  if (typeof text === 'number') return Math.round(text);
  let s = String(text ?? '').trim().replace(/\$/g, '').replace(/\./g, '').replace(/\s/g, '').replace(/,/g, '');
  let sign = 1;
  if (s.startsWith('-')) { sign = -1; s = s.slice(1); }
  if (!/^\d+$/.test(s)) throw new Error(`Valor no válido: ${text}`);
  return sign * parseInt(s, 10);
}

// Lee un campo de dinero con mensajes claros.
export function readMoney(text, field = 'El valor', { allowZero = false, allowNegative = false } = {}) {
  if (text === null || text === undefined || String(text).trim() === '') {
    if (allowZero) return 0;
    throw new Error(`${field}: escribe cuánto dinero es.`);
  }
  let value;
  try { value = parseCop(text); } catch {
    throw new Error(`${field} no es un número válido. Escribe, por ejemplo, 15000 o 15.000.`);
  }
  if (value < 0 && !allowNegative) throw new Error(`${field} no puede ser negativo.`);
  if (value === 0 && !allowZero) throw new Error(`${field} debe ser mayor que cero.`);
  return value;
}
