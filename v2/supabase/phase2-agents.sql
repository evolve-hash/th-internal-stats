-- ============================================================
-- FASE 2 — Agentes y reparto de comisiones
--
-- QUÉ CREA
--   agents   catálogo del equipo, con nivel y años activos
--   payouts  quién cobró cuánto en cada venta
--
-- SEGURIDAD
--   Esto es información de nómina, así que a diferencia de las
--   comisiones, aquí NI SIQUIERA LA LECTURA es pública: hay que
--   tener sesión. Sin login, la sección de agentes no existe.
--
-- CÓMO CORRERLO
--   SQL Editor → New query → pega todo → Run.
--   Después abre /v2/ con tu sesión y la app carga los 15 años
--   de pagos sola, igual que hizo con las ventas.
--
-- Es seguro correrlo varias veces.
-- ============================================================

-- ---------- catálogo del equipo ----------
create table if not exists public.agents (
  id            bigint generated always as identity primary key,
  name          text not null unique,

  -- 'agent' = persona del equipo · 'house' = la parte de Team Howe
  role          text not null default 'agent' check (role in ('agent','house')),

  -- Associate Level 1–3 según la hoja "Compass Splits".
  -- Null para la casa y para quienes operaron bajo tablas anteriores
  -- sin nivel identificable.
  level         integer check (level between 1 and 3),
  level_source  text,

  first_year    integer,
  last_year     integer,
  active        boolean not null default false,

  created_at    timestamptz not null default now()
);

-- ---------- reparto por venta ----------
create table if not exists public.payouts (
  id             bigint generated always as identity primary key,

  -- Nulo a propósito: unos 128 registros históricos son bonos y
  -- ajustes que no cuelgan de una venta concreta. Se guardan igual
  -- para que los totales por persona queden completos.
  transaction_id bigint references public.transactions(id) on delete cascade,

  agent          text not null,
  amount         numeric not null,
  role           text not null default 'agent' check (role in ('agent','house')),

  -- Año de producción, replicado aquí para poder agrupar sin join
  -- (y para que los pagos sin venta asociada sigan teniendo año).
  year           integer,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists payouts_tx_idx    on public.payouts (transaction_id);
create index if not exists payouts_agent_idx on public.payouts (agent);
create index if not exists payouts_year_idx  on public.payouts (year);

drop trigger if exists payouts_touch on public.payouts;
create trigger payouts_touch
  before update on public.payouts
  for each row execute function public.touch_updated_at();


-- ============================================================
-- PERMISOS — todo detrás de sesión, lectura incluida
-- ============================================================
alter table public.agents  enable row level security;
alter table public.payouts enable row level security;

drop policy if exists "signed-in can read agents"   on public.agents;
drop policy if exists "signed-in can write agents"  on public.agents;
drop policy if exists "signed-in can read payouts"  on public.payouts;
drop policy if exists "signed-in can write payouts" on public.payouts;

create policy "signed-in can read agents"   on public.agents
  for select to authenticated using (true);
create policy "signed-in can write agents"  on public.agents
  for all    to authenticated using (true) with check (true);

create policy "signed-in can read payouts"  on public.payouts
  for select to authenticated using (true);
create policy "signed-in can write payouts" on public.payouts
  for all    to authenticated using (true) with check (true);


-- Comprobación: cuatro políticas, todas {authenticated},
-- y ninguna con {public} — eso es lo que mantiene la nómina privada.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('agents','payouts')
order by tablename, cmd, policyname;


-- ============================================================
-- REVERTIR (borra las tablas y todo su contenido)
-- ============================================================
-- drop table if exists public.payouts;
-- drop table if exists public.agents;
