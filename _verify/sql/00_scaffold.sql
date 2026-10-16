-- Enough of the live schema for migration 005 to apply and be exercised.
-- Column types and defaults copied from the live database on 16 Oct.
-- Idempotent: the cluster is reused between runs, so the scaffold has to be
-- able to replace itself rather than colliding with the last one.
drop schema if exists auth cascade;
drop schema if exists public cascade;
create schema public;
create schema auth;
create table auth.state (uid uuid);
insert into auth.state values (null);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from auth.state $$;
create or replace function auth.role() returns text language sql stable as
  $$ select case when (select uid from auth.state) is null then 'anon' else 'authenticated' end $$;

-- The columns 004's coach_card selects, plus the ones the app reads.
create table public.profiles (
  id uuid primary key, name text, coach_id uuid, role text,
  avatar text, photo_url text, intake jsonb not null default '{}'::jsonb,
  business_name text, brand_color text, logo_path text,
  invite_code text
);
alter table public.profiles enable row level security;
-- The policy 004 replaces, exactly as it reads on the live database. The
-- migration drops it by name, so it has to be here for the drop to mean
-- anything.
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select using (auth.role() = 'authenticated');
create table public.session_types (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null, name text not null,
  capacity integer not null default 1, duration_min integer not null default 60,
  delivery text not null default 'in_person', price_cents integer, location text,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null, session_type_id uuid not null,
  starts_at timestamptz not null, capacity_override integer,
  cancelled_at timestamptz, note text,
  created_at timestamptz not null default now(), recurrence_id uuid
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null, athlete_id uuid not null, coach_id uuid not null,
  status text not null default 'booked'
    check (status in ('booked','cancelled','late_cancelled','attended','no_show')),
  uses_credit boolean not null default true,
  created_at timestamptz not null default now(), cancelled_at timestamptz
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, actor_id uuid, kind text not null
    check (kind in ('session_completed','session_due','coach_message','program_changed','session_confirmed')),
  title text not null, body text, data jsonb not null default '{}'::jsonb,
  read_at timestamptz, created_at timestamptz not null default now()
);

-- A role that is NOT a superuser.
--
-- Postgres lets a superuser straight through row level security, FORCE or
-- not. Running the policy checks as the owner would have passed every one
-- of them without a single policy being consulted - which is exactly the
-- result that looks like success and means nothing.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='rls_tester') then create role rls_tester; end if;
end $$;
grant usage on schema public, auth to rls_tester, anon, authenticated;
grant select on public.profiles to rls_tester;
grant select, update on auth.state to rls_tester;
grant execute on function auth.uid(), auth.role() to rls_tester;
