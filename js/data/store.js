// Acceso a los datos. La lógica (validar, evitar duplicados, mantener la memoria al día)
// es común; cada "almacén" solo implementa cómo leer y escribir:
//  - SupabaseStore: tus datos en la nube, con tu cuenta (ver supabase.js).
//  - LocalStore: datos de ejemplo guardados en este navegador (modo prueba) y pruebas.

import { ACCOUNT_TYPES } from '../core/defaults.js';
import { DuplicateError, ValidationError, findDuplicate, validateTransaction } from '../core/calc.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

export class BaseStore {
  constructor() {
    this.state = { accounts: [], categories: [], transactions: [], settings: {} };
    this.version = 0;          // sube con cada cambio: sirve para refrescar la pantalla
  }

  touch() { this.version += 1; }

  async load() {
    this.state = await this._loadAll();
    this.touch();
    return this.state;
  }

  isConfigured() { return this.state.settings.configurado === '1'; }

  // ---------- Movimientos ----------
  async addTransaction(tx, { allowDuplicate = false } = {}) {
    const clean = validateTransaction(this.state, tx);
    if (!allowDuplicate) {
      const dup = findDuplicate(this.state, clean);
      if (dup != null) throw new DuplicateError(dup);
    }
    const row = await this._insert('transactions', clean);
    this.state.transactions.push(row);
    this.touch();
    return row;
  }

  async updateTransaction(id, tx) {
    const clean = validateTransaction(this.state, tx, id);
    const row = await this._update('transactions', id, { ...clean, updated_at: new Date().toISOString() });
    const i = this.state.transactions.findIndex((t) => t.id === id);
    this.state.transactions[i] = row;
    this.touch();
    return row;
  }

  async deleteTransaction(id) {
    await this._delete('transactions', id);
    this.state.transactions = this.state.transactions.filter((t) => t.id !== id);
    this.touch();
  }

  // ---------- Cuentas ----------
  _validateAccount({ name, type, opening_date }, id = null) {
    name = String(name || '').trim();
    if (!name) throw new ValidationError('La cuenta necesita un nombre.');
    if (name.length > 60) throw new ValidationError('El nombre es demasiado largo (máximo 60 caracteres).');
    if (!ACCOUNT_TYPES[type]) throw new ValidationError('Tipo de cuenta no válido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opening_date || '')) throw new ValidationError('La fecha de inicio no es válida.');
    if (this.state.accounts.some((a) => a.id !== id && a.name.toLowerCase() === name.toLowerCase())) {
      throw new ValidationError(`Ya existe una cuenta llamada «${name}».`);
    }
    return name;
  }

  async addAccount({ name, type, opening_balance = 0, opening_date }) {
    name = this._validateAccount({ name, type, opening_date });
    const order = Math.max(0, ...this.state.accounts.map((a) => a.sort_order)) + 1;
    const row = await this._insert('accounts', {
      name, type, opening_balance: Math.round(opening_balance), opening_date, active: true, sort_order: order,
    });
    this.state.accounts.push(row);
    this.touch();
    return row;
  }

  async updateAccount(id, { name, type, opening_balance, opening_date }) {
    name = this._validateAccount({ name, type, opening_date }, id);
    const first = this.state.transactions
      .filter((t) => t.from_account_id === id || t.to_account_id === id)
      .map((t) => t.date).sort()[0];
    if (first && first < opening_date) {
      throw new ValidationError(`Hay movimientos desde el ${first}; la fecha de inicio no puede ser posterior.`);
    }
    const row = await this._update('accounts', id, { name, type, opening_balance: Math.round(opening_balance), opening_date });
    this.state.accounts[this.state.accounts.findIndex((a) => a.id === id)] = row;
    this.touch();
  }

  async setAccountActive(id, active) {
    const row = await this._update('accounts', id, { active: !!active });
    this.state.accounts[this.state.accounts.findIndex((a) => a.id === id)] = row;
    this.touch();
  }

  async deleteAccount(id) {
    if (this.state.transactions.some((t) => t.from_account_id === id || t.to_account_id === id)) {
      throw new ValidationError('La cuenta tiene movimientos. Desactívala en lugar de borrarla.');
    }
    await this._delete('accounts', id);
    this.state.accounts = this.state.accounts.filter((a) => a.id !== id);
    this.touch();
  }

  // ---------- Categorías ----------
  async addCategory({ name, group_name, kind }) {
    name = String(name || '').trim();
    group_name = String(group_name || '').trim() || name;
    if (!name) throw new ValidationError('La categoría necesita un nombre.');
    if (!['gasto', 'ingreso'].includes(kind)) throw new ValidationError('Tipo de categoría no válido.');
    if (this.state.categories.some((c) => c.kind === kind && c.name.toLowerCase() === name.toLowerCase())) {
      throw new ValidationError(`Ya existe la categoría «${name}».`);
    }
    const row = await this._insert('categories', { name, group_name, kind, system_key: null, active: true });
    this.state.categories.push(row);
    this.touch();
    return row;
  }

  async updateCategory(id, { name, group_name }) {
    const cat = this.state.categories.find((c) => c.id === id);
    if (!cat) throw new ValidationError('La categoría no existe.');
    name = String(name || '').trim();
    group_name = String(group_name || '').trim() || name;
    if (!name) throw new ValidationError('La categoría necesita un nombre.');
    if (this.state.categories.some((c) => c.id !== id && c.kind === cat.kind && c.name.toLowerCase() === name.toLowerCase())) {
      throw new ValidationError(`Ya existe la categoría «${name}».`);
    }
    const row = await this._update('categories', id, { name, group_name });
    this.state.categories[this.state.categories.findIndex((c) => c.id === id)] = row;
    this.touch();
  }

  async setCategoryActive(id, active) {
    const cat = this.state.categories.find((c) => c.id === id);
    if (!cat) throw new ValidationError('La categoría no existe.');
    if (cat.system_key === 'salario' && !active) {
      throw new ValidationError('La categoría Salario no se puede desactivar: la app la usa para saber si ya te pagaron.');
    }
    const row = await this._update('categories', id, { active: !!active });
    this.state.categories[this.state.categories.findIndex((c) => c.id === id)] = row;
    this.touch();
  }

  // ---------- Ajustes ----------
  async setSettings(values) {
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));
    await this._upsertSettings(clean);
    Object.assign(this.state.settings, clean);
    this.touch();
  }

  // ---------- Copias ----------
  exportData() {
    const s = clone(this.state);
    return {
      app: 'mis-finanzas', version: 1, exported_at: new Date().toISOString(),
      accounts: s.accounts, categories: s.categories,
      transactions: s.transactions.map(({ id, date, kind, from_account_id, to_account_id, category_id, amount, description, notes }) =>
        ({ id, date, kind, from_account_id, to_account_id, category_id, amount, description, notes })),
      settings: s.settings,
    };
  }

  async replaceAll(payload) {
    const result = await this._replaceAll(payload);
    await this.load();
    return result;
  }
}

// ---------- Almacén en este navegador (modo prueba y pruebas automáticas) ----------
export class LocalStore extends BaseStore {
  constructor(storageKey = null, storage = null) {
    super();
    this.storageKey = storageKey;
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.db = { accounts: [], categories: [], transactions: [], settings: {}, seq: 1 };
    if (storageKey && this.storage) {
      try {
        const raw = this.storage.getItem(storageKey);
        if (raw) this.db = JSON.parse(raw);
      } catch { /* sin almacenamiento: queda en memoria */ }
    }
  }

  _save() {
    if (!this.storageKey || !this.storage) return;
    try { this.storage.setItem(this.storageKey, JSON.stringify(this.db)); } catch { /* lleno o bloqueado */ }
  }

  async _loadAll() { return clone({ accounts: this.db.accounts, categories: this.db.categories, transactions: this.db.transactions, settings: this.db.settings }); }

  async _insert(table, row) {
    const full = { ...clone(row), id: this.db.seq++ };
    this.db[table].push(full);
    this._save();
    return clone(full);
  }

  async _update(table, id, fields) {
    const row = this.db[table].find((r) => r.id === id);
    if (!row) throw new ValidationError('El registro ya no existe.');
    Object.assign(row, clone(fields));
    this._save();
    return clone(row);
  }

  async _delete(table, id) {
    this.db[table] = this.db[table].filter((r) => r.id !== id);
    this._save();
  }

  async _upsertSettings(values) {
    Object.assign(this.db.settings, values);
    this._save();
  }

  async _replaceAll(payload) {
    const db = { accounts: [], categories: [], transactions: [], settings: {}, seq: 1 };
    const accMap = new Map(), catMap = new Map();
    for (const a of payload.accounts || []) {
      const id = db.seq++;
      accMap.set(a.id, id);
      db.accounts.push({ id, name: a.name, type: a.type, opening_balance: Number(a.opening_balance) || 0,
        opening_date: a.opening_date, active: a.active !== false, sort_order: a.sort_order ?? 0 });
    }
    for (const c of payload.categories || []) {
      const id = db.seq++;
      catMap.set(c.id, id);
      db.categories.push({ id, name: c.name, group_name: c.group_name || 'Otros', kind: c.kind,
        system_key: c.system_key || null, active: c.active !== false });
    }
    for (const t of payload.transactions || []) {
      db.transactions.push({ id: db.seq++, date: t.date, kind: t.kind, amount: Number(t.amount),
        from_account_id: t.from_account_id != null ? accMap.get(t.from_account_id) ?? null : null,
        to_account_id: t.to_account_id != null ? accMap.get(t.to_account_id) ?? null : null,
        category_id: t.category_id != null ? catMap.get(t.category_id) ?? null : null,
        description: t.description || '', notes: t.notes || '' });
    }
    db.settings = { ...(payload.settings || {}) };
    this.db = db;
    this._save();
    return { accounts: db.accounts.length, categories: db.categories.length, transactions: db.transactions.length };
  }
}
