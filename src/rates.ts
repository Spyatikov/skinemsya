// Курсы валют: бесплатный открытый API (fawazahmed0/currency-api), обновляется раз в сутки.
// Храним как «сколько рублей в одной единице валюты».

export type Currency = { code: string; sym: string; name: string; dec: number };
export const CATALOG: Currency[] = [
  { code: "RUB", sym: "₽", name: "Российский рубль", dec: 0 },
  { code: "USD", sym: "$", name: "Доллар США", dec: 2 },
  { code: "EUR", sym: "€", name: "Евро", dec: 2 },
  { code: "INR", sym: "₹", name: "Индийская рупия", dec: 0 },
  { code: "THB", sym: "฿", name: "Тайский бат", dec: 0 },
  { code: "IDR", sym: "Rp", name: "Индонезийская рупия", dec: 0 },
  { code: "TRY", sym: "₺", name: "Турецкая лира", dec: 0 },
  { code: "GEL", sym: "₾", name: "Грузинский лари", dec: 2 },
  { code: "AMD", sym: "֏", name: "Армянский драм", dec: 0 },
  { code: "KZT", sym: "₸", name: "Казахстанский тенге", dec: 0 },
  { code: "AED", sym: "AED", name: "Дирхам ОАЭ", dec: 2 },
  { code: "VND", sym: "₫", name: "Вьетнамский донг", dec: 0 },
  { code: "CNY", sym: "¥", name: "Китайский юань", dec: 2 },
  { code: "GBP", sym: "£", name: "Фунт стерлингов", dec: 2 },
  { code: "LKR", sym: "Rs", name: "Шри-ланкийская рупия", dec: 0 },
  { code: "EGP", sym: "E£", name: "Египетский фунт", dec: 0 },
  { code: "RSD", sym: "дин", name: "Сербский динар", dec: 0 },
  { code: "UZS", sym: "сўм", name: "Узбекский сум", dec: 0 },
  { code: "KGS", sym: "сом", name: "Киргизский сом", dec: 0 },
  { code: "BYN", sym: "Br", name: "Белорусский рубль", dec: 2 },
  { code: "MYR", sym: "RM", name: "Малайзийский ринггит", dec: 2 },
  { code: "JPY", sym: "¥", name: "Японская иена", dec: 0 },
  { code: "KRW", sym: "₩", name: "Южнокорейская вона", dec: 0 },
  { code: "MXN", sym: "MX$", name: "Мексиканское песо", dec: 0 },
];
export const CUR: Record<string, Currency> = Object.fromEntries(CATALOG.map((c) => [c.code, c]));
export const DEFAULT_CURS = ["RUB", "USD", "EUR", "INR"];

// запасные курсы на случай, если сеть недоступна при первом запуске
const FALLBACK: Record<string, number> = {
  RUB: 1, USD: 82, EUR: 95, INR: 0.98, THB: 2.45, IDR: 0.0052, TRY: 2.4, GEL: 30, AMD: 0.21, KZT: 0.16,
  AED: 22.3, VND: 0.0032, CNY: 11.4, GBP: 109, LKR: 0.27, EGP: 1.7, RSD: 0.81, UZS: 0.0064, KGS: 0.94,
  BYN: 25, MYR: 18.5, JPY: 0.55, KRW: 0.059, MXN: 4.3,
};

let live: Record<string, number> | null = null;
let liveDate: string | null = null;
const KEY = "skinemsya-rates";
try {
  const c = JSON.parse(localStorage.getItem(KEY) || "null");
  if (c?.rates) { live = c.rates; liveDate = c.date; }
} catch { /* нет хранилища */ }

const SOURCES = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/rub.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/rub.min.json",
];

/** Загружает свежие курсы. Возвращает true, если удалось. */
export async function loadRates(): Promise<boolean> {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) continue;
      const j = await r.json();
      const perRub: Record<string, number> = j.rub; // сколько единиц валюты за 1 рубль
      const rates: Record<string, number> = { RUB: 1 };
      for (const c of CATALOG) { const v = perRub[c.code.toLowerCase()]; if (v) rates[c.code] = 1 / v; }
      live = rates; liveDate = j.date;
      try { localStorage.setItem(KEY, JSON.stringify({ rates, date: j.date })); } catch { /* ок */ }
      return true;
    } catch { /* пробуем следующий источник */ }
  }
  return false;
}

export const rateOf = (code: string) => (code === "RUB" ? 1 : live?.[code] ?? FALLBACK[code] ?? 1);
export const ratesDate = () => liveDate;
export const ratesAreLive = () => Boolean(live);

export const sym = (code: string) => CUR[code]?.sym ?? code;
export function money(v: number, code: string) {
  const dec = CUR[code]?.dec ?? 2;
  const d = dec && Math.round(v) !== v ? dec : 0;
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) + " " + sym(code);
}
/** Рубли → строка в выбранной валюте итогов */
export function inBase(rub: number, base: string) {
  const v = rub / rateOf(base);
  return money(base === "RUB" ? Math.round(v) : Math.round(v * 100) / 100, base);
}
export function rateLabel(code: string, rate: number, base: string) {
  const v = rate / rateOf(base);
  return `1 ${code} = ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: v < 1 ? 4 : 2 }).format(v)} ${sym(base)}`;
}
