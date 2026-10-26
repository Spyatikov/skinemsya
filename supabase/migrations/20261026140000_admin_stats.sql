-- Статистика для владельца: дата регистрации, журнал активности по дням и сводная функция.
alter table public.profiles add column if not exists created_at timestamptz;
update public.profiles p set created_at = coalesce(
  (select min(m.joined_at) from public.members m where m.user_id = p.id), p.updated_at, now())
where created_at is null;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column created_at set not null;

create table if not exists public.daily_activity (
  user_id bigint not null,
  day date not null,
  opens int not null default 1,
  primary key (user_id, day)
);
alter table public.daily_activity enable row level security;
-- прошлое приблизительно восстанавливаем по последнему заходу и тратам
insert into public.daily_activity (user_id, day)
select distinct id, (updated_at at time zone 'Europe/Moscow')::date from public.profiles
union select distinct created_by, (created_at at time zone 'Europe/Moscow')::date from public.expenses where created_by is not null
union select distinct user_id, (created_at at time zone 'Europe/Moscow')::date from public.messages where user_id is not null
on conflict do nothing;

create or replace function public.touch_activity(uid bigint) returns void language sql as $$
  insert into public.daily_activity (user_id, day) values (uid, (now() at time zone 'Europe/Moscow')::date)
  on conflict (user_id, day) do update set opens = daily_activity.opens + 1;
$$;

create or replace function public.admin_stats() returns jsonb language sql stable as $$
with d as (select (now() at time zone 'Europe/Moscow')::date as today),
days as (select generate_series((select today from d) - 29, (select today from d), '1 day')::date as day),
msk as (select *, (created_at at time zone 'Europe/Moscow')::date as day from public.expenses),
gm as (select group_id, count(*) n from public.members group by group_id)
select jsonb_build_object(
  'today', (select today from d),
  'users', jsonb_build_object(
    'total', (select count(*) from public.profiles),
    'new_today', (select count(*) from public.profiles where (created_at at time zone 'Europe/Moscow')::date = (select today from d)),
    'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'dau', (select count(*) from public.daily_activity where day = (select today from d)),
    'wau', (select count(distinct user_id) from public.daily_activity where day > (select today from d) - 7),
    'mau', (select count(distinct user_id) from public.daily_activity where day > (select today from d) - 30),
    'returning', (select count(*) from (select user_id from public.daily_activity group by user_id having count(*) >= 2) x)
  ),
  'groups', jsonb_build_object(
    'total', (select count(*) from public.groups),
    'new_7d', (select count(*) from public.groups where created_at > now() - interval '7 days'),
    'with_friends', (select count(*) from gm where n >= 2),
    'with_expenses', (select count(distinct group_id) from public.expenses where kind = 'expense'),
    'chat_linked', (select count(*) from public.groups where tg_chat_id is not null),
    'avg_size', (select round(avg(n), 1) from gm)
  ),
  'expenses', jsonb_build_object(
    'total', (select count(*) from public.expenses where kind = 'expense'),
    'new_7d', (select count(*) from public.expenses where kind = 'expense' and created_at > now() - interval '7 days'),
    'sum_rub', (select round(coalesce(sum(amount * rate), 0)) from public.expenses where kind = 'expense'),
    'by_source', (select coalesce(jsonb_object_agg(source, n), '{}') from (select source, count(*) n from public.expenses where kind = 'expense' group by source) x),
    'currencies', (select coalesce(jsonb_agg(jsonb_build_object('code', currency, 'n', n) order by n desc), '[]') from (select currency, count(*) n from public.expenses where kind = 'expense' group by currency order by n desc limit 6) x),
    'transfers_confirmed', (select count(*) from public.expenses where kind = 'transfer' and not pending),
    'transfers_pending', (select count(*) from public.expenses where kind = 'transfer' and pending)
  ),
  'features', jsonb_build_object(
    'ai_scans', (select coalesce(sum(count), 0) from public.ai_usage),
    'ai_scans_7d', (select coalesce(sum(count), 0) from public.ai_usage where day > (select today from d) - 7),
    'chat_messages', (select count(*) from public.messages where user_id is not null),
    'reminders_sent', (select count(*) from public.reminder_log),
    'feedback', (select count(*) from public.feedback)
  ),
  'funnel', jsonb_build_object(
    'opened', (select count(*) from public.profiles),
    'in_group', (select count(distinct user_id) from public.members),
    'with_friends', (select count(distinct m.user_id) from public.members m join gm on gm.group_id = m.group_id and gm.n >= 2),
    'added_expense', (select count(distinct created_by) from public.expenses where kind = 'expense'),
    'settled', (select count(distinct from_user) from public.expenses where kind = 'transfer' and not pending)
  ),
  'series', (select jsonb_agg(jsonb_build_object(
      'day', days.day,
      'active', (select count(*) from public.daily_activity a where a.day = days.day),
      'new_users', (select count(*) from public.profiles p where (p.created_at at time zone 'Europe/Moscow')::date = days.day),
      'expenses', (select count(*) from msk where msk.kind = 'expense' and msk.day = days.day),
      'groups', (select count(*) from public.groups g where (g.created_at at time zone 'Europe/Moscow')::date = days.day)
    ) order by days.day) from days),
  'top_groups', (select coalesce(jsonb_agg(x order by x.expenses desc), '[]') from (
      select g.name, g.emoji, coalesce(gm.n, 0) members, count(e.id) filter (where e.kind = 'expense') expenses,
             round(coalesce(sum(e.amount * e.rate) filter (where e.kind = 'expense'), 0)) sum_rub,
             max(e.created_at) last_at
      from public.groups g left join gm on gm.group_id = g.id left join public.expenses e on e.group_id = g.id
      group by g.id, g.name, g.emoji, gm.n order by count(e.id) desc limit 8) x),
  'feedback', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
      select f.text, f.created_at, p.first_name, p.username from public.feedback f left join public.profiles p on p.id = f.user_id
      order by f.created_at desc limit 10) x)
);
$$;

revoke all on function public.admin_stats() from public, anon, authenticated;
revoke all on function public.touch_activity(bigint) from public, anon, authenticated;
grant execute on function public.admin_stats() to service_role;
grant execute on function public.touch_activity(bigint) to service_role;
