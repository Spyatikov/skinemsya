-- Приватность: согласие с политикой, удаление своих данных, статистика без чужих трат.
alter table public.profiles add column if not exists consent_at timestamptz;
alter table public.profiles add column if not exists deleted_at timestamptz;

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
    'returning', (select count(*) from (select user_id from public.daily_activity group by user_id having count(*) >= 2) x),
    'platforms', (select coalesce(jsonb_object_agg(platform, n), '{}') from (select platform, count(*) n from public.profiles group by platform) x),
    'new_7d_vk', (select count(*) from public.profiles where platform = 'vk' and created_at > now() - interval '7 days'),
    'consented', (select count(*) from public.profiles where consent_at is not null),
    'deleted', (select count(*) from public.profiles where deleted_at is not null)
  ),
  'groups', jsonb_build_object(
    'total', (select count(*) from public.groups),
    'new_7d', (select count(*) from public.groups where created_at > now() - interval '7 days'),
    'with_friends', (select count(*) from gm where n >= 2),
    'with_expenses', (select count(distinct group_id) from public.expenses where kind = 'expense'),
    'chat_linked', (select count(*) from public.groups where tg_chat_id is not null),
    'chat_linked_vk', (select count(*) from public.groups where vk_peer_id is not null),
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
  -- только обезличенные распределения: без названий групп, имён и сумм отдельных групп
  'group_sizes', (select coalesce(jsonb_object_agg(b, n), '{}') from (
      select case when n = 1 then '1' when n = 2 then '2' when n <= 4 then '3–4' when n <= 7 then '5–7' else '8+' end b, count(*) n
      from gm group by 1) x),
  'group_activity', (select coalesce(jsonb_object_agg(b, n), '{}') from (
      select case when c = 0 then '0' when c <= 5 then '1–5' when c <= 20 then '6–20' else '21+' end b, count(*) n
      from (select g.id, count(e.id) filter (where e.kind = 'expense') c from public.groups g left join public.expenses e on e.group_id = g.id group by g.id) t
      group by 1) x),
  'feedback', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
      select f.text, f.created_at, p.first_name, p.username from public.feedback f left join public.profiles p on p.id = f.user_id
      order by f.created_at desc limit 10) x)
);
$$;

revoke all on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to service_role;

-- «Удалить мои данные»: профиль обезличивается, личные записи стираются.
-- Группы, где человек был один, удаляются целиком. В общих группах его траты остаются
-- под именем «Удалённый участник» — иначе у остальных сломается расчёт.
create or replace function public.forget_user(uid bigint) returns jsonb language plpgsql as $$
declare solo int; msgs int;
begin
  with g as (
    select m.group_id from public.members m
    where m.user_id = uid and not exists (select 1 from public.members o where o.group_id = m.group_id and o.user_id <> uid)
  ), d as (delete from public.groups where id in (select group_id from g) returning 1)
  select count(*) into solo from d;
  with d as (delete from public.messages where user_id = uid returning 1) select count(*) into msgs from d;
  delete from public.feedback where user_id = uid;
  delete from public.daily_activity where user_id = uid;
  delete from public.ai_usage where user_id = uid;
  delete from public.reminder_log where user_id = uid;
  update public.profiles set first_name = 'Удалённый участник', last_name = null, username = null, photo_url = null,
    consent_at = null, deleted_at = now(), updated_at = now() where id = uid;
  return jsonb_build_object('groups_deleted', solo, 'messages_deleted', msgs);
end $$;
revoke all on function public.forget_user(bigint) from public, anon, authenticated;
grant execute on function public.forget_user(bigint) to service_role;
