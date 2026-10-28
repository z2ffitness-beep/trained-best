-- 011: Adjust with AI.
--
-- Two additions, nothing existing changes:
--
-- 1. programs.phases: the phases a coach names ("Foundation, weeks 1 to 6").
--    Until now phases were only ever inferred from where movements change,
--    so they could not be named or moved. New nullable column; every
--    existing program reads null and behaves exactly as it does today.
--
-- 2. program_ai_messages: the Adjust with AI chat, kept per program and per
--    person, so a coach comes back to the same conversation. Each reply that
--    changed the program carries its change card, including the program as it
--    was before, which is what Undo restores.
--
-- Row level security: a person sees and writes only their own messages, and
-- only on a program they can already see (they are its athlete or its coach,
-- the same test the programs table uses).

alter table public.programs add column if not exists phases jsonb;

create table if not exists public.program_ai_messages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  changes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists program_ai_messages_program_idx
  on public.program_ai_messages (program_id, created_at);

alter table public.program_ai_messages enable row level security;

create policy "Own messages on own programs: read"
  on public.program_ai_messages for select
  using (
    author_id = auth.uid()
    and exists (select 1 from public.programs p
                where p.id = program_id and (p.athlete_id = auth.uid() or p.coach_id = auth.uid()))
  );

create policy "Own messages on own programs: write"
  on public.program_ai_messages for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.programs p
                where p.id = program_id and (p.athlete_id = auth.uid() or p.coach_id = auth.uid()))
  );

-- Only to mark a change card as undone.
create policy "Own messages on own programs: update"
  on public.program_ai_messages for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
