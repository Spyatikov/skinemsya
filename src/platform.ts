// Слой платформ: одно и то же приложение запускается в Telegram и во ВКонтакте.
// Здесь всё, что зависит от платформы: вход, имя пользователя, «поделиться», вибрация, ссылки-приглашения.
import bridge from "@vkontakte/vk-bridge";
import { APP_SHORT_NAME, BOT_USERNAME, MAX_BOT, VK_APP_ID, VK_GROUP_ID } from "./config";
import { initTelegram, tg } from "./telegram";

export type Platform = "telegram" | "vk" | "max" | "none";

const search = new URLSearchParams(location.search);
const isVK = search.has("vk_app_id") && search.has("sign");
// MAX передаёт данные запуска во фрагменте адреса: #WebAppData=…&WebAppPlatform=…
const maxHash = new URLSearchParams(location.hash.replace(/^#/, ""));
const maxInitData = maxHash.get("WebAppData") ?? "";
export const platform: Platform = tg ? "telegram" : isVK ? "vk" : maxInitData ? "max" : "none";
export const inApp = platform !== "none";
export const vkPlatform = search.get("vk_platform") ?? "";
const vkMobile = isVK && /mobile/.test(vkPlatform);

type VkUser = { first_name: string; last_name?: string; photo?: string };
let vkUser: VkUser | null = null;

// ---------- MAX ----------
type MaxWebApp = {
  initData?: string; platform?: string; version?: string;
  initDataUnsafe?: { user?: { id: number; first_name: string; last_name?: string }; start_param?: string };
  ready?(): void; expand?(): void;
  openLink?(url: string): void; openMaxLink?(url: string): void;
  shareMaxContent?(p: { text?: string; link?: string }): Promise<unknown> | void;
  shareContent?(p: { text?: string; link?: string }): Promise<unknown> | void;
  HapticFeedback?: { notificationOccurred?(t: string): void };
};
const maxApp = (): MaxWebApp | undefined => (window as unknown as { WebApp?: MaxWebApp }).WebApp;
/** данные запуска MAX, разобранные без подписи — только для подсказок интерфейсу, сервер проверяет сам */
const maxUnsafe = (() => {
  try { const q = new URLSearchParams(maxInitData); return { user: JSON.parse(q.get("user") ?? "null"), start: q.get("start_param") ?? undefined }; }
  catch { return { user: null, start: undefined }; }
})();
function loadMaxBridge() {
  return new Promise<void>((resolve) => {
    if (maxApp()) return resolve();
    const s = document.createElement("script");
    s.src = "https://st.max.ru/js/max-web-app.js";
    s.onload = () => resolve(); s.onerror = () => resolve();
    document.head.appendChild(s);
    setTimeout(resolve, 2500); // не держим запуск, если скрипт не загрузился
  });
}

/** Запуск: подготовить платформу и узнать, кто открыл приложение. Ждём до 2,5 с, дальше работаем без профиля. */
export async function initPlatform() {
  const root = document.documentElement;
  root.classList.add(`pf-${platform}`);
  if (platform === "telegram") { initTelegram(); return; }
  if (platform === "max") {
    await loadMaxBridge();
    try { maxApp()?.ready?.(); maxApp()?.expand?.(); } catch { /* старый клиент */ }
    return;
  }
  if (platform !== "vk") return;
  if (vkMobile) root.classList.add("pf-vk-mobile");
  // ВК на некоторых клиентах (мобильный браузер, старые версии) не отвечает на Init — не ждём дольше 1,5 с
  const soon = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  try { await soon(bridge.send("VKWebAppInit"), 1500); } catch { /* старый клиент или браузер */ }
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim() || "#17212b";
  bridge.send("VKWebAppSetViewSettings", { status_bar_style: "light", action_bar_color: bg, navigation_bar_color: bg }).catch(() => {});
  try {
    const u = await soon(bridge.send("VKWebAppGetUserInfo"), 2500);
    vkUser = { first_name: u.first_name, last_name: u.last_name, photo: u.photo_200 || u.photo_100 };
  } catch { /* профиль подтянется со следующего открытия */ }
}

/** Что отправляем серверу для проверки подлинности пользователя */
export function authPayload(): Record<string, unknown> {
  if (platform === "telegram") return { initData: tg?.initData ?? "" };
  if (platform === "vk") return { vk: location.search.slice(1), profile: vkUser };
  if (platform === "max") return { max: maxApp()?.initData || maxInitData };
  return {};
}

export const firstName = () =>
  platform === "telegram" ? tg?.initDataUnsafe.user?.first_name : platform === "vk" ? vkUser?.first_name
  : platform === "max" ? maxUnsafe.user?.first_name : undefined;

/** Код приглашения, с которым открыли приложение: ?join=… (веб), #код (ВК). В Telegram его передаёт сервер через start_param. */
export function startCode(): string | undefined {
  const fromQuery = search.get("join");
  if (fromQuery) return fromQuery;
  if (platform === "max") {
    const c = maxApp()?.initDataUnsafe?.start_param || maxUnsafe.start;
    if (c && /^[a-z0-9]{6,32}$/i.test(c)) return c;
  }
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
    else if (platform === "max") maxApp()?.HapticFeedback?.notificationOccurred?.(t);
  } catch { /* нет вибрации */ }
}

// ---------- ссылки-приглашения ----------
export type LinkKind = "telegram" | "vk" | "max";
export const tgInvite = (code: string) => (BOT_USERNAME ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}?startapp=${code}` : "");
export const vkInvite = (code: string) => (VK_APP_ID ? `https://vk.com/app${VK_APP_ID}#${code}` : "");
export const maxInvite = (code: string) => (MAX_BOT ? `https://max.ru/${MAX_BOT}?startapp=${code}` : "");
/** Какие ссылки можно предложить: сначала родная платформа, потом вторая */
export function inviteKinds(): LinkKind[] {
  const all: LinkKind[] = [];
  if (BOT_USERNAME) all.push("telegram");
  if (VK_APP_ID) all.push("vk");
  if (MAX_BOT) all.push("max");
  const own = platform === "telegram" || platform === "vk" || platform === "max" ? platform : null;
  return own ? [...all.filter((k) => k === own), ...all.filter((k) => k !== own)] : all;
}
export const inviteLink = (code: string, kind: LinkKind) => (kind === "vk" ? vkInvite(code) : kind === "max" ? maxInvite(code) : tgInvite(code)) || `${location.origin}${location.pathname}?join=${code}`;

/** «Поделиться»: в ВК — родное окно отправки, в Telegram — выбор чата */
export async function share(url: string, text: string) {
  if (platform === "vk") {
    try { await bridge.send("VKWebAppShare", { link: url }); return; } catch { /* ниже запасной путь */ }
  }
  if (platform === "max") {
    const m = maxApp();
    try { if (m?.shareMaxContent) { await m.shareMaxContent({ text, link: url }); return; } } catch { /* ниже */ }
    try { if (m?.shareContent) { await m.shareContent({ text, link: url }); return; } } catch { /* ниже */ }
  }
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (platform === "telegram" && url.startsWith("https://t.me/")) { tg!.openTelegramLink(tgShare); return; }
  if (platform === "telegram") { tg!.openTelegramLink(tgShare); return; }
  try { await navigator.clipboard.writeText(url); } catch { /* нет доступа к буферу */ }
}

export function openLink(url: string) {
  if (platform === "telegram") { url.startsWith("https://t.me/") ? tg!.openTelegramLink(url) : tg!.openLink(url); return; }
  if (platform === "max") {
    const m = maxApp();
    if (url.startsWith("https://max.ru/") && m?.openMaxLink) { m.openMaxLink(url); return; }
    if (m?.openLink) { m.openLink(url); return; }
  }
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
  platform === "telegram" ? `Telegram ${tg?.version ?? "?"} · ${tg?.platform ?? ""}` : platform === "vk" ? `VK · ${vkPlatform}`
  : platform === "max" ? `MAX ${maxApp()?.version ?? ""} · ${maxApp()?.platform ?? maxHash.get("WebAppPlatform") ?? ""}` : "web";
