// Общее для API и бота: база, валюты, курсы, разбор «+сумма», расчёт долгов, отправка в Telegram.
import { createClient } from "jsr:@supabase/supabase-js@2";

export const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
export const BOT_USERNAME = Deno.env.get("BOT_USERNAME") ?? "skinemsya_app_bot";
export const APP_URL = Deno.env.get("APP_URL") ?? "https://spyatikov.github.io/skinemsya/";
export const APP_LINK = `https://t.me/${BOT_USERNAME}/app`;
export const ADMIN_ID = Number(Deno.env.get("ADMIN_TG_ID") ?? "233119782"); // кому приходят обращения из «Помощи»

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export const fail = (status: number, msg: string): never => { throw new HttpError(status, msg); };

// ---------- Telegram Bot API ----------
export async function tgApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  if (!BOT_TOKEN) return { ok: false, description: "no token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) { return { ok: false, description: String(e) }; }
}
export const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
/** **жирный** из сообщений приложения → HTML для Telegram */
export const mdToHtml = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
export const groupLink = (code: string) => `${APP_LINK}?startapp=${code}`;

// ---------- валюты и курсы ----------
export const SYM: Record<string, string> = {
  RUB: "₽", USD: "$", EUR: "€", INR: "₹", THB: "฿", IDR: "Rp", TRY: "₺", GEL: "₾", AMD: "֏", KZT: "₸", AED: "AED", VND: "₫",
  CNY: "¥", GBP: "£", LKR: "Rs", EGP: "E£", RSD: "дин", UZS: "сўм", KGS: "сом", BYN: "Br", MYR: "RM", JPY: "¥", KRW: "₩", MXN: "MX$",
};
const DEC2 = new Set(["USD", "EUR", "GEL", "AED", "CNY", "GBP", "BYN", "MYR"]);
export const ALIAS: Record<string, string> = {
  руб: "RUB", р: "RUB", "₽": "RUB", рублей: "RUB", рубля: "RUB", $: "USD", долл: "USD", долларов: "USD", баксов: "USD", "€": "EUR", евро: "EUR",
  рупий: "INR", рупии: "INR", "₹": "INR", rp: "IDR", бат: "THB", батов: "THB", "฿": "THB", лир: "TRY", лиры: "TRY", лари: "GEL", драм: "AMD",
  тенге: "KZT", тг: "KZT", "₸": "KZT", сум: "UZS", сом: "KGS", дирхам: "AED", юаней: "CNY", донг: "VND",
};
for (const c of Object.keys(SYM)) ALIAS[c.toLowerCase()] = c;

export function money(v: number, code: string) {
  const d = DEC2.has(code) && Math.round(v) !== v ? 2 : 0;
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) + " " + (SYM[code] ?? code);
}
export const rub = (v: number) => money(Math.round(v), "RUB");

let rates: Record<string, number> | null = null, ratesAt = 0;
/** сколько рублей в единице валюты */
export async function rateOf(code: string): Promise<number> {
  if (code === "RUB") return 1;
  if (!rates || Date.now() - ratesAt > 6 * 3600e3) {
    for (const url of [
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/rub.min.json",
      "https://latest.currency-api.pages.dev/v1/currencies/rub.min.json",
    ]) {
      try {
        const j = await (await fetch(url)).json();
        const next: Record<string, number> = { RUB: 1 };
        for (const c of Object.keys(SYM)) { const v = j.rub?.[c.toLowerCase()]; if (v) next[c] = 1 / v; }
        rates = next; ratesAt = Date.now(); break;
      } catch { /* следующий источник */ }
    }
  }
  const r = rates?.[code];
  if (!r) fail(400, `Не знаю курс для ${code}`);
  return r!;
}

/** «1 200,50», «45.000», «12.5» → число */
export function parseAmount(raw: string): number {
  let s = String(raw).replace(/[\s ']/g, "");
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.replace(dec === "." ? /,/g : /\./g, "").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const parts = s.split(lastDot >= 0 ? "." : ",");
    s = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== "0") ? parts.join("") : parts.join(".");
  }
  const v = parseFloat(s);
  return isFinite(v) ? v : 0;
}

export const guessCat = (t: string) => {
  t = t.toLowerCase();
  if (/такси|байк|бензин|grab|uber|трансфер|автобус|паром|самол|поезд|метро|машин/.test(t)) return "ride";
  if (/ужин|обед|завтрак|кофе|еда|бар|пиво|ресторан|продукт|кафе|перекус/.test(t)) return "food";
  if (/отель|вилл|жиль|хостел|airbnb|квартир|апарт|номер/.test(t)) return "home";
  if (/храм|экскурс|дайв|серф|музей|массаж|вход|билет|кино|концерт|парк/.test(t)) return "fun";
  return "other";
};

export type Parsed = { amount: number; currency: string | null; title: string; mentions: string[] };
/** «+1200 thb такси @Катя» или «1200 такси» (после /add) */
export function parseExpense(text: string): Parsed | null {
  const m = text.trim().match(/^\+?\s*(\d[\d\s.,']*)\s*(.*)$/s);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  if (!amount || amount <= 0) return null;
  let words = m[2].split(/\s+/).filter(Boolean);
  let currency: string | null = null;
  if (words.length && ALIAS[words[0].toLowerCase()]) currency = ALIAS[words.shift()!.toLowerCase()];
  const mentions = words.filter((w) => w.startsWith("@")).map((w) => w.slice(1).toLowerCase());
  words = words.filter((w) => !w.startsWith("@"));
  const t = words.join(" ").trim() || "Без названия";
  return { amount, currency, title: (t[0].toUpperCase() + t.slice(1)).slice(0, 80), mentions };
}

const NUMW = ["", "одного", "двоих", "троих", "четверых", "пятерых", "шестерых", "семерых"];
export const onN = (n: number) => "на " + (NUMW[n] || n);
export const plural = (n: number, a: string, b: string, c: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c;
};

// ---------- расчёт долгов (как в приложении) ----------
type Row = { kind: string; amount: number; rate: number; payer: number | null; split: any; from_user: number | null; to_user: number | null; pending: boolean };
function shares(e: Row): Record<number, number> {
  const r: Record<number, number> = {}, s = e.split, a = Number(e.amount);
  if (!s) return r;
  if (s.type === "equal") s.members.forEach((m: number) => (r[m] = a / s.members.length));
  else if (s.type === "weights") {
    const t = Object.values(s.weights as Record<string, number>).reduce((x, y) => x + Number(y), 0);
    if (t) for (const k in s.weights) if (Number(s.weights[k])) r[Number(k)] = (a * Number(s.weights[k])) / t;
  } else if (s.type === "items") {
    let sum = 0;
    for (const it of s.items) { if (!it.who?.length) continue; sum += Number(it.price); it.who.forEach((m: number) => (r[m] = (r[m] || 0) + Number(it.price) / it.who.length)); }
    if (sum) for (const m in r) r[m] *= a / sum;
  }
  return r;
}
export async function groupPlan(groupId: string) {
  const [{ data: mem }, { data: ex }] = await Promise.all([
    db.from("members").select("user_id,profiles(first_name)").eq("group_id", groupId),
    db.from("expenses").select("kind,amount,rate,payer,split,from_user,to_user,pending").eq("group_id", groupId),
  ]);
  const names: Record<number, string> = {}, n: Record<number, number> = {};
  for (const m of mem ?? []) { names[m.user_id] = (m as any).profiles?.first_name ?? "?"; n[m.user_id] = 0; }
  for (const e of (ex ?? []) as Row[]) {
    const v = Number(e.amount) * Number(e.rate);
    if (e.kind === "transfer") { if (!e.pending && e.from_user && e.to_user) { n[e.from_user] = (n[e.from_user] || 0) + v; n[e.to_user] = (n[e.to_user] || 0) - v; } continue; }
    if (e.payer) n[e.payer] = (n[e.payer] || 0) + v;
    const sh = shares(e);
    for (const m in sh) n[m] = (n[m] || 0) - sh[m] * Number(e.rate);
  }
  const cr: { id: number; v: number }[] = [], dbt: { id: number; v: number }[] = [];
  for (const id in n) { if (n[id] > 1) cr.push({ id: +id, v: n[id] }); else if (n[id] < -1) dbt.push({ id: +id, v: -n[id] }); }
  cr.sort((a, b) => b.v - a.v); dbt.sort((a, b) => b.v - a.v);
  const out: { from: number; to: number; rub: number }[] = [];
  let i = 0, j = 0;
  while (i < dbt.length && j < cr.length) {
    const x = Math.min(dbt[i].v, cr[j].v);
    if (x >= 1) out.push({ from: dbt[i].id, to: cr[j].id, rub: Math.round(x) });
    dbt[i].v -= x; cr[j].v -= x;
    if (dbt[i].v < 1) i++; if (cr[j].v < 1) j++;
  }
  return { plan: out, names, total: (ex ?? []).filter((e) => e.kind === "expense").reduce((s, e) => s + Number(e.amount) * Number(e.rate), 0) };
}
export async function planText(groupId: string) {
  const { plan, names, total } = await groupPlan(groupId);
  if (!plan.length) return `Все в расчёте 🎉\nВсего потрачено ${rub(total)}.`;
  return "**Как рассчитаться**\n" + plan.map((t) => `${names[t.from]} → ${names[t.to]}: ${rub(t.rub)}`).join("\n") +
    `\n\nВсего потрачено ${rub(total)}.`;
}

/** Сообщение в привязанный чат Telegram, если он есть */
export async function postToLinkedChat(groupId: string, html: string, code?: string) {
  const { data: g } = await db.from("groups").select("tg_chat_id,invite_code").eq("id", groupId).maybeSingle();
  if (!g?.tg_chat_id) return;
  await tgApi("sendMessage", {
    chat_id: g.tg_chat_id, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "Открыть Скинемся", url: groupLink(code ?? g.invite_code) }]] },
  });
}
