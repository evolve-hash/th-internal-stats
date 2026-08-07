-- ============================================================
-- Team Howe — Commission Dashboard
-- Supabase schema.
--
-- HOW TO RUN
--   1. supabase.com → your project → SQL Editor → New query
--   2. Paste this whole file, press Run.
--   3. That's it. The dashboard fills the table itself on first load.
--
-- Takes about 20 seconds.
-- ============================================================

create table if not exists public.transactions (
  id          bigint generated always as identity primary key,

  -- Production year. Deliberately its own column, NOT derived from `date`:
  -- a handful of historical rows carry a mistyped closing date but belong to
  -- the year they were filed under in the original workbook.
  year        integer,

  date        date,
  client      text,
  side        text check (side in ('Buyer', 'Seller') or side is null),
  prop_type   text,
  address     text,
  city        text,
  sale_price  numeric,
  gross_comm  numeric,
  net_comm    numeric,
  source      text,
  referrer    text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists transactions_year_idx on public.transactions (year);
create index if not exists transactions_date_idx on public.transactions (date);

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch
  before update on public.transactions
  for each row execute function public.touch_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- READ THIS BEFORE YOU DEPLOY.
--
-- You asked for no password — anyone with the link can use the
-- dashboard. The policies below therefore allow the public
-- browser key to read and write this table.
--
-- ("Public browser key" = the publishable key, sb_publishable_...,
--  or the older anon key. Same privileges, same RLS behaviour.)
--
-- What that actually means:
--   • That key ships inside the page, so anyone who opens the
--     site (or reads the GitHub repo) can see it.
--   • With these policies, anyone holding that key can read
--     every row AND add, change, or delete rows.
--   • GitHub Pages on a free account only serves PUBLIC repos,
--     so the key is discoverable by anyone who finds the repo.
--
-- For a private commission ledger that is a real exposure, not a
-- theoretical one. Three ways to tighten it, cheapest first:
--
--   A. Keep writes open but make the repo hard to find, and
--      rename it to something non-obvious. Weakest option —
--      obscurity only.
--
--   B. Read-only public, writes from an authenticated user.
--      Swap the write policies below for the AUTHENTICATED
--      block at the bottom, then add yourself and Sherri as
--      Supabase users (Authentication → Users → Add user) and
--      add a small sign-in screen. Ask me and I'll wire it up.
--
--   C. Private repo + a host whose free tier serves private
--      repos (Netlify, Vercel, Cloudflare Pages). Combine with
--      B for a properly locked-down setup.
--
-- I'd recommend at least B before this holds live numbers.
-- ============================================================

alter table public.transactions enable row level security;

-- ---- OPEN policies (matches "no password, private link") ----
-- These apply to every role, so they work with publishable and legacy keys alike.
drop policy if exists "public can read"   on public.transactions;
drop policy if exists "public can insert" on public.transactions;
drop policy if exists "public can update" on public.transactions;
drop policy if exists "public can delete" on public.transactions;

create policy "public can read"   on public.transactions for select using (true);
create policy "public can insert" on public.transactions for insert with check (true);
create policy "public can update" on public.transactions for update using (true) with check (true);
create policy "public can delete" on public.transactions for delete using (true);


-- ============================================================
-- OPTION B — read-only for the public, writes for signed-in users.
-- To switch: delete the four policies above and run this block.
-- ============================================================
-- drop policy if exists "public can read"   on public.transactions;
-- drop policy if exists "public can insert" on public.transactions;
-- drop policy if exists "public can update" on public.transactions;
-- drop policy if exists "public can delete" on public.transactions;
--
-- create policy "everyone can read"      on public.transactions for select using (true);
-- create policy "signed-in can insert"   on public.transactions for insert to authenticated with check (true);
-- create policy "signed-in can update"   on public.transactions for update to authenticated using (true) with check (true);
-- create policy "signed-in can delete"   on public.transactions for delete to authenticated using (true);
