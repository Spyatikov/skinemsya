// Типы данных и расчёт долгов. Все внутренние расчёты ведутся в рублях:
// у каждой траты сохранён курс (сколько рублей в единице валюты) на день траты.

export type Profile = { id: number; first_name: string; last_name?: string | null; username?: string | null; photo_url?: string | null };
export type ReceiptItem = { name: string; price: number; who: number[] };
export type Split =
  | { type: "equal"; members: number[] }
  | { type: "weights"; weights: Record<string, number> }
  | { type: "items"; items: ReceiptItem[] };
export type Expense = {
  id: string; group_id: string; kind: "expense" | "transfer";
  title: string | null; category: string; amount: number; currency: string; rate: number;
  payer: number | null; split: Split | null;
  from_user: number | null; to_user: number | null; pending: boolean;
  source: "app" | "chat" | "scan"; spent_on: string; created_at: string;
};
export type Message = { id: number; group_id: string; user_id: number | null; text: string; open_feed: boolean; created_at: string };
export type Group = {
  id: string; name: string; emoji: string; photo: string | null;
  start_date: string | null; end_date: string | null; currency: string; invite_code: string; created_by: number;
  tg_chat_id?: number | null; tg_chat_title?: string | null;
  reminders?: boolean;
  mirror_to_chat?: boolean;
  members: Profile[]; expenses: Expense[]; messages: Message[];
};
export type Transfer = { from: number; to: number; rub: number };

/** Доли траты в её валюте: { userId: сумма } */
export function shares(e: Expense): Record<number, number> {
  const r: Record<number, number> = {};
  const s = e.split, amount = Number(e.amount);
  if (!s) return r;
  if (s.type === "equal") {
    if (!s.members.length) return r;
    s.members.forEach((m) => (r[m] = amount / s.members.length));
  } else if (s.type === "weights") {
    const total = Object.values(s.weights).reduce((a, b) => a + Number(b), 0);
    if (!total) return r;
    for (const k in s.weights) if (Number(s.weights[k])) r[Number(k)] = (amount * Number(s.weights[k])) / total;
  } else if (s.type === "items") {
    let sum = 0;
    for (const it of s.items) {
      if (!it.who.length) continue;
      sum += Number(it.price);
      it.who.forEach((m) => (r[m] = (r[m] || 0) + Number(it.price) / it.who.length));
    }
    // сервис, налог и чаевые делятся пропорционально заказанному
    if (sum) { const k = amount / sum; for (const m in r) r[m] *= k; }
  }
  return r;
}
export const rubOf = (e: Expense) => Number(e.amount) * Number(e.rate);

/** Чистый баланс каждого в рублях: плюс — ему должны, минус — должен он */
export function nets(g: Group): Record<number, number> {
  const n: Record<number, number> = {};
  g.members.forEach((m) => (n[m.id] = 0));
  for (const e of g.expenses) {
    if (e.kind === "transfer") {
      if (e.pending || e.from_user == null || e.to_user == null) continue;
      n[e.from_user] = (n[e.from_user] || 0) + rubOf(e);
      n[e.to_user] = (n[e.to_user] || 0) - rubOf(e);
      continue;
    }
    if (e.payer != null) n[e.payer] = (n[e.payer] || 0) + rubOf(e);
    const sh = shares(e);
    for (const m in sh) n[m] = (n[m] || 0) - sh[m] * Number(e.rate);
  }
  return n;
}

/** Сколько было бы переводов, если рассчитываться по каждой паре отдельно */
export function pairCount(g: Group): number {
  const p: Record<string, number> = {};
  const owe = (a: number, b: number, v: number) => {
    if (a === b) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    p[k] = (p[k] || 0) + (a < b ? v : -v);
  };
  for (const e of g.expenses) {
    if (e.kind === "transfer") { if (!e.pending && e.from_user != null && e.to_user != null) owe(e.from_user, e.to_user, -rubOf(e)); continue; }
    if (e.payer == null) continue;
    const sh = shares(e);
    for (const m in sh) owe(Number(m), e.payer, sh[m] * Number(e.rate));
  }
  return Object.values(p).filter((v) => Math.abs(v) > 1).length;
}

/** Жадный план расчёта: крупнейший должник платит крупнейшему кредитору */
export function plan(g: Group): Transfer[] {
  const n = nets(g);
  const cr: { id: number; v: number }[] = [], db: { id: number; v: number }[] = [];
  for (const id in n) {
    if (n[id] > 1) cr.push({ id: Number(id), v: n[id] });
    else if (n[id] < -1) db.push({ id: Number(id), v: -n[id] });
  }
  cr.sort((a, b) => b.v - a.v); db.sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const x = Math.min(db[i].v, cr[j].v);
    if (x >= 1) out.push({ from: db[i].id, to: cr[j].id, rub: Math.round(x) });
    db[i].v -= x; cr[j].v -= x;
    if (db[i].v < 1) i++;
    if (cr[j].v < 1) j++;
  }
  return out;
}

export function myStats(g: Group, me: number) {
  let spent = 0, share = 0;
  for (const e of g.expenses) {
    if (e.kind === "transfer") continue;
    spent += rubOf(e);
    const sh = shares(e);
    if (sh[me]) share += sh[me] * Number(e.rate);
  }
  return { spent, share, net: nets(g)[me] || 0 };
}

// ---------- форматирование ----------
export const nf = (v: number, d = 0) =>
  new Intl.NumberFormat("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export const plural = (n: number, a: string, b: string, c: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c;
};
const NUMW = ["", "одного", "двоих", "троих", "четверых", "пятерых", "шестерых", "семерых"];
export const onN = (n: number) => "на " + (NUMW[n] || n);

/** Разбор суммы: «1 200,50», «45.000» (тысячи), «12.5» */
export function parseAmount(raw: string): number {
  let s = String(raw).replace(/[\s ']/g, "");
  if (!s) return 0;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.replace(dec === "." ? /,/g : /\./g, "").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    // «45.000» или «1,200,000» — разделители тысяч
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== "0"))
      s = parts.join("");
    else s = parts.join(".");
  }
  const v = parseFloat(s);
  return isFinite(v) ? v : 0;
}
