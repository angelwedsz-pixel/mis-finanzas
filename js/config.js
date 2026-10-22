// ============================================================================
// CONFIGURACIÓN — el único archivo que tienes que editar.
// Copia estos dos datos desde Supabase → Project Settings → API (o "Connect"):
//   - Project URL           → SUPABASE_URL
//   - anon public / publishable key → SUPABASE_KEY
// Esa llave es pública por diseño: la seguridad la dan las reglas de la base de datos.
// NUNCA pongas aquí la llave "service_role" / "secret".
// ============================================================================

export const CONFIG = {
  SUPABASE_URL: 'https://ikgvgusoninwjynfvwxk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_XZg31RrEFMpwmRRCtx4kGA_nIP_a48_',

  // Los usuarios (por ejemplo "angel") se guardan en Supabase como angel@finanzas.invalid.
  // ".invalid" es un dominio reservado que nunca recibe correos.
  USER_DOMAIN: 'finanzas.invalid',
};
