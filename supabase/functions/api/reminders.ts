// Напоминания о долгах после поездки. Запускается раз в день по расписанию (pg_cron → pg_net).
// Поездка считается законченной на следующий день после даты окончания,
// а если дата не указана — когда в группе 3 дня нет новых трат.
// Каждому должнику пишем не чаще раза в 2 дня и не больше 5 раз на группу.
import { db, esc, groupLink, groupPlan, rub, tgApi } from "./shared.ts";

const DAY = 864e5;
const EVERY_DAYS = 2, MAX_TIMES = 5, IDLE_DAYS = 3;

export async function runReminders() {
  const now = Date.now();
  const { data: groups } = await db.from("groups").select("id,name,invite_code,end_date,reminders").eq("reminders", true);
  const report: { group: string; sent: number }[] = [];

  for (const g of groups ?? []) {
    const { data: last } = await db.from("expenses").select("created_at").eq("group_id", g.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!last) continue;
    const ended = g.end_date
      ? now - new Date(g.end_date + "T23:59:59Z").getTime() > 0
      : now - new Date(last.created_at).getTime() > IDLE_DAYS * DAY;
    if (!ended) continue;

    const { plan, names } = await groupPlan(g.id);
    if (!plan.length) continue;
    // переводы, которые уже отмечены и ждут подтверждения, не напоминаем
    const { data: pend } = await db.from("expenses").select("from_user,to_user").eq("group_id", g.id).eq("kind", "transfer").eq("pending", true);
    const pending = new Set((pend ?? []).map((p) => `${p.from_user}-${p.to_user}`));

    const byDebtor = new Map<number, { to: number; rub: number }[]>();
    for (const t of plan) {
      if (pending.has(`${t.from}-${t.to}`)) continue;
      byDebtor.set(t.from, [...(byDebtor.get(t.from) ?? []), { to: t.to, rub: t.rub }]);
    }

    let sent = 0;
    for (const [debtor, debts] of byDebtor) {
      const { data: log } = await db.from("reminder_log").select("sent_at").eq("group_id", g.id).eq("user_id", debtor)
        .order("sent_at", { ascending: false });
      if ((log?.length ?? 0) >= MAX_TIMES) continue;
      if (log?.length && now - new Date(log[0].sent_at).getTime() < EVERY_DAYS * DAY - 3600e3) continue;

      const lines = debts.map((d) => `• ${esc(names[d.to] ?? "участнику")} — <b>${rub(d.rub)}</b>`).join("\n");
      const text = `⏰ Поездка «${esc(g.name)}» закончилась, пора рассчитаться.\n\nТвои переводы:\n${lines}\n\n` +
        `Когда переведёшь, нажми «Оплачено» во вкладке «Расчёт» — долг закроется после подтверждения получателя.`;
      const r = await tgApi("sendMessage", {
        chat_id: debtor, text, parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "Открыть расчёт", url: groupLink(g.invite_code) }]] },
      });
      if (r.ok) { await db.from("reminder_log").insert({ group_id: g.id, user_id: debtor }); sent++; }
    }
    if (sent) report.push({ group: g.name, sent });
  }
  return { ok: true, report };
}
