-- Беседы ВКонтакте: группа может быть привязана к беседе, куда добавлено сообщество «Скинемся».
-- peer_id беседы = 2000000000 + id чата. Одна беседа — одна группа.
alter table public.groups add column if not exists vk_peer_id bigint;
alter table public.groups add column if not exists vk_chat_title text;
create unique index if not exists groups_vk_peer_id_key on public.groups (vk_peer_id) where vk_peer_id is not null;
