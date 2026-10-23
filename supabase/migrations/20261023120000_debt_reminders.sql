-- Напоминания о долгах после поездки: настройка в группе, журнал отправок, ежедневный запуск.
alter table public.groups add column if not exists reminders boolean not null default true;

create table if not exists public.reminder_log (
  id       bigserial primary key,
  group_id uuid   not null references public.groups(id) on delete cascade,
  user_id  bigint not null,
  sent_at  timestamptz not null default now()
);
create index if not exists reminder_log_idx on public.reminder_log(group_id, user_id, sent_at desc);

-- ключ, которым расписание подтверждает запуск функции
create table if not exists public.app_config (key text primary key, value text not null);
insert into public.app_config(key, value) values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

alter table public.reminder_log enable row level security;
alter table public.app_config  enable row level security;

create extension if not exists pg_cron;
-- каждый день в 12:00 по Москве (09:00 UTC)
select cron.schedule('skinemsya-debt-reminders', '0 9 * * *', $job$
  select net.http_post(
    url := 'https://ubpfdbojasicjhcciqjr.supabase.co/functions/v1/api?cron=reminders&key=' || (select value from public.app_config where key = 'cron_key'),
    body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 60000);
$job$);
