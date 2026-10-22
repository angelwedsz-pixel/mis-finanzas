// Leer la base de datos de la versión de computador (finanzas.db) directamente en el
// navegador, sin modificarla, y convertirla al formato de esta app.

let sqlPromise = null;

function loadSqlJs() {
  if (sqlPromise) return sqlPromise;
  sqlPromise = new Promise((resolve, reject) => {
    const base = new URL('./js/vendor/', document.baseURI).href;
    const s = document.createElement('script');
    s.src = base + 'sql-wasm.js';
    s.onload = () => window.initSqlJs({ locateFile: (f) => base + f }).then(resolve, reject);
    s.onerror = () => reject(new Error('No se pudo cargar el lector de archivos .db.'));
    document.head.appendChild(s);
  });
  return sqlPromise;
}

function rows(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

export function fromSqliteRows({ accounts, categories, transactions, settings }) {
  const skip = new Set(['schema_version']);
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, opening_balance: Number(a.opening_balance) || 0,
      opening_date: a.opening_date, active: !!a.active, sort_order: a.sort_order ?? 0 })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, group_name: c.group_name, kind: c.kind,
      system_key: c.system_key || null, active: !!c.active })),
    transactions: transactions.map((t) => ({ id: t.id, date: t.date, kind: t.kind, amount: Number(t.amount),
      from_account_id: t.from_account_id ?? null, to_account_id: t.to_account_id ?? null,
      category_id: t.category_id ?? null, description: t.description || '', notes: t.notes || '' })),
    settings: Object.fromEntries(settings.filter((s) => !skip.has(s.key)).map((s) => [s.key, String(s.value)])),
  };
}

export async function readComputerBackup(file) {
  const SQL = await loadSqlJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let db;
  try { db = new SQL.Database(bytes); } catch { throw new Error('El archivo no es una base de datos válida.'); }
  try {
    const tables = new Set(rows(db, "select name from sqlite_master where type='table'").map((r) => r.name));
    for (const t of ['accounts', 'categories', 'transactions', 'settings']) {
      if (!tables.has(t)) throw new Error('Ese archivo no es una copia de la app de computador (faltan datos).');
    }
    return fromSqliteRows({
      accounts: rows(db, 'select * from accounts order by id'),
      categories: rows(db, 'select * from categories order by id'),
      transactions: rows(db, 'select * from transactions order by id'),
      settings: rows(db, 'select key, value from settings'),
    });
  } finally { db.close(); }
}

export async function readJsonBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('El archivo no es una copia válida.'); }
  if (data?.app !== 'mis-finanzas' || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
    throw new Error('Ese archivo no es una copia de esta app.');
  }
  return data;
}

export function describe(payload) {
  return `${payload.accounts.length} cuentas, ${payload.categories.length} categorías y ${payload.transactions.length} movimientos`;
}
