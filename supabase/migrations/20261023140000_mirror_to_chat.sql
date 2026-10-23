-- Дублировать траты и сообщения из приложения в привязанный чат Telegram (настройка группы, по умолчанию выключено)
alter table public.groups add column if not exists mirror_to_chat boolean not null default false;
