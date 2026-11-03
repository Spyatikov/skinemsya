// Бот ВКонтакте: события Callback API сообщества «Скинемся».
// В беседе, куда добавлено сообщество, записывает траты «+1200 такси», показывает «итог»;
// в личных сообщениях отвечает подсказкой и ссылкой на приложение.
import {
  db, guessCat, money, onN, parseExpense, planText, rateOf, rub, VK_GROUP_ID, vkApi,
  vkCallbackSecret, vkSend,
} from "./shared.ts";

const CHAT_BASE = 2_000_000_000;
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1");

const HELP_CHAT =
  "Как записывать траты в этой беседе:\n" +
  "• +1200 такси — трата в основной валюте группы, делится на всех\n" +
  "• +45 eur ужин @Маша — в евро, делится между тобой и Машей\n" +
  "• итог — кто кому сколько должен\n\n" +
  "Платит тот, кто написал сообщение.";
const HOW_TO_LINK =
  "Привет! Я записываю общие траты 👋\n\n" +
  "Чтобы связать беседу с группой поездки, открой приложение «Скинемся» → карандаш в шапке группы → «Беседа ВКонтакте» и отправь сюда команду, которую там покажут (вида «/привязать abc123»).\n\n" +
  "Чтобы я видел сообщения вида «+1200 такси» без упоминания, в настройках беседы дай сообществу «Скинемся» доступ ко всей переписке.";
const HELP_PRIVATE =
  "Привет! Я помогаю делить общие траты в поездках: валюты, чеки и кто кому сколько должен.\n\n" +
  "Всё делается в приложении: создай группу, позови друзей по ссылке и записывай траты.\n" +
  "А ещё меня можно добавить в беседу с друзьями — тогда траты можно писать прямо туда: «+1200 такси».\n\n" +
  "Сюда я буду присылать уведомления: переводы, подтверждения и напоминания о долгах.";

type VkMsg = {
  peer_id: number; from_id: number; text: string; conversation_message_id?: number;
  action?: { type: string; member_id?: number };
};

/** Обработка запроса Callback API. Возвращает текст ответа для ВК. */
export async function handleVkCallback(ev: { type: string; group_id: number; secret?: string; object?: Record<string, unknown> }) {
  if (ev.type === "confirmation") return await confirmationCode();
  if (ev.secret !== await vkCallbackSecret()) return "forbidden";
  try {
    if (ev.type === "message_new") await onMessage((ev.object as { message: VkMsg }).message);
  } catch (e) { console.error("vk event failed", ev.type, e); }
  return "ok";
}

async function confirmationCode() {
  const { data } = await db.from("app_config").select("value").eq("key", "vk_confirm").maybeSingle();
  if (data?.value) return data.value as string;
  const r = await vkApi<{ code: string }>("groups.getCallbackConfirmationCode", { group_id: VK_GROUP_ID });
  const code = r.response?.code ?? "";
  if (code) await db.from("app_config").upsert({ key: "vk_confirm", value: code });
  return code;
}

/** Подключает сервер Callback API к сообществу (идемпотентно). Вызывается из ?cron=vksetup. */
export async function setupVkCallback(selfUrl: string) {
  const out: Record<string, unknown> = {};
  await db.from("app_config").delete().eq("key", "vk_confirm");
  out.confirmation = await confirmationCode();
  const list = await vkApi<{ items: { id: number; url: string }[] }>("groups.getCallbackServers", { group_id: VK_GROUP_ID });
  out.servers = list;
  let id = list.response?.items.find((s) => s.url === selfUrl)?.id;
  const secret = await vkCallbackSecret();
  if (!id) {
    const add = await vkApi<{ server_id: number }>("groups.addCallbackServer", { group_id: VK_GROUP_ID, url: selfUrl, title: "Skinemsya", secret_key: secret });
    out.add = add;
    id = add.response?.server_id;
  } else {
    out.edit = await vkApi("groups.editCallbackServer", { group_id: VK_GROUP_ID, server_id: id, url: selfUrl, title: "Skinemsya", secret_key: secret });
  }
  if (id) {
    out.settings = await vkApi("groups.setCallbackSettings", {
      group_id: VK_GROUP_ID, server_id: id, api_version: "5.199", message_new: 1, message_allow: 1,
    });
  }
  return out;
}

// ---------- профили ----------
type VkUser = { id: number; first_name: string; last_name?: string; photo_100?: string };
async function vkUsers(ids: number[]): Promise<VkUser[]> {
  if (!ids.length) return [];
  const r = await vkApi<VkUser[]>("users.get", { user_ids: ids.join(","), fields: "photo_100" });
  return r.response ?? [];
}
/** профиль ВК-пользователя в базе: id = -vk_id */
async function ensureProfiles(users: VkUser[]) {
  for (const u of users) {
    const { data: ex } = await db.from("profiles").select("id").eq("id", -u.id).maybeSingle();
    const row = { first_name: u.first_name, last_name: u.last_name || null, platform: "vk" };
    if (ex) await db.from("profiles").update(row).eq("id", -u.id);
    else await db.from("profiles").insert({ id: -u.id, ...row, photo_url: u.photo_100 ?? null });
  }
}
async function ensureMember(groupId: string, uid: number) {
  const { data } = await db.from("members").select("user_id").eq("group_id", groupId).eq("user_id", uid).maybeSingle();
  if (!data) await db.from("members").insert({ group_id: groupId, user_id: uid });
}

// ---------- сообщения ----------
async function onMessage(m: VkMsg) {
  if (!m || m.from_id <= 0) return; // сообщения сообществ и ботов не обрабатываем
  const isChat = m.peer_id > CHAT_BASE;
  // сообщество добавили в беседу
  if (isChat && m.action?.type === "chat_invite_user" && m.action.member_id === -VK_GROUP_ID) {
    const { data: g } = await db.from("groups").select("id").eq("vk_peer_id", m.peer_id).maybeSingle();
    if (!g) await vkSend(m.peer_id, HOW_TO_LINK);
    return;
  }
  // убираем упоминание сообщества в начале: «[club123|Скинемся], итог» или «@club123 итог»
  const text = (m.text ?? "").replace(new RegExp(`^\\s*(\\[club${VK_GROUP_ID}\\|[^\\]]*\\]|@club${VK_GROUP_ID}|@\\S+)?[\\s,:]*`), "").trim();
  if (!isChat) {
    await vkSend(m.peer_id, HELP_PRIVATE, { code: "" });
    return;
  }
  const reply = (t: string, code?: string) => vkSend(m.peer_id, t, { code, replyTo: m.conversation_message_id });
  const lower = text.toLowerCase();

  // привязка: «/привязать КОД»
  const link = lower.match(/^\/?(?:привязать|connect|start)\s+([a-z0-9]{6,32})$/i);
  if (link) {
    const { data: g } = await db.from("groups").select("id,name,invite_code").eq("invite_code", link[1]).maybeSingle();
    if (!g) { await reply("Не нашёл группу по этому коду. Скопируй команду в приложении ещё раз: карандаш в шапке группы → «Беседа ВКонтакте»."); return; }
    const { data: isMember } = await db.from("members").select("user_id").eq("group_id", g.id).eq("user_id", -m.from_id).maybeSingle();
    if (!isMember) { await reply("Привязать беседу может только участник этой группы в «Скинемся». Сначала открой приглашение в группу."); return; }
    const conv = await vkApi<{ items: { chat_settings?: { title?: string } }[] }>("messages.getConversationsById", { peer_ids: m.peer_id });
    const title = conv.response?.items?.[0]?.chat_settings?.title ?? null;
    await db.from("groups").update({ vk_peer_id: null, vk_chat_title: null }).eq("vk_peer_id", m.peer_id);
    await db.from("groups").update({ vk_peer_id: m.peer_id, vk_chat_title: title }).eq("id", g.id);
    await db.from("messages").insert({ group_id: g.id, user_id: null, text: `Подключена беседа ВКонтакте${title ? ` «${title}»` : ""}. Траты из неё будут попадать сюда.` });
    await reply(`✅ Беседа связана с группой «${g.name}».\n\n${HELP_CHAT}`, g.invite_code);
    return;
  }

  const { data: g } = await db.from("groups").select("id,name,invite_code,currency").eq("vk_peer_id", m.peer_id).maybeSingle();
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

  // упоминания: [id123|Маша] — точные, @слово — по имени среди участников
  const tags = [...raw.matchAll(/\[id(\d+)\|[^\]]*\]/g)].map((x) => Number(x[1]));
  const clean = raw.replace(/\[id\d+\|[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  const p = parseExpense(clean);
  if (!p) { await reply("Не понял сумму. Пример: +1200 такси или +45 eur ужин"); return; }

  const users = await vkUsers([m.from_id, ...tags]);
  await ensureProfiles(users);
  await ensureMember(g.id, -m.from_id);
  for (const t of tags) await ensureMember(g.id, -t);
  const payerName = users.find((u) => u.id === m.from_id)?.first_name ?? "Участник";

  const { data: mem } = await db.from("members").select("user_id,profiles(first_name,username)").eq("group_id", g.id);
  const list = (mem ?? []).map((x: any) => ({ id: x.user_id as number, name: String(x.profiles?.first_name ?? ""), username: String(x.profiles?.username ?? "") }));
  const tagged = new Set<number>(tags.map((t) => -t));
  for (const q of p.mentions) {
    const hit = list.find((x) => x.username.toLowerCase() === q || x.name.toLowerCase() === q || (q.length > 2 && x.name.toLowerCase().startsWith(q)));
    if (hit) tagged.add(hit.id);
  }
  const members = tagged.size ? [...new Set([-m.from_id, ...tagged])] : list.map((x) => x.id);
  const currency = p.currency ?? g.currency;
  let rate: number;
  try { rate = await rateOf(currency); } catch { await reply(`Не знаю курс валюты ${currency}.`); return; }
  const { error } = await db.from("expenses").insert({
    group_id: g.id, kind: "expense", title: p.title, category: guessCat(p.title), amount: p.amount, currency, rate,
    payer: -m.from_id, split: { type: "equal", members }, source: "chat", spent_on: new Date().toISOString().slice(0, 10), created_by: -m.from_id,
  });
  if (error) { await reply("Не получилось записать трату, попробуй ещё раз."); return; }
  const inRub = p.amount * rate;
  const line = `Записал **${p.title}**: ${money(p.amount, currency)}${currency !== "RUB" ? ` ≈ ${rub(inRub)}` : ""}.\nПлатил(а) ${payerName}, делим ${onN(members.length)} по ${rub(inRub / members.length)}.`;
  await db.from("messages").insert([
    { group_id: g.id, user_id: -m.from_id, text: raw.slice(0, 2000) },
    { group_id: g.id, user_id: null, text: line, open_feed: true },
  ]);
  await reply("✅ " + plain(line), g.invite_code);
}

