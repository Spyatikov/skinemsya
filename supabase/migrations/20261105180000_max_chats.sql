-- MAX: группа может быть привязана к групповому чату MAX, куда добавлен бот «Скинемся».
-- Пользователи MAX хранятся с id = 4·10^15 + id в MAX, чтобы не пересекаться с Telegram (положительные) и ВК (отрицательные).
alter table public.groups add column if not exists max_chat_id bigint;
alter table public.groups add column if not exists max_chat_title text;
create unique index if not exists groups_max_chat_id_key on public.groups (max_chat_id) where max_chat_id is not null;
