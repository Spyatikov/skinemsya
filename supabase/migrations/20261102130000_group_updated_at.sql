-- Экономия трафика: у группы есть метка последнего изменения.
-- Приложение при опросе спрашивает «что изменилось с …» и получает только изменённые группы (или ничего).
alter table public.groups add column if not exists updated_at timestamptz not null default now();
update public.groups g set updated_at = greatest(
  g.created_at,
  coalesce((select max(created_at) from public.expenses e where e.group_id = g.id), g.created_at),
  coalesce((select max(created_at) from public.messages m where m.group_id = g.id), g.created_at),
  coalesce((select max(joined_at) from public.members x where x.group_id = g.id), g.created_at)
);

-- любая правка самой группы двигает метку
create or replace function public.groups_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists groups_updated_at on public.groups;
create trigger groups_updated_at before update on public.groups for each row execute function public.groups_set_updated_at();

-- изменения трат, сообщений и состава двигают метку группы
create or replace function public.touch_group() returns trigger language plpgsql as $$
begin
  update public.groups set updated_at = clock_timestamp()
  where id = case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    update public.groups set updated_at = clock_timestamp() where id = old.group_id;
  end if;
  return null;
end $$;
drop trigger if exists expenses_touch_group on public.expenses;
create trigger expenses_touch_group after insert or update or delete on public.expenses for each row execute function public.touch_group();
drop trigger if exists messages_touch_group on public.messages;
create trigger messages_touch_group after insert or update or delete on public.messages for each row execute function public.touch_group();
drop trigger if exists members_touch_group on public.members;
create trigger members_touch_group after insert or update or delete on public.members for each row execute function public.touch_group();

-- смена имени или фото участника тоже должна дойти до друзей
create or replace function public.touch_groups_of_profile() returns trigger language plpgsql as $$
begin
  if new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.photo_url is distinct from old.photo_url then
    update public.groups set updated_at = clock_timestamp() where id in (select group_id from public.members where user_id = new.id);
  end if;
  return null;
end $$;
drop trigger if exists profiles_touch_groups on public.profiles;
create trigger profiles_touch_groups after update on public.profiles for each row execute function public.touch_groups_of_profile();
