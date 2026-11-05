// Бот MAX: вебхук платформы MAX для партнёров.
// В групповом чате, куда добавлен бот, записывает траты «+1200 такси» и показывает «итог»;
// в личке отвечает подсказкой и кнопкой, открывающей мини-приложение.
import {
  db, guessCat, MAX_BOT_TOKEN, MAX_OFFSET, maxApi, maxSend, money, onN, parseExpense, planText, rateOf, rub,
} from "./shared.ts";

const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1");

const HELP_CHAT =
  "Как записывать траты в этом чате:\n" +
  "• +1200 такси — трата в основной валюте группы, делится на всех\n" +
  "• +45 eur ужин @Маша — в евро, делится между тобой и Машей\n" +
  "• итог — кто кому сколько должен\n\n" +
  "Платит тот, кто написал сообщение.";
const HOW_TO_LINK =
  "Привет! Я записываю общие траты 👋\n\n" +
  "Чтобы связать этот чат с группой поездки, открой «Скинемся» → карандаш в шапке группы → «Чат MAX» и отправь сюда команду, которую там покажут (вида «/привязать abc123»).\n\n" +
  "Чтобы я видел сообщения «+1200 такси», сделай меня администратором чата.";
const HELP_PRIVATE =
  "Привет! Я «Скинемся» — помогаю делить общие траты в поездках: валюты, чеки и кто кому сколько должен.\n\n" +
  "Нажми «Открыть Скинемся», создай группу и позови друзей по ссылке — регистрация не нужна.\n" +
  "А ещё меня можно добавить в чат поездки и писать траты прямо туда: «+1200 такси».\n\n" +
  "Сюда я буду присылать уведомления: переводы, подтверждения и напоминания о долгах.";

/** секрет вебхука выводим из токена бота — отдельный секрет заводить не нужно (только буквы и цифры, как требует MAX) */
export async function maxWebhookSecret() {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("maxwh:" + MAX_BOT_TOKEN)));
  return [...h].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** Подписывает функцию на события бота. Вызывается из ?cron=maxsetup. */
export async function setupMaxBot(selfUrl: string) {
  const me = await maxApi("GET", "/me");
  const subs = await maxApi("POST", "/subscriptions", {
    url: selfUrl, secret: await maxWebhookSecret(),
    update_types: ["message_created", "bot_started", "bot_added"],
  });
  const list = await maxApi("GET", "/subscriptions");
  return { me: me.data ?? me.error, subscribe: subs.data ?? subs.error, subscriptions: list.data ?? list.error };
}

type MaxUser = { user_id: number; first_name?: string; last_name?: string | null; username?: string | null; is_bot?: boolean };
type MaxUpdate = {
  update_type: string; chat_id?: number; user?: MaxUser; payload?: string | null;
  message?: { sender?: MaxUser; recipient?: { chat_id?: number | null; chat_type?: string; user_id?: number | null }; body?: { mid?: string; text?: string | null } };
};

export async function handleMaxUpdate(u: MaxUpdate) {
  if (u.update_type === "bot_started" && u.user) {
    await ensureProfile(u.user);
    const code = u.payload && /^[a-z0-9]{6,32}$/i.test(u.payload) ? u.payload : "";
    await maxSend({ user_id: u.user.user_id }, HELP_PRIVATE, { code });
    return;
  }
  if (u.update_type === "bot_added" && u.chat_id) {
    const { data: g } = await db.from("groups").select("id").eq("max_chat_id", u.chat_id).maybeSingle();
    if (!g) await maxSend({ chat_id: u.chat_id }, HOW_TO_LINK);
    return;
  }
  if (u.update_type === "message_created" && u.message) return onMessage(u.message);
}

async function ensureProfile(x: MaxUser) {
  const id = MAX_OFFSET + x.user_id;
  const row = { first_name: (x.first_name || "Друг из MAX").slice(0, 64), last_name: x.last_name || null, username: x.username || null, platform: "max" };
  const { data: ex } = await db.from("profiles").select("id").eq("id", id).maybeSingle();
  if (ex) await db.from("profiles").update(row).eq("id", id);
  else await db.from("profiles").insert({ id, ...row });
  return id;
}
async function ensureMember(groupId: string, uid: number) {
  const { data } = await db.from("members").select("user_id").eq("group_id", groupId).eq("user_id", uid).maybeSingle();
  if (!data) await db.from("members").insert({ group_id: groupId, user_id: uid });
}

async function onMessage(m: NonNullable<MaxUpdate["message"]>) {
  const sender = m.sender;
  if (!sender || sender.is_bot) return;
  const chatType = m.recipient?.chat_type;
  const chatId = m.recipient?.chat_id ?? null;
  // убираем обращение к боту в начале: «@бот итог»
  const text = String(m.body?.text ?? "").replace(/^\s*@\S+[\s,:]*/, "").trim();
  if (chatType === "dialog" || !chatId) {
    await ensureProfile(sender);
    await maxSend({ user_id: sender.user_id }, HELP_PRIVATE, { code: "" });
    return;
  }
  const reply = (t: string, code?: string) => maxSend({ chat_id: chatId }, t, { code, replyTo: m.body?.mid });
  const lower = text.toLowerCase();

  // привязка: «/привязать КОД»
  const link = lower.match(/^\/?(?:привязать|connect|start)\s+([a-z0-9]{6,32})$/i);
  if (link) {
    const me = await ensureProfile(sender);
    const { data: g } = await db.from("groups").select("id,name,invite_code").eq("invite_code", link[1]).maybeSingle();
    if (!g) { await reply("Не нашёл группу по этому коду. Скопируй команду в приложении ещё раз: карандаш в шапке группы → «Чат MAX»."); return; }
    const { data: isMember } = await db.from("members").select("user_id").eq("group_id", g.id).eq("user_id", me).maybeSingle();
    if (!isMember) { await reply("Привязать чат может только участник этой группы в «Скинемся». Сначала открой приглашение в группу."); return; }
    const chat = await maxApi<{ title?: string }>("GET", `/chats/${chatId}`);
    const title = (chat.data as { title?: string } | undefined)?.title ?? null;
    await db.from("groups").update({ max_chat_id: null, max_chat_title: null }).eq("max_chat_id", chatId);
    await db.from("groups").update({ max_chat_id: chatId, max_chat_title: title }).eq("id", g.id);
    await db.from("messages").insert({ group_id: g.id, user_id: null, text: `Подключён чат MAX${title ? ` «${title}»` : ""}. Траты из него будут попадать сюда.` });
    await reply(`✅ Чат связан с группой «${g.name}».\n\n${HELP_CHAT}`, g.invite_code);
    return;
  }

  const { data: g } = await db.from("groups").select("id,name,invite_code,currency").eq("max_chat_id", chatId).maybeSingle();
  if (/^\/?(help|помощь|справка)$/.test(lower)) { await reply(g ? HELP_CHAT : HOW_TO_LINK); return; }
  if (/^\/?(итог|itog|расчёт|расчет)$/.test(lower)) {
    if (!g) { await reply(HOW_TO_LINK); return; }
    await reply(plain(await planText(g.id)), g.invite_code);
    return;
  }
  const add = lower.match(/^\/add\s+/);
  const raw = add ? text.slice(add[0].length) : text;
  if (!add && !/^\+\s*\d/.test(raw)) return; // обычная переписка — молчим
  if (!g) { await reply(HOW_TO_LINK); return; }
  const p = parseExpense(raw);
  if (!p) { await reply("Не понял сумму. Пример: +1200 такси или +45 eur ужин"); return; }

  const payer = await ensureProfile(sender);
  await ensureMember(g.id, payer);
  const { data: mem } = await db.from("members").select("user_id,profiles(first_name,username)").eq("group_id", g.id);
  // deno-lint-ignore no-explicit-any
  const list = (mem ?? []).map((x: any) => ({ id: x.user_id as number, name: String(x.profiles?.first_name ?? ""), username: String(x.profiles?.username ?? "") }));
  const tagged = new Set<number>();
  for (const q of p.mentions) {
    const hit = list.find((x) => x.username.toLowerCase() === q || x.name.toLowerCase() === q || (q.length > 2 && x.name.toLowerCase().startsWith(q)));
    if (hit) tagged.add(hit.id);
  }
  const members = tagged.size ? [...new Set([payer, ...tagged])] : list.map((x) => x.id);
  const currency = p.currency ?? g.currency;
  let rate: number;
  try { rate = await rateOf(currency); } catch { await reply(`Не знаю курс валюты ${currency}.`); return; }
  const { error } = await db.from("expenses").insert({
    group_id: g.id, kind: "expense", title: p.title, category: guessCat(p.title), amount: p.amount, currency, rate,
    payer, split: { type: "equal", members }, source: "chat", spent_on: new Date().toISOString().slice(0, 10), created_by: payer,
  });
  if (error) { await reply("Не получилось записать трату, попробуй ещё раз."); return; }
  const inRub = p.amount * rate;
  const line = `Записал **${p.title}**: ${money(p.amount, currency)}${currency !== "RUB" ? ` ≈ ${rub(inRub)}` : ""}.\nПлатил(а) ${sender.first_name ?? "участник"}, делим ${onN(members.length)} по ${rub(inRub / members.length)}.`;
  await db.from("messages").insert([
    { group_id: g.id, user_id: payer, text: raw.slice(0, 2000) },
    { group_id: g.id, user_id: null, text: line, open_feed: true },
  ]);
  await reply("✅ " + plain(line), g.invite_code);
}
