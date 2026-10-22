\set ON_ERROR_STOP on
-- Usuario A: Angel
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.replace_all_data('{
  "accounts":[{"id":1,"name":"Davivienda","type":"banco","opening_balance":32000,"opening_date":"2026-10-19"},
              {"id":2,"name":"Nu Cajita","type":"ahorro","opening_balance":342354,"opening_date":"2026-10-19"}],
  "categories":[{"id":10,"name":"Salario","group_name":"Ingresos","kind":"ingreso","system_key":"salario"},
                {"id":11,"name":"Almuerzos","group_name":"Alimentación","kind":"gasto"}],
  "transactions":[{"date":"2026-10-20","kind":"ingreso","to_account_id":2,"category_id":10,"amount":2236000,"description":"Salario"},
                  {"date":"2026-10-20","kind":"transferencia","from_account_id":1,"to_account_id":2,"amount":368000}],
  "settings":{"dia_pago":"20","configurado":"1"}}'::jsonb) as resultado_a;
select count(*) as a_ve_sus_movimientos from public.transactions;

-- Usuario B: el amigo
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as b_ve_movimientos_ajenos from public.transactions;
select count(*) as b_ve_cuentas_ajenas from public.accounts;
update public.accounts set name = 'hackeada';
select count(*) as b_ve_ajustes_ajenos from public.settings;
delete from public.transactions;
-- B no puede insertar filas a nombre de A
do $$ begin
  insert into public.settings (user_id, key, value) values ('11111111-1111-1111-1111-111111111111', 'x', 'y');
  raise exception 'FALLO: B pudo escribir a nombre de A';
exception when insufficient_privilege then raise notice 'OK: B no puede escribir a nombre de A';
end $$;
-- B no puede usar la cuenta de A en un movimiento suyo
insert into public.categories (name, group_name, kind) values ('Comida', 'Alimentación', 'gasto');
do $$ declare a_acc bigint; begin
  select id into a_acc from public.accounts limit 1;  -- B no ve ninguna
  if a_acc is not null then raise exception 'FALLO: B ve cuentas ajenas'; end if;
  begin
    insert into public.transactions (date, kind, from_account_id, category_id, amount)
    select '2026-10-21', 'gasto', 1, (select id from public.categories where name='Comida'), 1000;
    raise exception 'FALLO: B usó la cuenta de A';
  exception when foreign_key_violation then raise notice 'OK: B no puede usar cuentas de A';
  end;
end $$;

-- A sigue intacto
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select count(*) as a_movimientos_intactos, (select name from public.accounts order by id limit 1) as a_cuenta from public.transactions;
-- Categoría de tipo equivocado se rechaza
do $$ begin
  insert into public.transactions (date, kind, from_account_id, category_id, amount)
  select '2026-10-21', 'gasto', (select id from public.accounts where name='Davivienda'),
         (select id from public.categories where name='Salario'), 1000;
  raise exception 'FALLO: aceptó categoría de ingreso en un gasto';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
  raise notice 'OK: rechaza categoría equivocada';
end $$;

-- Visitante sin sesión (anon) no ve nada
reset role;
set role anon;
do $$ begin
  perform count(*) from public.transactions;
  raise exception 'FALLO: anon pudo leer';
exception when insufficient_privilege then raise notice 'OK: sin sesión no se ve nada';
end $$;
do $$ begin
  perform public.replace_all_data('{}'::jsonb);
  raise exception 'FALLO: anon pudo ejecutar replace_all_data';
exception when insufficient_privilege then raise notice 'OK: sin sesión no puede reemplazar datos';
end $$;
