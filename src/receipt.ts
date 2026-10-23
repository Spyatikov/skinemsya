// Распознавание чека в браузере (Tesseract.js, языки rus+eng) и разбор строк в позиции.
import { call } from "./api";
import { parseAmount, type ReceiptItem } from "./money";

declare global {
  interface Window {
    Tesseract?: {
      recognize: (img: Blob | string, langs: string, opts?: { logger?: (m: { status: string; progress: number }) => void }) =>
        Promise<{ data: { text: string } }>;
    };
  }
}

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let loading: Promise<void> | null = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TESSERACT_URL; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Не удалось загрузить распознавание. Проверь интернет и попробуй ещё раз.")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Уменьшает фото до разумного размера и переводит в оттенки серого — так OCR работает быстрее и точнее */
async function prepare(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext("2d")!;
    ctx.filter = "grayscale(1) contrast(1.35)";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.92));
  } catch { return file; }
  finally { URL.revokeObjectURL(url); }
}

export async function recognize(file: Blob, onProgress: (p: number, stage: string) => void): Promise<string> {
  onProgress(0.02, "Загружаю распознавание");
  await loadTesseract();
  const img = await prepare(file);
  const { data } = await window.Tesseract!.recognize(img, "rus+eng", {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(0.3 + m.progress * 0.7, "Читаю чек");
      else if (/load|initiali/.test(m.status)) onProgress(0.05 + m.progress * 0.25, "Готовлю языки");
    },
  });
  return data.text;
}

const SKIP = /(итог|всего|сумма|total|subtotal|sub total|наличн|сдача|change|cash|карт|card|visa|master|мир\b|ндс|vat|налог|tax|скидк|discount|кассир|cashier|чек\b|receipt|инн|кпп|смена|телефон|tel\b|www|http|дата|date|время|time|оплат|paid|payment|баланс|бонус|баллы|terminal|терминал|спасибо|thank)/i;
const TOTAL = /(итог|итого|всего к оплате|к оплате|grand total|total|amount due|jumlah|tổng|toplam)/i;
const SERVICE = /(service|сервис|обслуж|чаев|tip|gratuity|pb1|ppn|tax|налог|vat)/i;

export type ParsedReceipt = { place: string; items: ReceiptItem[]; total: number | null; service: number };

const NUM = /(?:\d{1,3}(?:[ .,\u00a0']\d{3})+(?!\d)|\d+)(?:[.,]\d{1,2})?/g;

/** Разбирает строку чека: название — текст до первого числа, цена — последнее «денежное» число.
 *  «Onion Flower 320.00 5» → Onion Flower, 320; «Капучино 2 x 290.00 =580.00» → Капучино, 580 */
function splitLine(line: string): { name: string; price: number } | null {
  const nums = [...line.matchAll(NUM)].map((m) => ({ raw: m[0], at: m.index ?? 0, v: parseAmount(m[0]) }));
  if (!nums.length) return null;
  // «денежные» числа: с копейками или от 10 и больше; мелкие целые в конце строки обычно количество
  const money = nums.filter((n) => /[.,]\d{2}$/.test(n.raw) || n.v >= 10);
  if (!money.length) return null; // только мелкие целые: номер стола, количество гостей
  const pick = money[money.length - 1];
  const firstNum = nums[0];
  // число внутри названия вроде «Bintang 0,62» оставляем в названии, если после него есть буквы
  const cut = nums.find((n) => !/[a-zа-яё]{2,}/i.test(line.slice(n.at + n.raw.length))) ?? firstNum;
  const name = line.slice(0, cut.at).replace(/^[\d\s.,*xх×#-]+(?=[^\d])/i, "").replace(/[\s.:=*×xх@|-]+$/i, "").trim();
  return { name, price: pick.v };
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").replace(/[|]/g, " ").trim()).filter(Boolean);
  const items: ReceiptItem[] = [];
  let total: number | null = null, service = 0, place = "";
  for (const line of lines) {
    const sp = /\d/.test(line) ? splitLine(line) : null;
    if (!sp) { if (!place && /[a-zа-яё]{3,}/i.test(line) && !SKIP.test(line)) place = line.slice(0, 40); continue; }
    const { name, price } = sp;
    if (!price || price <= 0) continue;
    if (TOTAL.test(line)) { total = Math.max(total ?? 0, price); continue; }
    if (SERVICE.test(line) && !/[а-яёa-z]{4,}.*\d+\s*(шт|pcs)/i.test(line)) { service += price; continue; }
    if (SKIP.test(line)) continue;
    // имя должно содержать буквы, иначе это служебная строка с числами
    if (!/[a-zа-яё]{2,}/i.test(name)) { if (!place && /[a-zа-яё]{3,}/i.test(line)) place = ""; continue; }
    items.push({ name: name.slice(0, 60), price, who: [] });
  }
  return { place: /\d/.test(place) ? "" : place, items, total, service };
}

// ---------- ИИ-распознавание на сервере ----------
async function toJpegBase64(file: Blob, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Не удалось открыть фото")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally { URL.revokeObjectURL(url); }
}
type AiReceipt = {
  place?: string; currency?: string | null; confidence?: "high" | "medium" | "low";
  items?: { name: string; name_ru?: string; quantity?: number; line_total: number }[];
  service_and_tax?: number; discount?: number; total?: number | null;
};
export type ScanResult = ParsedReceipt & { currency: string | null; confidence: "high" | "medium" | "low"; ai: boolean };

export async function recognizeAI(file: Blob): Promise<ScanResult> {
  const image = await toJpegBase64(file);
  const r = await call<AiReceipt>("scanReceipt", { image, mediaType: "image/jpeg" });
  const items: ReceiptItem[] = (r.items ?? [])
    .filter((i) => Number(i.line_total) > 0)
    .map((i) => {
      const nm = (i.name_ru && i.name_ru !== i.name ? i.name_ru : i.name) || "Позиция";
      const q = Number(i.quantity) > 1 ? ` ×${Number(i.quantity)}` : "";
      return { name: (nm + q).slice(0, 60), price: Math.round(Number(i.line_total) * 100) / 100, who: [] };
    });
  const sum = items.reduce((s, i) => s + i.price, 0);
  const service = Math.max(0, Number(r.service_and_tax) || 0) - Math.max(0, Number(r.discount) || 0);
  const total = r.total && r.total > 0 ? Number(r.total) : sum + service;
  return { place: r.place ?? "", items, total, service, currency: r.currency ?? null, confidence: r.confidence ?? "medium", ai: true };
}
