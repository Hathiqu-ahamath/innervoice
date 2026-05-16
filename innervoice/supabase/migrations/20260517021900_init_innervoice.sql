create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  bio text default '',
  avatar_url text,
  theme_from_avatar boolean default false,
  avatar_theme jsonb,
  voice_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Conversation',
  voice_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  audio_url text,
  emotion text,
  ts bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_user_updated
  on public.conversations(user_id, updated_at desc);

create index if not exists idx_messages_conversation_created
  on public.messages(conversation_id, created_at asc);

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "conversations own rows" on public.conversations;
create policy "conversations own rows"
on public.conversations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "messages via own conversations" on public.messages;
create policy "messages via own conversations"
on public.messages
for all
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()
  )
);

