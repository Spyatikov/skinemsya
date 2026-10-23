// Распознавание чека через Claude (vision + структурированный ответ через tool use).
import { db, fail } from "./shared.ts";

const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODELS = [Deno.env.get("RECEIPT_MODEL"), "claude-sonnet-5-5", "claude-sonnet-4-5"].filter(Boolean) as string[];
const DAILY_LIMIT = Number(Deno.env.get("RECEIPT_DAILY_LIMIT") ?? "40");
export const aiEnabled = () => Boolean(KEY);

const TOOL = {
  name: "receipt",
  description: "Структурированные данные чека",
  input_schema: {
    type: "object",
    properties: {
      place: { type: "string", description: "Название заведения или магазина, коротко. Пусто, если не видно." },
      currency: { type: ["string", "null"], description: "ISO-код валюты чека (IDR, THB, RUB, EUR…), если его можно определить по чеку или стране." },
      items: {
        type: "array",
        description: "Позиции, за которые платили. Только товары и блюда, без итогов, налогов, сервиса, способа оплаты и сдачи.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Название позиции как в чеке, без количества." },
            name_ru: { type: "string", description: "Короткий перевод названия на русский, если чек не на русском. Иначе повтори name." },
            quantity: { type: "number", description: "Количество, по умолчанию 1." },
            line_total: { type: "number", description: "Итоговая цена строки (количество × цена за штуку) с учётом скидки на эту строку." },
          },
          required: ["name", "name_ru", "quantity", "line_total"],
        },
      },
      service_and_tax: { type: "number", description: "Сумма сервисного сбора, налогов и чаевых, которые добавлены СВЕРХУ к позициям. 0, если налог уже включён в цены." },
      discount: { type: "number", description: "Общая скидка на весь чек (положительное число), 0 если нет." },
      total: { type: ["number", "null"], description: "Итоговая сумма к оплате по чеку." },
      confidence: { type: "string", enum: ["high", "medium", "low"], description: "Насколько уверенно читается чек." },
    },
    required: ["place", "currency", "items", "service_and_tax", "discount", "total", "confidence"],
  },
};

const PROMPT = `Это фото чека из кафе, ресторана или магазина. Извлеки позиции для разделения счёта между друзьями.
Правила:
- Модификаторы и допы (например «+ сыр», «extra shot», «без сахара» с ценой) прибавь к основной позиции над ними, а не делай отдельной позицией, если они явно к ней относятся.
- Если строка «2 x Bintang 35 000  70 000», то name="Bintang", quantity=2, line_total=70000.
- Числа пиши без разделителей тысяч: 45.000 в индонезийском чеке это 45000, 1 250,00 это 1250.
- Не включай в items строки Subtotal, Total, Tax, PB1, PPN, Service, НДС, Итого, Наличные, Сдача, Card и подобные.
- Налоги и сервис, которые прибавляются к сумме позиций, сложи в service_and_tax.
- Если что-то не читается, всё равно верни то, что видно, и поставь confidence=low.`;

export async function scanReceipt(userId: number, imageB64: string, mediaType: string) {
  if (!KEY) fail(503, "ИИ-распознавание ещё не настроено");
  if (!imageB64 || imageB64.length > 7_000_000) fail(400, "Фото слишком большое или пустое");
  const day = new Date().toISOString().slice(0, 10);
  const { data: used } = await db.from("ai_usage").select("count").eq("user_id", userId).eq("day", day).maybeSingle();
  if ((used?.count ?? 0) >= DAILY_LIMIT) fail(429, `Лимит ${DAILY_LIMIT} сканов в день исчерпан. Позиции можно ввести вручную.`);
  await db.from("ai_usage").upsert({ user_id: userId, day, count: (used?.count ?? 0) + 1 });

  let lastErr = "";
  for (const model of MODELS) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4000,
        tools: [TOOL], tool_choice: { type: "tool", name: "receipt" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageB64 } },
          { type: "text", text: PROMPT },
        ] }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const tool = (j.content ?? []).find((c: { type: string }) => c.type === "tool_use");
      if (!tool) fail(502, "ИИ не вернул данные чека");
      return tool.input;
    }
    lastErr = j?.error?.message ?? `HTTP ${r.status}`;
    if (r.status !== 404 && !/model/i.test(lastErr)) break; // пробуем другую модель, только если эта недоступна
  }
  console.error("anthropic error:", lastErr);
  fail(502, "ИИ сейчас не ответил. Попробуй ещё раз или введи позиции вручную.");
}
