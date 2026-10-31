// Вебхук бота: личные сообщения, групповые чаты Telegram, ответы на обращения из «Помощи».
import {
  ADMIN_ID, APP_URL, BOT_TOKEN, BOT_USERNAME, db, esc, groupLink, guessCat, mdToHtml, money, onN, parseExpense,
  notifyUser, planText, rateOf, rub, tgApi,
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
    url: selfUrl, secret_token: secret, allowed_updates: ["message", "my_chat_member", "callback_query"], drop_pending_updates: false,
  });
  results.menu = await tgApi("setChatMenuButton", { menu_button: { type: "web_app", text: "Запустить", web_app: { url: APP_URL } } });
  results.cmdPrivate = await tgApi("setMyCommands", {
    scope: { type: "all_private_chats" },
    commands: [{ command: "start", description: "Открыть Скинемся" }, { command: "help", description: "Инструкция и видеоуроки" }],
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
  "Платит тот, кто написал сообщение.\n\n" +
  `📖 <a href="https://t.me/${BOT_USERNAME}?start=help">Инструкция с видеоуроками</a> — в личке бота.`;

// ---------- инструкция и видеоуроки ----------
const VIDEOS: { key: string; file: string; title: string }[] = [
  { key: "obzor", file: "01-obzor", title: "👀 Обзор" },
  { key: "gruppa", file: "02-gruppa", title: "👥 Группа и друзья" },
  { key: "rashod", file: "03-rashod", title: "💱 Расход в валюте" },
  { key: "chek", file: "04-chek", title: "🧾 Скан чека" },
  { key: "raschet", file: "05-raschet", title: "💸 Расчёт и долги" },
  { key: "chat", file: "06-chat", title: "💬 Чат и бот" },
  { key: "full", file: "full", title: "🎬 Всё сразу · 3,5 мин" },
];
const GUIDE =
  "<b>Как пользоваться Скинемся</b>\n\n" +
  "<b>1. Создай группу.</b> Нажми «Запустить» → «Создать группу»: название, даты и основная валюта поездки.\n\n" +
  "<b>2. Позови друзей.</b> Кнопка «Позвать» даст ссылку. Кто откроет её в Telegram, сразу попадёт в группу — регистрация не нужна.\n\n" +
  "<b>3. Записывай траты.</b> Кнопка «+» внизу: сумма, валюта, кто платил и на кого делим — поровну или долями. Курс подставится сам.\n\n" +
  "<b>4. Сканируй чеки.</b> «Скан чека» → фото. ИИ разберёт позиции, а каждый отметит, что ел. Сервис и налог поделятся пропорционально.\n\n" +
  "<b>5. Рассчитайтесь.</b> «Расчёт» покажет минимум переводов. Перевёл — жми «Оплачено», долг закроется, когда получатель подтвердит.\n\n" +
  "<b>6. Пиши траты в чат.</b> Во вкладке «Чат» или в чате поездки в Telegram (добавь меня туда): <code>+1200 такси</code>, <code>+45 eur ужин</code>, а <code>/итог</code> покажет долги.\n\n" +
  "👇 Видеоуроки по каждому шагу:";
const guideMarkup = () => ({
  inline_keyboard: [
    ...VIDEOS.slice(0, 6).reduce((rows: { text: string; callback_data: string }[][], v, i) => {
      if (i % 2 === 0) rows.push([]);
      rows[rows.length - 1].push({ text: v.title, callback_data: "vid:" + v.key });
      return rows;
    }, []),
    [{ text: VIDEOS[6].title, callback_data: "vid:full" }],
    [{ text: "🚀 Запустить Скинемся", web_app: { url: APP_URL } }],
  ],
});
async function sendVideo(chatId: number, key: string) {
  const v = VIDEOS.find((x) => x.key === key);
  if (!v) return;
  await tgApi("sendChatAction", { chat_id: chatId, action: "upload_video" });
  // file_id после первой отправки храним, чтобы Telegram не скачивал видео заново
  const { data: cached } = await db.from("app_config").select("value").eq("key", "video:" + v.file).maybeSingle();
  const base = APP_URL.replace(/\/?$/, "/") + "video/";
  const body = {
    chat_id: chatId, caption: `<b>${v.title}</b>`, parse_mode: "HTML", supports_streaming: true, width: 1080, height: 1920,
    reply_markup: { inline_keyboard: [[{ text: "🚀 Запустить Скинемся", web_app: { url: APP_URL } }]] },
  };
  let r = cached?.value ? await tgApi<{ video?: { file_id: string } }>("sendVideo", { ...body, video: cached.value }) : { ok: false };
  if (!r.ok) {
    r = await tgApi<{ video?: { file_id: string } }>("sendVideo", { ...body, video: `${base}${v.file}.mp4?v=1` });
    const fid = (r as { result?: { video?: { file_id: string } } }).result?.video?.file_id;
    if (fid) await db.from("app_config").upsert({ key: "video:" + v.file, value: fid });
  }
  if (!r.ok) await tgApi("sendMessage", { chat_id: chatId, text: `Не получилось отправить видео. Его можно посмотреть по ссылке: ${base}${v.file}.mp4` });
}
async function handleCallback(q: { id: string; data?: string; message?: { chat: { id: number } }; from: { id: number } }) {
  await tgApi("answerCallbackQuery", { callback_query_id: q.id });
  const chatId = q.message?.chat.id ?? q.from.id;
  if (q.data === "guide") { await tgApi("sendMessage", { chat_id: chatId, text: GUIDE, parse_mode: "HTML", reply_markup: guideMarkup() }); return; }
  if (q.data?.startsWith("vid:")) await sendVideo(chatId, q.data.slice(4));
}

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
  if (u.callback_query) return handleCallback(u.callback_query);
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
      const ok = await notifyUser(fb.user_id, `💬 <b>Ответ от разработчика Скинемся</b>\n\n${esc(text || m.caption || "")}`);
      await reply(m, ok ? "Ответ отправлен." : fb.user_id < 0
        ? "Не получилось отправить во ВКонтакте: не подключено сообщество или человек не разрешил сообщения."
        : "Не получилось отправить. Возможно, человек не запускал бота.");
      return;
    }
  }
  if (m.from!.id === ADMIN_ID && /^\/stats/.test(text)) {
    const { data: st } = await db.rpc("admin_stats");
    await reply(m, statsText(st), { inline_keyboard: [[{ text: "📊 Подробная статистика", web_app: { url: APP_URL.replace(/\/?$/, "/") + "?stats=1" } }]] });
    return;
  }
  if (/^\/(help|guide|instr)/.test(text) || /^\/start\s+help/.test(text) || /инструкц|помощ|как пользоваться/i.test(text)) {
    await reply(m, GUIDE, guideMarkup());
    return;
  }
  await reply(m, `Привет, ${esc(m.from!.first_name)}! 👋\n\nЯ помогаю делить общие траты в поездках: валюты, чеки и кто кому сколько должен.\n\nЖми «Запустить», а если впервые здесь — загляни в инструкцию: там короткие видеоуроки.`,
    { inline_keyboard: [[{ text: "🚀 Запустить Скинемся", web_app: { url: APP_URL } }], [{ text: "📖 Инструкция и видео", callback_data: "guide" }]] });
}

// ---------- статистика для владельца ----------
// deno-lint-ignore no-explicit-any
export function statsText(s: any) {
  const n = (v: unknown) => new Intl.NumberFormat("ru-RU").format(Number(v ?? 0));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");
  const u = s.users, g = s.groups, e = s.expenses, f = s.features, fu = s.funnel;
  const src = e.by_source ?? {};
  return `📊 <b>Скинемся · статистика</b>\n\n` +
    `<b>Пользователи:</b> ${n(u.total)} (+${n(u.new_today)} сегодня, +${n(u.new_7d)} за неделю)\n` +
    `Активны: сегодня ${n(u.dau)} · за 7 дней ${n(u.wau)} · за 30 дней ${n(u.mau)}\n` +
    `Вернулись повторно: ${n(u.returning)} (${pct(u.returning, u.total)})\n` +
    `Telegram ${n(u.platforms?.telegram)} · ВКонтакте ${n(u.platforms?.vk)}\n\n` +
    `<b>Группы:</b> ${n(g.total)} (+${n(g.new_7d)} за неделю)\n` +
    `С друзьями: ${n(g.with_friends)} · с тратами: ${n(g.with_expenses)} · с чатом Telegram: ${n(g.chat_linked)}\n\n` +
    `<b>Траты:</b> ${n(e.total)} (+${n(e.new_7d)} за неделю) на ${n(e.sum_rub)} ₽\n` +
    `Из приложения ${n(src.app)} · из чата ${n(src.chat)} · по чеку ${n(src.scan)}\n` +
    `ИИ-сканов: ${n(f.ai_scans)} · напоминаний: ${n(f.reminders_sent)} · обращений: ${n(f.feedback)}\n\n` +
    `<b>Воронка:</b> открыли ${n(fu.opened)} → в группе ${n(fu.in_group)} → с друзьями ${n(fu.with_friends)} → добавили трату ${n(fu.added_expense)} → рассчитались ${n(fu.settled)}`;
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
