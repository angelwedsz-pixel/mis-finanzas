// Conexión con Supabase: inicio de sesión con usuario y contraseña, y lectura/escritura
// de tus datos. Las reglas de la base de datos impiden ver o cambiar datos de otras personas.

import { CONFIG } from '../config.js';
import { BaseStore } from './store.js';
import { ValidationError } from '../core/calc.js';

let client = null;

export function isCloudConfigured() {
  return /^https:\/\/.+/.test(CONFIG.SUPABASE_URL || '') && (CONFIG.SUPABASE_KEY || '').length > 20;
}

export function getClient() {
  if (!client) {
    if (!window.supabase) throw new Error('No se pudo cargar la librería de Supabase.');
    client = window.supabase.createClient(CONFIG.SUPABASE_URL.trim(), CONFIG.SUPABASE_KEY.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
        storageKey: 'mis-finanzas-sesion' },
    });
  }
  return client;
}

export function usernameToEmail(username) {
  const u = String(username || '').trim().toLowerCase();
  return u.includes('@') ? u : `${u}@${CONFIG.USER_DOMAIN}`;
}

export function emailToUsername(email) {
  const e = String(email || '');
  const suffix = '@' + CONFIG.USER_DOMAIN;
  return e.toLowerCase().endsWith(suffix) ? e.slice(0, -suffix.length) : e;
}

function friendlyAuthError(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return 'Usuario o contraseña incorrectos.';
  if (msg.includes('email not confirmed')) return 'Esta cuenta no está activada. En Supabase, al crearla marca "Auto Confirm User".';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Demasiados intentos. Espera unos minutos y vuelve a intentar.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'No hay conexión a internet o no se pudo contactar el servidor.';
  if (msg.includes('should be at least')) return 'La contraseña es muy corta.';
  if (msg.includes('same') && msg.includes('password')) return 'La contraseña nueva debe ser distinta a la actual.';
  return error?.message || 'Ocurrió un error. Intenta de nuevo.';
}

export async function currentUser() {
  const { data } = await getClient().auth.getSession();
  return data?.session?.user ?? null;
}

export async function login(username, password) {
  const u = String(username || '').trim();
  if (!u) throw new Error('Escribe tu usuario.');
  if (!password) throw new Error('Escribe tu contraseña.');
  const { data, error } = await getClient().auth.signInWithPassword({ email: usernameToEmail(u), password });
  if (error) throw new Error(friendlyAuthError(error));
  return data.user;
}

export async function logout() {
  await getClient().auth.signOut();
}

export async function changePassword(currentPassword, newPassword, confirm) {
  if (!newPassword || newPassword.length < 8) throw new Error('La contraseña nueva debe tener al menos 8 caracteres.');
  if (newPassword !== confirm) throw new Error('Las dos contraseñas nuevas no coinciden.');
  const user = await currentUser();
  if (!user) throw new Error('Tu sesión terminó. Vuelve a entrar.');
  // Confirmar la contraseña actual antes de cambiarla.
  const check = await getClient().auth.signInWithPassword({ email: user.email, password: currentPassword || '' });
  if (check.error) throw new Error('La contraseña actual no es correcta.');
  const { error } = await getClient().auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendlyAuthError(error));
}

export async function logoutEverywhere() {
  await getClient().auth.signOut({ scope: 'global' });
}

function dbError(error) {
  const msg = error?.message || '';
  if (/failed to fetch|network/i.test(msg)) return new Error('Sin conexión: no se pudo guardar. Revisa tu internet e intenta de nuevo.');
  if (/JWT|expired|not authenticated|Debes iniciar/i.test(msg)) return new Error('Tu sesión terminó. Vuelve a entrar.');
  if (/categoría no corresponde/i.test(msg)) return new ValidationError('La categoría no corresponde al tipo de movimiento.');
  if (/duplicate key|unique/i.test(msg)) return new ValidationError('Ya existe un registro con ese nombre.');
  if (/foreign key|violates/i.test(msg)) return new ValidationError('No se puede: hay movimientos que dependen de este registro.');
  return new Error(msg || 'No se pudo guardar. Intenta de nuevo.');
}

const COLS = {
  accounts: 'id,name,type,opening_balance,opening_date,active,sort_order',
  categories: 'id,name,group_name,kind,system_key,active',
  transactions: 'id,date,kind,from_account_id,to_account_id,category_id,amount,description,notes',
};

function normalize(table, row) {
  if (!row) return row;
  const r = { ...row };
  for (const k of ['id', 'opening_balance', 'sort_order', 'amount', 'from_account_id', 'to_account_id', 'category_id']) {
    if (r[k] !== undefined && r[k] !== null) r[k] = Number(r[k]);
  }
  return r;
}

export class SupabaseStore extends BaseStore {
  constructor(userId) {
    super();
    this.userId = userId;
    this.db = getClient();
  }

  async _fetchAll(table) {
    const out = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await this.db.from(table).select(COLS[table]).order('id').range(from, from + page - 1);
      if (error) throw dbError(error);
      out.push(...data.map((r) => normalize(table, r)));
      if (data.length < page) break;
    }
    return out;
  }

  async _loadAll() {
    const [accounts, categories, transactions, settingsRes] = await Promise.all([
      this._fetchAll('accounts'), this._fetchAll('categories'), this._fetchAll('transactions'),
      this.db.from('settings').select('key,value'),
    ]);
    if (settingsRes.error) throw dbError(settingsRes.error);
    const settings = Object.fromEntries(settingsRes.data.map((r) => [r.key, r.value]));
    return { accounts, categories, transactions, settings };
  }

  async _insert(table, row) {
    const { data, error } = await this.db.from(table).insert({ ...row, user_id: this.userId }).select(COLS[table]).single();
    if (error) throw dbError(error);
    return normalize(table, data);
  }

  async _update(table, id, fields) {
    const { data, error } = await this.db.from(table).update(fields).eq('id', id).select(COLS[table]).single();
    if (error) throw dbError(error);
    return normalize(table, data);
  }

  async _delete(table, id) {
    const { error } = await this.db.from(table).delete().eq('id', id);
    if (error) throw dbError(error);
  }

  async _upsertSettings(values) {
    const rows = Object.entries(values).map(([key, value]) => ({ user_id: this.userId, key, value }));
    const { error } = await this.db.from('settings').upsert(rows, { onConflict: 'user_id,key' });
    if (error) throw dbError(error);
  }

  async _replaceAll(payload) {
    const { data, error } = await this.db.rpc('replace_all_data', { payload });
    if (error) throw dbError(error);
    return data;
  }
}
