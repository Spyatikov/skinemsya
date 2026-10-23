// Вебхук бота: личные сообщения, групповые чаты Telegram, ответы на обращения из «Помощи».
import {
  ADMIN_ID, APP_URL, BOT_TOKEN, BOT_USERNAME, db, esc, groupLink, guessCat, mdToHtml, money, onN, parseExpense,
  planText, rateOf, rub, tgApi,
} from "./shared.ts";

/** секрет вебхука выводим из токена, чтобы не заводить ещё один секрет */
export async function webhookSecret() {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wh:" + BOT_TOKEN)));
  return [...h].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

/** Регистрирует вебхук, кнопку меню, команды и описание. Идемпотентно. */
export async function setupBot(selfUrl: string) {
  const secret = await webhookSecret();
  const results: Record<string, unknown> = {};
  results.webhook = await tgApi("setWebhook", {
    url: selfUrl, secret_token: secret, allowed_updates: ["message", "my_chat_member"], drop_pending_updates: false,
  });
  results.menu = await tgApi("setChatMenuButton", { menu_button: { type: "web_app", text: "Запустить", web_app: { url: APP_URL } } });
  results.cmdPrivate = await tgApi("setMyCommands", {
    scope: { type: "all_private_chats" },
    commands: [{ command: "start", description: "Открыть Скинемся" }, { command: "help", description: "Как пользоваться" }],
  });
  results.cmdGroups = await tgApi("setMyCommands", {
    scope: { type: "all_group_chats" },
    commands: [
      { command: "add", description: "Записать трату: /add 1200 такси" },
      { command: "itog", description: "Кто кому сколько должен" },
      { command: "help", description: "Как записывать траты" },
    ],
  });
  results.name = await tgApi("setMyName", { name: "Скинемся" });
  results.description = await tgApi("setMyDescription", { description: "✈️ Общие расходы в поездке — прямо в Telegram.\nДобавьте друзей по ссылке: регистрация не нужна, приложение бесплатно для всех участников.\n💬 Записывайте траты в приложении или общем чате.\nВстроенный бот добавит их в учёт и пересчитает сумму в валюту поездки.\n🧾 Сканируйте чеки и делите позиции между друзьями.\nОбсуждайте расходы во внутреннем чате поездки.\n💸 Считайтесь без лишних переводов.\n«Скинемся» покажет, кто кому сколько должен, составит план расчётов и пришлёт напоминания." });
  results.short = await tgApi("setMyShortDescription", { short_description: "Общие траты в поездках: валюты, чеки и кто кому должен" });
  return results;
}

const HELP_GROUP =
  "<b>Как записывать траты в этом чате</b>\n" +
  "• <code>+1200 такси</code> — трата в основной валюте группы, делится на всех\n" +
  "• <code>+45 eur ужин @masha</code> — в евро, делится между тобой и Машей\n" +
  "• <code>/add 1200 такси</code> — то же самое командой\n" +
  "• <code>/itog</code> — кто кому сколько должен\n\n" +
  "Платит тот, кто написал сообщение.";

const appButton = (text = "Запустить Скинемся") => ({ inline_keyboard: [[{ text, web_app: { url: APP_URL } }]] });
const urlButton = (url: string, text = "Открыть Скинемся") => ({ inline_keyboard: [[{ text, url }]] });

type TgUser = { id: number; first_name: string; last_name?: string; username?: string; is_bot?: boolean };
type TgMessage = {
  message_id: number; text?: string; caption?: string;
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string };
  from?: TgUser; reply_to_message?: TgMessage;
  entities?: { type: string; offset: number; length: number; user?: TgUser }[];
};

async function upsertProfile(u: TgUser) {
  // фото не трогаем: его знает только приложение
  await db.from("profiles").upsert({ id: u.id, first_name: u.first_name, last_name: u.last_name ?? null, username: u.username ?? null, updated_at: new Date().toISOString() }, { onConflict: "id" });
}
async function ensureMember(groupId: string, u: TgUser) {
  await upsertProfile(u);
  const { data } = await db.from("members").select("user_id").eq("group_id", groupId).eq("user_id", u.id).maybeSingle();
  if (!data) await db.from("members").insert({ group_id: groupId, user_id: u.id });
}
const reply = (m: TgMessage, html: string, markup?: unknown) =>
  tgApi("sendMessage", { chat_id: m.chat.id, text: html, parse_mode: "HTML", reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true }, ...(markup ? { reply_markup: markup } : {}), disable_web_page_preview: true });

export async function handleUpdate(u: Record<string, any>) {
  // бота добавили в группу без кода привязки
  if (u.my_chat_member) {
    const cm = u.my_chat_member;
    if (cm.chat.type !== "private" && ["member", "administrator"].includes(cm.new_chat_member?.status) && !["member", "administrator"].includes(cm.old_chat_member?.status)) {
      const { data: g } = await db.from("groups").select("id").eq("tg_chat_id", cm.chat.id).maybeSingle();
      if (!g) await tgApi("sendMessage", {
        chat_id: cm.chat.id, parse_mode: "HTML",
        text: "Привет! Я записываю общие траты 👋\n\nЧтобы связать этот чат с группой в Скинемся, открой приложение → настройки группы (карандаш) → <b>«Подключить чат Telegram»</b> и выбери этот чат.",
        reply_markup: urlButton(`https://t.me/${BOT_USERNAME}/app`),
      });
    }
    return;
  }
  const m: TgMessage | undefined = u.message;
  if (!m || !m.from || m.from.is_bot) return;
  const text = (m.text ?? "").trim();
  if (m.chat.type === "private") return handlePrivate(m, text);
  if (m.chat.type === "group" || m.chat.type === "supergroup") return handleGroup(m, text);
}

// ---------- личка ----------
async function handlePrivate(m: TgMessage, text: string) {
  // ответ админа на обращение из «Помощи» уходит автору обращения
  if (m.from!.id === ADMIN_ID && m.reply_to_message) {
    const { data: fb } = await db.from("feedback").select("id,user_id").eq("admin_msg_id", m.reply_to_message.message_id).maybeSingle();
    if (fb) {
      const r = await tgApi("sendMessage", { chat_id: fb.user_id, parse_mode: "HTML", text: `💬 <b>Ответ от разработчика Скинемся</b>\n\n${esc(text || m.caption || "")}` });
      await reply(m, r.ok ? "Ответ отправлен." : `Не получилось отправить: ${esc(String(r.description ?? ""))}. Возможно, человек не запускал бота.`);
      return;
    }
  }
  if (/^\/help/.test(text)) {
    await reply(m, "<b>Скинемся</b> считает общие траты в поездках.\n\n1. Открой приложение и создай группу.\n2. Позови друзей по ссылке из приложения.\n3. Записывай траты в любой валюте или сканируй чеки.\n4. Во вкладке «Расчёт» видно, кто кому сколько переводит.\n\nМеня можно добавить в чат поездки: там траты пишутся сообщениями вида «+1200 такси».", appButton());
    return;
  }
  await reply(m, `Привет, ${esc(m.from!.first_name)}! 👋\n\nЯ помогаю делить общие траты в поездках: валюты, чеки и кто кому сколько должен. Жми кнопку, чтобы начать.`, appButton());
}

// ---------- групповой чат ----------
async function handleGroup(m: TgMessage, text: string) {
  const cmd = text.match(/^\/(\w+)(?:@(\w+))?(?:\s+([\s\S]*))?$/);
  if (cmd && cmd[2] && cmd[2].toLowerCase() !== BOT_USERNAME.toLowerCase()) return; // команда другому боту
  const command = cmd?.[1]?.toLowerCase();
  const arg = cmd?.[3]?.trim() ?? "";

  // привязка: /start КОД приходит по ссылке ?startgroup=КОД
  if (command === "start" || command === "connect") {
    if (!arg) { await reply(m, HELP_GROUP); return; }
    const { data: g } = await db.from("groups").select("id,name,invite_code,tg_chat_id").eq("invite_code", arg).maybeSingle();
    if (!g) { await reply(m, "Не нашёл группу по этому коду. Открой настройки группы в приложении и нажми «Подключить чат Telegram» ещё раз."); return; }
    const { data: isMember } = await db.from("members").select("user_id").eq("group_id", g.id).eq("user_id", m.from!.id).maybeSingle();
    if (!isMember) { await reply(m, "Подключить чат может только участник этой группы в Скинемся."); return; }
    // один чат — одна группа
    await db.from("groups").update({ tg_chat_id: null, tg_chat_title: null }).eq("tg_chat_id", m.chat.id);
    await db.from("groups").update({ tg_chat_id: m.chat.id, tg_chat_title: m.chat.title ?? null }).eq("id", g.id);
    await db.from("messages").insert({ group_id: g.id, user_id: null, text: `Подключён чат Telegram «${m.chat.title ?? ""}». Траты из него будут попадать сюда.` });
    await reply(m, `✅ Чат связан с группой <b>${esc(g.name)}</b>.\n\n${HELP_GROUP}`, urlButton(groupLink(g.invite_code)));
    return;
  }

  const { data: g } = await db.from("groups").select("id,name,invite_code,currency").eq("tg_chat_id", m.chat.id).maybeSingle();
  if (command === "help") { await reply(m, g ? HELP_GROUP : HELP_GROUP + "\n\nСначала подключи этот чат: настройки группы в приложении → «Подключить чат Telegram»."); return; }
  if (command === "itog" || command === "итог" || /^\/итог/i.test(text)) {
    if (!g) { await reply(m, "Этот чат ещё не связан с группой Скинемся."); return; }
    await reply(m, mdToHtml(await planText(g.id)), urlButton(groupLink(g.invite_code)));
    return;
  }

  const isAdd = command === "add";
  const raw = isAdd ? arg : text;
  if (!isAdd && !/^\+\s*\d/.test(raw)) return; // обычная переписка, молчим
  if (!g) { await reply(m, "Этот чат ещё не связан с группой. Открой приложение → настройки группы → «Подключить чат Telegram»."); return; }
  const p = parseExpense(raw);
  if (!p) { await reply(m, "Не понял сумму. Пример: <code>+1200 такси</code> или <code>/add 45 eur ужин</code>"); return; }

  await ensureMember(g.id, m.from!);
  const { data: mem } = await db.from("members").select("user_id,profiles(first_name,username)").eq("group_id", g.id);
  const list = (mem ?? []).map((x: any) => ({ id: x.user_id as number, name: x.profiles?.first_name as string, username: (x.profiles?.username ?? "") as string }));
  // упоминания: @username или текстовое упоминание без username
  const tagged = new Set<number>();
  for (const e of m.entities ?? []) if (e.type === "text_mention" && e.user) { await ensureMember(g.id, e.user); tagged.add(e.user.id); }
  for (const q of p.mentions) {
    const hit = list.find((x) => x.username.toLowerCase() === q || x.name.toLowerCase() === q || x.name.toLowerCase().startsWith(q));
    if (hit) tagged.add(hit.id);
  }
  const all = list.map((x) => x.id);
  const members = tagged.size ? [...new Set([m.from!.id, ...tagged])] : all;
  const currency = p.currency ?? g.currency;
  let rate: number;
  try { rate = await rateOf(currency); } catch { await reply(m, `Не знаю курс валюты ${esc(currency)}.`); return; }
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await db.from("expenses").insert({
    group_id: g.id, kind: "expense", title: p.title, category: guessCat(p.title), amount: p.amount, currency, rate,
    payer: m.from!.id, split: { type: "equal", members }, source: "chat", spent_on: today, created_by: m.from!.id,
  });
  if (error) { await reply(m, "Не получилось записать трату, попробуй ещё раз."); return; }
  const inRub = p.amount * rate;
  const line = `Записал **${p.title}**: ${money(p.amount, currency)}${currency !== "RUB" ? ` ≈ ${rub(inRub)}` : ""}.\nПлатил(а) ${m.from!.first_name}, делим ${onN(members.length)} по ${rub(inRub / members.length)}.`;
  // зеркалим в чат приложения
  await db.from("messages").insert([
    { group_id: g.id, user_id: m.from!.id, text: raw.slice(0, 2000) },
    { group_id: g.id, user_id: null, text: line, open_feed: true },
  ]);
  await reply(m, "✅ " + mdToHtml(line), urlButton(groupLink(g.invite_code)));
}
