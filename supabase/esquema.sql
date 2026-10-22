-- ============================================================================
-- Mis finanzas — base de datos para Supabase
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Se puede ejecutar varias veces sin borrar datos.
--
-- Seguridad: cada fila tiene dueño (user_id). Las reglas RLS hacen que cada
-- persona SOLO pueda leer, crear, cambiar o borrar sus propias filas, aunque
-- alguien manipule la app. Las cuentas de usuario las creas tú en el panel.
-- ============================================================================

-- ---------- Cuentas (banco, efectivo, ahorro, tarjeta) ----------
create table if not exists public.accounts (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  type             text not null check (type in ('banco','efectivo','ahorro','credito')),
  opening_balance  bigint not null default 0,
  opening_date     date not null,
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- ---------- Categorías ----------
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  group_name  text not null default 'Otros' check (char_length(group_name) <= 60),
  kind        text not null check (kind in ('gasto','ingreso')),
  system_key  text check (system_key in ('salario','pago_tarjeta_sin_detalle')),
  active      boolean not null default true,
  unique (user_id, name, kind),
  unique (user_id, system_key),
  unique (id, user_id)
);

-- ---------- Movimientos ----------
create table if not exists public.transactions (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date             date not null,
  kind             text not null check (kind in ('ingreso','gasto','transferencia')),
  from_account_id  bigint,
  to_account_id    bigint,
  category_id      bigint,
  amount           bigint not null check (amount > 0 and amount < 1000000000000),
  description      text not null default '' check (char_length(description) <= 200),
  notes            text not null default '' check (char_length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  -- Las cuentas y categorías deben ser del mismo dueño que el movimiento.
  foreign key (from_account_id, user_id) references public.accounts(id, user_id) on delete restrict,
  foreign key (to_account_id, user_id)   references public.accounts(id, user_id) on delete restrict,
  foreign key (category_id, user_id)     references public.categories(id, user_id) on delete restrict,
  check (
    (kind = 'ingreso'       and from_account_id is null     and to_account_id is not null and category_id is not null) or
    (kind = 'gasto'         and from_account_id is not null and to_account_id is null     and category_id is not null) or
    (kind = 'transferencia' and from_account_id is not null and to_account_id is not null
                            and from_account_id <> to_account_id and category_id is null)
  )
);
create index if not exists transactions_user_date on public.transactions (user_id, date);

-- ---------- Ajustes (día de pago, metas de ahorro, etc.) ----------
create table if not exists public.settings (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key      text not null check (char_length(key) <= 40),
  value    text not null check (char_length(value) <= 200),
  primary key (user_id, key)
);

-- ---------- La categoría debe corresponder al tipo de movimiento ----------
create or replace function public.check_transaction_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
       select 1 from public.categories c
        where c.id = new.category_id and c.user_id = new.user_id and c.kind = new.kind) then
    raise exception 'La categoría no corresponde al tipo de movimiento';
  end if;
  return new;
end $$;

drop trigger if exists transactions_category_kind on public.transactions;
create trigger transactions_category_kind
  before insert or update on public.transactions
  for each row execute function public.check_transaction_category();

-- ---------- Seguridad: cada quien solo ve y cambia lo suyo ----------
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','settings'] loop
    execute format('drop policy if exists "solo_el_dueno" on public.%I', t);
    execute format(
      'create policy "solo_el_dueno" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Reemplazar todos mis datos de una sola vez ----------
-- Lo usan el asistente inicial, "Importar del computador" y "Restaurar copia".
-- Todo ocurre en una transacción: si algo falla, no se cambia nada.
-- Se ejecuta con los permisos de quien llama (security invoker): las reglas RLS aplican.
create or replace function public.replace_all_data(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  acc_map jsonb := '{}'::jsonb;
  cat_map jsonb := '{}'::jsonb;
  item jsonb;
  new_id bigint;
  n_tx integer := 0;
begin
  if uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  delete from public.transactions where user_id = uid;
  delete from public.accounts     where user_id = uid;
  delete from public.categories   where user_id = uid;
  delete from public.settings     where user_id = uid;

  for item in select * from jsonb_array_elements(coalesce(payload->'accounts', '[]'::jsonb)) loop
    insert into public.accounts (user_id, name, type, opening_balance, opening_date, active, sort_order)
    values (uid, item->>'name', item->>'type', coalesce((item->>'opening_balance')::bigint, 0),
            (item->>'opening_date')::date, coalesce((item->>'active')::boolean, true),
            coalesce((item->>'sort_order')::integer, 0))
    returning id into new_id;
    acc_map := acc_map || jsonb_build_object(item->>'id', new_id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload->'categories', '[]'::jsonb)) loop
    insert into public.categories (user_id, name, group_name, kind, system_key, active)
    values (uid, item->>'name', coalesce(item->>'group_name', 'Otros'), item->>'kind',
            nullif(item->>'system_key', ''), coalesce((item->>'active')::boolean, true))
    returning id into new_id;
    cat_map := cat_map || jsonb_build_object(item->>'id', new_id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload->'transactions', '[]'::jsonb)) loop
    insert into public.transactions (user_id, date, kind, from_account_id, to_account_id,
                                     category_id, amount, description, notes)
    values (uid, (item->>'date')::date, item->>'kind',
            (acc_map->>(item->>'from_account_id'))::bigint,
            (acc_map->>(item->>'to_account_id'))::bigint,
            (cat_map->>(item->>'category_id'))::bigint,
            (item->>'amount')::bigint, coalesce(item->>'description', ''),
            coalesce(item->>'notes', ''));
    n_tx := n_tx + 1;
  end loop;

  insert into public.settings (user_id, key, value)
  select uid, s.key, s.value
    from jsonb_each_text(coalesce(payload->'settings', '{}'::jsonb)) as s(key, value);

  return jsonb_build_object('accounts', jsonb_array_length(coalesce(payload->'accounts', '[]'::jsonb)),
                            'categories', jsonb_array_length(coalesce(payload->'categories', '[]'::jsonb)),
                            'transactions', n_tx);
end $$;

revoke all on function public.replace_all_data(jsonb) from public, anon;
grant execute on function public.replace_all_data(jsonb) to authenticated;
