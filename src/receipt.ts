// Распознавание чека в браузере (Tesseract.js, языки rus+eng) и разбор строк в позиции.
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
const PRICE_AT_END = /^(.*?)[\s.:=*×xх-]*((?:\d{1,3}(?:[ ., ']\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|р\.?|rp|idr|฿|thb|₹|rs\.?|inr|\$|€|usd|eur)?\s*$/i;

export type ParsedReceipt = { place: string; items: ReceiptItem[]; total: number | null; service: number };

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const items: ReceiptItem[] = [];
  let total: number | null = null, service = 0, place = "";
  for (const line of lines) {
    const m = line.match(PRICE_AT_END);
    if (!m) { if (!place && /[a-zа-яё]{3,}/i.test(line) && !SKIP.test(line)) place = line.slice(0, 40); continue; }
    const name = m[1].replace(/^[\d\s.,*xх×#-]+(?=[^\d])/i, "").replace(/[\s.:=*-]+$/, "").trim();
    const price = parseAmount(m[2]);
    if (!price || price <= 0) continue;
    if (TOTAL.test(line)) { total = Math.max(total ?? 0, price); continue; }
    if (SERVICE.test(line) && !/[а-яёa-z]{4,}.*\d+\s*(шт|pcs)/i.test(line)) { service += price; continue; }
    if (SKIP.test(line)) continue;
    // имя должно содержать буквы, иначе это служебная строка с числами
    if (!/[a-zа-яё]{2,}/i.test(name)) continue;
    items.push({ name: name.slice(0, 60), price, who: [] });
  }
  // если итог на чеке меньше суммы позиций, лишние строки — скорее всего мусор; оставляем как есть, человек поправит
  return { place, items, total, service };
}
