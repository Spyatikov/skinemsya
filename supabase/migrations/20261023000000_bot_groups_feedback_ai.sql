-- Привязка чата Telegram к группе, обращения из «Помощи», лимит ИИ-сканов.
alter table public.groups add column if not exists tg_chat_id bigint unique;
alter table public.groups add column if not exists tg_chat_title text;

create table if not exists public.feedback (
  id           bigserial primary key,
  user_id      bigint references public.profiles(id) on delete set null,
  group_id     uuid references public.groups(id) on delete set null,
  text         text not null,
  context      jsonb,
  admin_msg_id bigint,              -- id сообщения у админа: ответ на него уходит автору
  created_at   timestamptz not null default now()
);
create index if not exists feedback_admin_msg_idx on public.feedback(admin_msg_id);

create table if not exists public.ai_usage (
  user_id bigint not null,
  day     date   not null,
  count   int    not null default 0,
  primary key (user_id, day)
);

alter table public.feedback enable row level security;
alter table public.ai_usage enable row level security;

create extension if not exists pg_net;
