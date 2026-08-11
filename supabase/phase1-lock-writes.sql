-- ============================================================
-- FASE 1 — Cerrar la escritura
--
-- QUÉ HACE
--   Deja la lectura abierta (cualquiera con el link sigue viendo
--   los números) pero exige haber iniciado sesión para agregar,
--   editar o borrar ventas.
--
-- ANTES DE CORRERLO — en este orden:
--   1. Crea los usuarios en Supabase:
--        Authentication → Users → Add user
--        Marca "Auto Confirm User" o no podrán entrar.
--        Uno para ti, uno para Sherri.
--   2. Abre la versión nueva en  .../th-internal-stats/v2/
--      y comprueba que puedes iniciar sesión y guardar una venta
--      de prueba.
--   3. Recién entonces corre este archivo.
--
-- EFECTO SECUNDARIO, A PROPÓSITO
--   El sitio viejo (la raíz, sin /v2/) no tiene pantalla de acceso,
--   así que a partir de aquí queda de solo lectura. Sigue mostrando
--   todo; simplemente ya no puede escribir. Eso es justo lo que
--   queremos: una sola puerta de entrada para editar.
--
-- CÓMO DESHACERLO
--   Si algo sale mal, el bloque comentado del final devuelve las
--   cosas exactamente a como estaban.
-- ============================================================

alter table public.transactions enable row level security;

-- Fuera las políticas abiertas
drop policy if exists "public can read"   on public.transactions;
drop policy if exists "public can insert" on public.transactions;
drop policy if exists "public can update" on public.transactions;
drop policy if exists "public can delete" on public.transactions;

-- Leer: cualquiera. Escribir: solo con sesión.
create policy "anyone can read"        on public.transactions
  for select using (true);

create policy "signed-in can insert"   on public.transactions
  for insert to authenticated with check (true);

create policy "signed-in can update"   on public.transactions
  for update to authenticated using (true) with check (true);

create policy "signed-in can delete"   on public.transactions
  for delete to authenticated using (true);


-- Comprobación: deben aparecer cuatro filas, tres de ellas con
-- roles = {authenticated}.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'transactions'
order by cmd, policyname;


-- ============================================================
-- REVERTIR (solo si hace falta) — descomenta y corre este bloque
-- ============================================================
-- drop policy if exists "anyone can read"      on public.transactions;
-- drop policy if exists "signed-in can insert" on public.transactions;
-- drop policy if exists "signed-in can update" on public.transactions;
-- drop policy if exists "signed-in can delete" on public.transactions;
--
-- create policy "public can read"   on public.transactions for select using (true);
-- create policy "public can insert" on public.transactions for insert with check (true);
-- create policy "public can update" on public.transactions for update using (true) with check (true);
-- create policy "public can delete" on public.transactions for delete using (true);
