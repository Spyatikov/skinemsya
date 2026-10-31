// Слой платформ: одно и то же приложение запускается в Telegram и во ВКонтакте.
// Здесь всё, что зависит от платформы: вход, имя пользователя, «поделиться», вибрация, ссылки-приглашения.
import bridge from "@vkontakte/vk-bridge";
import { APP_SHORT_NAME, BOT_USERNAME, VK_APP_ID, VK_GROUP_ID } from "./config";
import { initTelegram, tg } from "./telegram";

export type Platform = "telegram" | "vk" | "none";

const search = new URLSearchParams(location.search);
const isVK = search.has("vk_app_id") && search.has("sign");
export const platform: Platform = tg ? "telegram" : isVK ? "vk" : "none";
export const inApp = platform !== "none";
export const vkPlatform = search.get("vk_platform") ?? "";
const vkMobile = isVK && /mobile/.test(vkPlatform);

type VkUser = { first_name: string; last_name?: string; photo?: string };
let vkUser: VkUser | null = null;

/** Запуск: подготовить платформу и узнать, кто открыл приложение. Ждём до 2,5 с, дальше работаем без профиля. */
export async function initPlatform() {
  const root = document.documentElement;
  root.classList.add(`pf-${platform}`);
  if (platform === "telegram") { initTelegram(); return; }
  if (platform !== "vk") return;
  if (vkMobile) root.classList.add("pf-vk-mobile");
  try { await bridge.send("VKWebAppInit"); } catch { /* старый клиент */ }
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim() || "#17212b";
  bridge.send("VKWebAppSetViewSettings", { status_bar_style: "light", action_bar_color: bg, navigation_bar_color: bg }).catch(() => {});
  try {
    const u = await Promise.race([
      bridge.send("VKWebAppGetUserInfo"),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500)),
    ]);
    vkUser = { first_name: u.first_name, last_name: u.last_name, photo: u.photo_200 || u.photo_100 };
  } catch { /* профиль подтянется со следующего открытия */ }
}

/** Что отправляем серверу для проверки подлинности пользователя */
export function authPayload(): Record<string, unknown> {
  if (platform === "telegram") return { initData: tg?.initData ?? "" };
  if (platform === "vk") return { vk: location.search.slice(1), profile: vkUser };
  return {};
}

export const firstName = () =>
  platform === "telegram" ? tg?.initDataUnsafe.user?.first_name : platform === "vk" ? vkUser?.first_name : undefined;

/** Код приглашения, с которым открыли приложение: ?join=… (веб), #код (ВК). В Telegram его передаёт сервер через start_param. */
export function startCode(): string | undefined {
  const fromQuery = search.get("join");
  if (fromQuery) return fromQuery;
  if (platform === "vk") {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, "")).replace(/^join=/, "");
    if (/^[a-z0-9]{6,32}$/i.test(h)) return h;
  }
  return undefined;
}

export function haptic(t: "success" | "error" | "warning") {
  try {
    if (platform === "telegram") tg?.HapticFeedback?.notificationOccurred(t);
    else if (platform === "vk") bridge.send("VKWebAppTapticNotificationOccurred", { type: t }).catch(() => {});
  } catch { /* нет вибрации */ }
}

// ---------- ссылки-приглашения ----------
export type LinkKind = "telegram" | "vk";
export const tgInvite = (code: string) => (BOT_USERNAME ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}?startapp=${code}` : "");
export const vkInvite = (code: string) => (VK_APP_ID ? `https://vk.com/app${VK_APP_ID}#${code}` : "");
/** Какие ссылки можно предложить: сначала родная платформа, потом вторая */
export function inviteKinds(): LinkKind[] {
  const all: LinkKind[] = [];
  if (BOT_USERNAME) all.push("telegram");
  if (VK_APP_ID) all.push("vk");
  return platform === "vk" ? all.sort((a) => (a === "vk" ? -1 : 1)) : all;
}
export const inviteLink = (code: string, kind: LinkKind) => (kind === "vk" ? vkInvite(code) : tgInvite(code)) || `${location.origin}${location.pathname}?join=${code}`;

/** «Поделиться»: в ВК — родное окно отправки, в Telegram — выбор чата */
export async function share(url: string, text: string) {
  if (platform === "vk") {
    try { await bridge.send("VKWebAppShare", { link: url }); return; } catch { /* ниже запасной путь */ }
  }
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (platform === "telegram" && url.startsWith("https://t.me/")) { tg!.openTelegramLink(tgShare); return; }
  if (platform === "telegram") { tg!.openTelegramLink(tgShare); return; }
  try { await navigator.clipboard.writeText(url); } catch { /* нет доступа к буферу */ }
}

export function openLink(url: string) {
  if (platform === "telegram") { url.startsWith("https://t.me/") ? tg!.openTelegramLink(url) : tg!.openLink(url); return; }
  window.open(url, "_blank");
}

export async function copyText(text: string) {
  if (platform === "vk") { try { await bridge.send("VKWebAppCopyText", { text }); return true; } catch { /* ниже */ } }
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** ВК: разрешение сообществу писать пользователю (напоминания о долгах, ответы поддержки) */
export async function allowVkMessages(): Promise<boolean> {
  if (platform !== "vk" || !VK_GROUP_ID) return false;
  try { const r = await bridge.send("VKWebAppAllowMessagesFromGroup", { group_id: VK_GROUP_ID }); return Boolean(r.result); } catch { return false; }
}
export const vkMessagesAvailable = platform === "vk" && VK_GROUP_ID > 0;

export const platformInfo = () =>
  platform === "telegram" ? `Telegram ${tg?.version ?? "?"} · ${tg?.platform ?? ""}` : platform === "vk" ? `VK · ${vkPlatform}` : "web";
