// Обёртка над Telegram.WebApp. Скрипт telegram-web-app.js подключён в index.html.
type WebApp = {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; photo_url?: string }; start_param?: string };
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready(): void; expand(): void;
  setHeaderColor(c: string): void; setBackgroundColor(c: string): void; setBottomBarColor?(c: string): void;
  openTelegramLink(url: string): void; openLink(url: string): void;
  HapticFeedback?: { notificationOccurred(t: "success" | "error" | "warning"): void; impactOccurred(s: "light" | "medium"): void };
  disableVerticalSwipes?(): void;
};
declare global { interface Window { Telegram?: { WebApp: WebApp } } }

export const tg: WebApp | undefined = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;
export const inTelegram = Boolean(tg);

export function initTelegram() {
  if (!tg) return;
  tg.ready(); tg.expand();
  try { tg.disableVerticalSwipes?.() } catch { /* старый клиент */ }
  const r = document.documentElement.style, p = tg.themeParams || {};
  // берём цвета Telegram только в тёмной теме — остальная палитра приложения тёмная
  if (tg.colorScheme === "dark") {
    const map: Record<string, string[]> = {
      bg_color: ["--bg"], secondary_bg_color: ["--card", "--surface"], text_color: ["--ink"],
      hint_color: ["--muted"], link_color: ["--accent"], button_color: ["--accent-deep"], button_text_color: ["--accent-on"],
    };
    for (const k in map) if (p[k]) map[k].forEach((v) => r.setProperty(v, p[k]));
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); tg.setBottomBarColor?.(bg); } catch { /* старый клиент */ }
}

export const haptic = (t: "success" | "error" | "warning") => { try { tg?.HapticFeedback?.notificationOccurred(t) } catch { /* нет */ } };

export function shareLink(url: string, text: string) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg) tg.openTelegramLink(share); else window.open(share, "_blank");
}
