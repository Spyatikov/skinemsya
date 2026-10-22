-- Скинемся: схема данных.
-- Все обращения идут через Edge Function `api` с service role,
-- поэтому RLS включён и политик нет: напрямую из браузера таблицы недоступны.

create table if not exists public.profiles (
  id          bigint primary key,            -- Telegram user id
  first_name  text not null,
  last_name   text,
  username    text,
  photo_url   text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  emoji       text not null default '🌴',
  photo       text,                          -- data:image/jpeg;base64,... 256×256
  start_date  date,
  end_date    date,
  currency    text not null default 'RUB',
  invite_code text not null unique,
  created_by  bigint references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  group_id  uuid   not null references public.groups(id) on delete cascade,
  user_id   bigint not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists members_user_idx on public.members(user_id);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  kind        text not null default 'expense' check (kind in ('expense','transfer')),
  title       text,
  category    text not null default 'other',
  amount      numeric not null check (amount > 0),
  currency    text not null,
  rate        numeric not null check (rate > 0),   -- сколько рублей в 1 единице валюты на день траты
  payer       bigint references public.profiles(id),
  split       jsonb,                                -- {type:'equal',members:[...]} | {type:'weights',weights:{}} | {type:'items',items:[...]}
  from_user   bigint references public.profiles(id),
  to_user     bigint references public.profiles(id),
  pending     boolean not null default false,       -- перевод ждёт подтверждения получателя
  source      text not null default 'app',          -- app | chat | scan
  spent_on    date not null default current_date,
  created_by  bigint references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists expenses_group_idx on public.expenses(group_id, spent_on desc);

create table if not exists public.messages (
  id         bigserial primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    bigint references public.profiles(id),   -- null = сообщение бота
  text       text not null check (char_length(text) <= 2000),
  open_feed  boolean not null default false,          -- показать кнопку «Открыть расходы»
  created_at timestamptz not null default now()
);
create index if not exists messages_group_idx on public.messages(group_id, created_at);

alter table public.profiles enable row level security;
alter table public.groups   enable row level security;
alter table public.members  enable row level security;
alter table public.expenses enable row level security;
alter table public.messages enable row level security;
