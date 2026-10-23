// Скинемся — единая серверная функция.
// Каждый запрос несёт Telegram initData; функция проверяет подпись токеном бота,
// обновляет профиль пользователя и выполняет действие от его имени.
// Она же принимает вебхук бота (POST с заголовком секрета) и настраивает бота (GET ?setup=1).
// Секреты (Supabase → Edge Functions → Secrets): TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY.
import { scanReceipt, aiEnabled } from "./ai.ts";
import { handleUpdate, setupBot, webhookSecret } from "./bot.ts";
import { ADMIN_ID, BOT_TOKEN, BOT_USERNAME, db, esc, fail, HttpError, money as fmtMoney, postToLinkedChat, tgApi } from "./shared.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// ---------- проверка initData ----------
const enc = new TextEncoder();
async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

type TgUser = { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string };
async function verifyInitData(initData: string): Promise<{ user: TgUser; startParam?: string }> {
  if (!BOT_TOKEN) fail(500, "На сервере не задан TELEGRAM_BOT_TOKEN");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) fail(401, "Открой приложение из Telegram");
  params.delete("hash");
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = await hmac(enc.encode("WebAppData"), BOT_TOKEN);
  if (hex(await hmac(secret, check)) !== hash) fail(401, "Подпись Telegram не сошлась");
  const authDate = Number(params.get("auth_date") ?? 0);
  if (Date.now() / 1000 - authDate > 7 * 24 * 3600) fail(401, "Сессия устарела, перезапусти приложение");
  const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
  if (!user?.id) fail(401, "Нет данных пользователя Telegram");
  return { user: user!, startParam: params.get("start_param") ?? undefined };
}

// ---------- помощники ----------
const inviteCode = () => {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  return [...b].map((x) => abc[x % abc.length]).join("");
};
async function mustBeMember(groupId: string, userId: number) {
  const { data } = await db.from("members").select("user_id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!data) fail(403, "Ты не состоишь в этой группе");
}
async function botMessage(groupId: string, text: string, openFeed = false) {
  await db.from("messages").insert({ group_id: groupId, user_id: null, text, open_feed: openFeed });
}
// личное сообщение от бота; молча пропускаем, если человек ещё не запускал бота
async function notify(userId: number, text: string) {
  await tgApi("sendMessage", { chat_id: userId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "Открыть Скинемся", url: `https://t.me/${BOT_USERNAME}/app` }]] } });
}
const money = (n: number) => fmtMoney(Math.round(n), "RUB");

async function joinByCode(code: string, userId: number) {
  const { data: g } = await db.from("groups").select("id,name").eq("invite_code", code).maybeSingle();
  if (!g) return null;
  const { data: already } = await db.from("members").select("user_id").eq("group_id", g.id).eq("user_id", userId).maybeSingle();
  if (!already) {
    await db.from("members").insert({ group_id: g.id, user_id: userId });
    const { data: p } = await db.from("profiles").select("first_name").eq("id", userId).single();
    await botMessage(g.id, `${p?.first_name ?? "Новый участник"} присоединился к группе`);
  }
  return g.id as string;
}

async function loadAll(userId: number) {
  const { data: mine } = await db.from("members").select("group_id").eq("user_id", userId);
  const ids = (mine ?? []).map((m) => m.group_id);
  if (!ids.length) return { groups: [] };
  const [groups, members, expenses, messages] = await Promise.all([
    db.from("groups").select("*").in("id", ids).order("created_at", { ascending: false }),
    db.from("members").select("group_id,user_id,joined_at,profiles(id,first_name,last_name,username,photo_url)").in("group_id", ids),
    db.from("expenses").select("*").in("group_id", ids).order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
    db.from("messages").select("*").in("group_id", ids).order("created_at", { ascending: true }).limit(1000),
  ]);
  return {
    groups: (groups.data ?? []).map((g) => ({
      ...g,
      members: (members.data ?? []).filter((m) => m.group_id === g.id).map((m) => m.profiles),
      expenses: (expenses.data ?? []).filter((e) => e.group_id === g.id),
      messages: (messages.data ?? []).filter((m) => m.group_id === g.id).slice(-300),
    })),
  };
}

const GROUP_FIELDS = ["name", "emoji", "photo", "start_date", "end_date", "currency"] as const;
const EXPENSE_FIELDS = ["title", "category", "amount", "currency", "rate", "payer", "split", "source", "spent_on"] as const;
const pick = <T extends string>(o: Record<string, unknown>, keys: readonly T[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// ---------- обработчик ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  // настройка бота: вебхук, кнопка меню, команды
  if (req.method === "GET" && url.searchParams.has("setup")) {
    const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/api`;
    return json(await setupBot(self));
  }
  // вебхук Telegram
  const tgSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (tgSecret !== null) {
    if (!BOT_TOKEN || tgSecret !== await webhookSecret()) return new Response("forbidden", { status: 403 });
    try { await handleUpdate(await req.json()); } catch (e) { console.error("bot update failed", e); }
    return new Response("ok");
  }
  try {
    const { initData, action, ...p } = await req.json();
    const { user, startParam } = await verifyInitData(String(initData ?? ""));
    const me = user.id;
    await db.from("profiles").upsert({
      id: me, first_name: user.first_name, last_name: user.last_name ?? null,
      username: user.username ?? null, photo_url: user.photo_url ?? null, updated_at: new Date().toISOString(),
    });

    switch (action) {
      case "load": {
        let joined: string | null = null;
        if (p.join || startParam) joined = await joinByCode(String(p.join ?? startParam), me);
        return json({ me, joined, ai: aiEnabled(), bot: BOT_USERNAME, ...(await loadAll(me)) });
      }
      case "createGroup": {
        const { data, error } = await db.from("groups")
          .insert({ ...pick(p, GROUP_FIELDS), invite_code: inviteCode(), created_by: me }).select("id").single();
        if (error) fail(400, error.message);
        await db.from("members").insert({ group_id: data!.id, user_id: me });
        await botMessage(data!.id, "Группа создана. Пиши траты как «+1200 такси», я запишу их в общие расходы.");
        return json({ id: data!.id });
      }
      case "updateGroup": {
        await mustBeMember(p.id, me);
        const { error } = await db.from("groups").update(pick(p, GROUP_FIELDS)).eq("id", p.id);
        if (error) fail(400, error.message);
        return json({ ok: true });
      }
      case "leaveGroup": {
        await db.from("members").delete().eq("group_id", p.id).eq("user_id", me);
        return json({ ok: true });
      }
      case "addExpense": {
        await mustBeMember(p.group_id, me);
        const row = { ...pick(p, EXPENSE_FIELDS), group_id: p.group_id, kind: "expense", created_by: me };
        const { data, error } = await db.from("expenses").insert(row).select("id").single();
        if (error) fail(400, error.message);
        if (p.botText) await botMessage(p.group_id, String(p.botText).slice(0, 2000), true);
        // сообщаем в привязанный чат Telegram (из чата приложения туда же пишет сам бот)
        const amt = Number(p.amount), rateV = Number(p.rate);
        await postToLinkedChat(p.group_id, `🧾 <b>${esc(user.first_name)}</b> добавил(а) «${esc(String(p.title ?? ""))}»: ${fmtMoney(amt, String(p.currency))}${p.currency !== "RUB" ? ` ≈ ${money(amt * rateV)}` : ""}`);
        return json({ id: data!.id });
      }
      case "updateExpense": {
        const { data: e } = await db.from("expenses").select("group_id,kind").eq("id", p.id).single();
        if (!e) fail(404, "Трата не найдена");
        await mustBeMember(e!.group_id, me);
        if (e!.kind !== "expense") fail(400, "Переводы не редактируются");
        const { error } = await db.from("expenses").update(pick(p, EXPENSE_FIELDS)).eq("id", p.id);
        if (error) fail(400, error.message);
        return json({ ok: true });
      }
      case "deleteExpense": {
        const { data: e } = await db.from("expenses").select("group_id,kind,from_user,to_user,pending").eq("id", p.id).single();
        if (!e) fail(404, "Запись не найдена");
        await mustBeMember(e!.group_id, me);
        // подтверждённый перевод может удалить только получатель
        if (e!.kind === "transfer" && !e!.pending && e!.to_user !== me) fail(403, "Удалить подтверждённый перевод может только получатель");
        await db.from("expenses").delete().eq("id", p.id);
        return json({ ok: true });
      }
      case "markPaid": {
        await mustBeMember(p.group_id, me);
        if (Number(p.from_user) !== me) fail(403, "Отметить перевод может только тот, кто платил");
        const { data, error } = await db.from("expenses").insert({
          group_id: p.group_id, kind: "transfer", amount: p.amount, currency: "RUB", rate: 1,
          from_user: me, to_user: p.to_user, pending: true, created_by: me, source: "app",
        }).select("id").single();
        if (error) fail(400, error.message);
        const [{ data: to }, { data: g }] = await Promise.all([
          db.from("profiles").select("first_name").eq("id", p.to_user).single(),
          db.from("groups").select("name").eq("id", p.group_id).single(),
        ]);
        await botMessage(p.group_id, `${user.first_name} отметил перевод ${to?.first_name ?? ""} на ${money(p.amount)}. ${to?.first_name ?? "Получатель"}, подтверди получение, и долг закроется.`, true);
        await notify(Number(p.to_user), `💸 <b>${esc(user.first_name)}</b> отметил, что перевёл тебе <b>${money(p.amount)}</b> в группе «${esc(g?.name ?? "")}». Подтверди, если деньги пришли.`);
        return json({ id: data!.id });
      }
      case "confirmTransfer": {
        const { data: e } = await db.from("expenses").select("*").eq("id", p.id).single();
        if (!e || e.kind !== "transfer") fail(404, "Перевод не найден");
        if (e!.to_user !== me) fail(403, "Подтвердить может только получатель");
        await db.from("expenses").update({ pending: false }).eq("id", p.id);
        const { data: from } = await db.from("profiles").select("first_name").eq("id", e!.from_user).single();
        await botMessage(e!.group_id, `${user.first_name} подтвердил перевод от ${from?.first_name ?? ""} на ${money(Number(e!.amount))}. Долг закрыт.`);
        await notify(e!.from_user, `✅ <b>${esc(user.first_name)}</b> подтвердил твой перевод на <b>${money(Number(e!.amount))}</b>.`);
        return json({ ok: true });
      }
      case "rejectTransfer": {
        const { data: e } = await db.from("expenses").select("*").eq("id", p.id).single();
        if (!e || e.kind !== "transfer" || !e.pending) fail(404, "Перевод не найден");
        if (e!.to_user !== me && e!.from_user !== me) fail(403, "Это не твой перевод");
        await db.from("expenses").delete().eq("id", p.id);
        if (e!.to_user === me) {
          await botMessage(e!.group_id, `${user.first_name} пишет, что перевод на ${money(Number(e!.amount))} не пришёл. Отметка снята.`);
          await notify(e!.from_user, `⚠️ <b>${esc(user.first_name)}</b> пишет, что твой перевод на <b>${money(Number(e!.amount))}</b> не пришёл. Проверь, пожалуйста.`);
        }
        return json({ ok: true });
      }
      case "scanReceipt": {
        return json(await scanReceipt(me, String(p.image ?? ""), String(p.mediaType ?? "image/jpeg")));
      }
      case "unlinkChat": {
        await mustBeMember(p.id, me);
        const { data: g } = await db.from("groups").select("tg_chat_id,name").eq("id", p.id).single();
        if (g?.tg_chat_id) {
          await tgApi("sendMessage", { chat_id: g.tg_chat_id, text: `Чат отключён от группы «${g.name}». Траты отсюда больше не записываются.` });
          await db.from("groups").update({ tg_chat_id: null, tg_chat_title: null }).eq("id", p.id);
        }
        return json({ ok: true });
      }
      case "feedback": {
        const text = String(p.text ?? "").trim().slice(0, 3000);
        if (text.length < 3) fail(400, "Опиши проблему хотя бы парой слов");
        const ctx = (p.context ?? {}) as Record<string, string>;
        const { data: fb } = await db.from("feedback").insert({ user_id: me, group_id: p.group_id ?? null, text, context: ctx }).select("id").single();
        const who = `${esc(user.first_name)}${user.last_name ? " " + esc(user.last_name) : ""}${user.username ? ` (@${esc(user.username)})` : ""} · <code>${me}</code>`;
        const head = `🆘 <b>Обращение #${fb?.id ?? ""}</b>\nОт: <a href="tg://user?id=${me}">${who}</a>\n` +
          (ctx.group ? `Группа: ${esc(ctx.group)}\n` : "") + (ctx.platform ? `Устройство: ${esc(ctx.platform)}\n` : "") +
          `\n${esc(text)}\n\n<i>Ответь на это сообщение — ответ уйдёт автору.</i>`;
        let sent;
        if (p.screenshot) {
          const bin = Uint8Array.from(atob(String(p.screenshot)), (ch) => ch.charCodeAt(0));
          const form = new FormData();
          form.append("chat_id", String(ADMIN_ID)); form.append("caption", head.slice(0, 1024)); form.append("parse_mode", "HTML");
          form.append("photo", new Blob([bin], { type: "image/jpeg" }), "screenshot.jpg");
          sent = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: "POST", body: form }).then((r) => r.json()).catch(() => ({ ok: false }));
          if (head.length > 1024) await tgApi("sendMessage", { chat_id: ADMIN_ID, text: head, parse_mode: "HTML" });
        } else {
          sent = await tgApi("sendMessage", { chat_id: ADMIN_ID, text: head, parse_mode: "HTML" });
        }
        const msgId = (sent as { result?: { message_id: number } })?.result?.message_id;
        if (fb && msgId) await db.from("feedback").update({ admin_msg_id: msgId }).eq("id", fb.id);
        return json({ ok: true });
      }
      case "sendMessage": {
        await mustBeMember(p.group_id, me);
        const text = String(p.text ?? "").trim().slice(0, 2000);
        if (!text) fail(400, "Пустое сообщение");
        await db.from("messages").insert({ group_id: p.group_id, user_id: me, text });
        if (p.botText) await botMessage(p.group_id, String(p.botText).slice(0, 2000), Boolean(p.openFeed));
        if (!/^[+/]/.test(text)) await postToLinkedChat(p.group_id, `💬 <b>${esc(user.first_name)}</b> (из приложения): ${esc(text)}`);
        return json({ ok: true });
      }
      default:
        fail(400, "Неизвестное действие");
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
  return json({ error: "unreachable" }, 500);
});
