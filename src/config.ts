// Настройки, которые меняются под твой бот и проект Supabase.
// Эти значения публичные: секреты (токен бота, ключ service role) живут только на сервере.

/** Адрес серверной функции: https://<project-ref>.supabase.co/functions/v1/api */
export const API_URL = import.meta.env.VITE_API_URL || "";
/** Публичный (anon / publishable) ключ проекта Supabase — нужен шлюзу функций */
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
/** Username бота без @, например skinemsya_bot */
export const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || "";
/** Короткое имя мини-аппа из /newapp в BotFather, например app */
export const APP_SHORT_NAME = import.meta.env.VITE_APP_SHORT_NAME || "app";

/** ID мини-приложения ВКонтакте (публичный, виден в адресе vk.com/appID) */
export const VK_APP_ID = import.meta.env.VITE_VK_APP_ID || "";
/** ID сообщества ВК, от имени которого приходят напоминания и ответы поддержки (необязательно) */
export const VK_GROUP_ID = Number(import.meta.env.VITE_VK_GROUP_ID || 0);
