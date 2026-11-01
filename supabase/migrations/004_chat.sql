-- =============================================================================
-- 004_chat.sql
--
-- Persistent AI advisor conversations. A session is either general (no build)
-- or scoped to a build, so the advisor can be resumed later with context.
-- =============================================================================

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  build_id uuid references public.builds(id) on delete cascade,
  title text not null default 'New conversation',
  scope text not null default 'general' check (scope in ('general', 'build', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_user
  on public.chat_sessions(user_id, updated_at desc);
create index if not exists idx_chat_sessions_build
  on public.chat_sessions(build_id);

drop trigger if exists trg_chat_sessions_updated_at on public.chat_sessions;
create trigger trg_chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  -- Component IDs the assistant referenced (rendered as citation chips).
  citations jsonb not null default '[]'::jsonb,
  tool_trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_session
  on public.chat_messages(session_id, created_at);

-- Keep the session's updated_at fresh when a message lands, so the sidebar can
-- sort by recency without a join.
create or replace function public.touch_chat_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_sessions set updated_at = now() where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_messages_touch on public.chat_messages;
create trigger trg_chat_messages_touch
  after insert on public.chat_messages
  for each row execute function public.touch_chat_session();

-- -----------------------------------------------------------------------------
-- RLS: a user only ever sees their own conversations.
-- -----------------------------------------------------------------------------
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_sessions_owner_all" on public.chat_sessions;
create policy "chat_sessions_owner_all"
  on public.chat_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "chat_messages_owner_all" on public.chat_messages;
create policy "chat_messages_owner_all"
  on public.chat_messages for all
  using (
    exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
  );

grant select, insert, update, delete on public.chat_sessions, public.chat_messages to authenticated;
