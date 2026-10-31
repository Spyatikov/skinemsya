// Статистика для владельца приложения. Сервер отдаёт её только аккаунту администратора.
import { useEffect, useState } from "react";
import { call } from "./api";
import { nf } from "./money";
import { compact } from "./rates";
import { SheetHead } from "./ui";

type Day = { day: string; active: number; new_users: number; expenses: number; groups: number };
type Stats = {
  today: string;
  users: { total: number; new_today: number; new_7d: number; new_30d: number; dau: number; wau: number; mau: number; returning: number; platforms?: Record<string, number>; new_7d_vk?: number };
  groups: { total: number; new_7d: number; with_friends: number; with_expenses: number; chat_linked: number; avg_size: number | null };
  expenses: { total: number; new_7d: number; sum_rub: number; by_source: Record<string, number>; currencies: { code: string; n: number }[]; transfers_confirmed: number; transfers_pending: number };
  features: { ai_scans: number; ai_scans_7d: number; chat_messages: number; reminders_sent: number; feedback: number };
  funnel: { opened: number; in_group: number; with_friends: number; added_expense: number; settled: number };
  series: Day[];
  top_groups: { name: string; emoji: string; members: number; expenses: number; sum_rub: number; last_at: string | null }[];
  feedback: { text: string; created_at: string; first_name: string | null; username: string | null }[];
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const short = (iso: string) => { const d = new Date(iso); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`; };

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="st-tile"><span>{label}</span><b className="num">{typeof value === "number" ? nf(value) : value}</b>{sub && <small>{sub}</small>}</div>;
}

function Bars({ data, k, color, label, avg }: { data: Day[]; k: keyof Day; color: string; label: string; avg?: boolean }) {
  const vals = data.map((d) => Number(d[k]));
  const max = Math.max(1, ...vals), sum = vals.reduce((a, b) => a + b, 0);
  const W = 300, H = 90, bw = W / vals.length;
  return (
    <div className="st-chart">
      <div className="st-ch-head"><span>{label}</span><b className="num">{avg ? `≈ ${nf(sum / vals.length, 1)} в день` : `${nf(sum)} за 30 дней`}</b></div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={label}>
        {vals.map((v, i) => {
          const h = v ? Math.max(3, (v / max) * H) : 0;
          return <g key={i}><rect x={i * bw + 1} y={H - h} width={bw - 2} height={h} rx={2} fill={color} opacity={i === vals.length - 1 ? 1 : 0.75}>
            <title>{`${short(data[i].day)}: ${v}`}</title></rect></g>;
        })}
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke="var(--line)" />
        <text x="0" y={H + 12} fontSize="9" fill="var(--muted)">{short(data[0].day)}</text>
        <text x={W} y={H + 12} fontSize="9" fill="var(--muted)" textAnchor="end">сегодня · макс {max}</text>
      </svg>
    </div>
  );
}

export function StatsSheet({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const load = () => { setErr(""); call<Stats>("adminStats").then(setS).catch((e) => setErr((e as Error).message)); };
  useEffect(load, []);

  if (err) return <><SheetHead title="Статистика" onClose={onClose} /><p className="err">{err}</p><button className="btn ghost wide" onClick={load}>Повторить</button></>;
  if (!s) return <><SheetHead title="Статистика" onClose={onClose} /><div className="center" style={{ minHeight: 200 }}><div className="spinner" /></div></>;

  const { users: u, groups: g, expenses: e, features: f, funnel: fu } = s;
  const steps: [string, number][] = [["Открыли приложение", fu.opened], ["Состоят в группе", fu.in_group], ["В группе с друзьями", fu.with_friends], ["Добавили трату", fu.added_expense], ["Рассчитались переводом", fu.settled]];
  const src = e.by_source || {}, srcTotal = Math.max(1, e.total);
  return (
    <>
      <SheetHead title="Статистика" onClose={onClose} extra={<button className="x" aria-label="Обновить" onClick={() => { setS(null); load(); }}>↻</button>} />
      <p className="note" style={{ margin: 0, textAlign: "left" }}>Видишь только ты. Данные на {short(s.today)}, активность по московскому времени.</p>

      <div className="st-grid">
        <Tile label="Пользователи" value={u.total} sub={`+${u.new_7d} за неделю`} />
        <Tile label="Сегодня" value={u.dau} sub={`активны · 7 дн ${u.wau} · 30 дн ${u.mau}`} />
        <Tile label="Вернулись" value={`${pct(u.returning, u.total)}%`} sub={`${u.returning} заходили 2+ дня`} />
        <Tile label="Группы" value={g.total} sub={`+${g.new_7d} за неделю`} />
        <Tile label="Траты" value={e.total} sub={`+${e.new_7d} за неделю`} />
        <Tile label="Оборот" value={compact(e.sum_rub, "RUB")} sub="сумма всех трат" />
      </div>

      {u.platforms && <div className="field"><span className="flabel">Откуда пользователи</span><div className="box">
        <div className="pp"><span>Telegram</span><b className="num">{nf(u.platforms.telegram || 0)} · {pct(u.platforms.telegram || 0, u.total)}%</b></div>
        <div className="pp"><span>ВКонтакте</span><b className="num">{nf(u.platforms.vk || 0)} · {pct(u.platforms.vk || 0, u.total)}%{u.new_7d_vk ? <small> · +{u.new_7d_vk} за неделю</small> : null}</b></div>
      </div></div>}

      <Bars data={s.series} k="active" color="#5fb3ff" label="Активные пользователи по дням" avg />
      <Bars data={s.series} k="new_users" color="#7fc77f" label="Новые пользователи" />
      <Bars data={s.series} k="expenses" color="#f5a05c" label="Добавлено трат" />

      <div className="field"><span className="flabel">Воронка</span><div className="box">
        {steps.map(([name, v], i) => (
          <div className="st-fun" key={name}>
            <div className="st-fun-top"><span>{name}</span><b className="num">{nf(v)}{i > 0 && <small> · {pct(v, steps[i - 1][1])}%</small>}</b></div>
            <div className="st-bar"><i style={{ width: `${pct(v, fu.opened)}%` }} /></div>
          </div>))}
      </div></div>

      <div className="field"><span className="flabel">Функции</span><div className="box">
        <div className="pp"><span>Траты из приложения</span><b className="num">{nf(src.app || 0)} · {pct(src.app || 0, srcTotal)}%</b></div>
        <div className="pp"><span>Траты из чата</span><b className="num">{nf(src.chat || 0)} · {pct(src.chat || 0, srcTotal)}%</b></div>
        <div className="pp"><span>Траты по чеку</span><b className="num">{nf(src.scan || 0)} · {pct(src.scan || 0, srcTotal)}%</b></div>
        <div className="pp"><span>ИИ-сканов всего / за неделю</span><b className="num">{nf(f.ai_scans)} / {nf(f.ai_scans_7d)}</b></div>
        <div className="pp"><span>Группы с друзьями / с тратами</span><b className="num">{nf(g.with_friends)} / {nf(g.with_expenses)}</b></div>
        <div className="pp"><span>Подключили чат Telegram</span><b className="num">{nf(g.chat_linked)}</b></div>
        <div className="pp"><span>Средний размер группы</span><b className="num">{g.avg_size ?? "—"}</b></div>
        <div className="pp"><span>Переводы подтверждены / ждут</span><b className="num">{nf(e.transfers_confirmed)} / {nf(e.transfers_pending)}</b></div>
        <div className="pp"><span>Сообщений в чатах групп</span><b className="num">{nf(f.chat_messages)}</b></div>
        <div className="pp"><span>Напоминаний о долгах отправлено</span><b className="num">{nf(f.reminders_sent)}</b></div>
      </div></div>

      {e.currencies.length > 0 && <div className="field"><span className="flabel">Валюты трат</span>
        <div className="chips">{e.currencies.map((c) => <span key={c.code} className="chip" aria-pressed="false">{c.code} · {c.n}</span>)}</div>
      </div>}

      {s.top_groups.length > 0 && <div className="field"><span className="flabel">Самые активные группы</span><div className="box">
        {s.top_groups.map((t, i) => <div className="pp" key={i}><span style={{ fontSize: 20, flex: "none" }}>{t.emoji}</span>
          <span>{t.name}<br /><small style={{ color: "var(--muted)" }}>{t.members} чел. · {t.expenses} трат{t.last_at ? ` · последняя ${short(t.last_at)}` : ""}</small></span>
          <b className="num">{nf(t.sum_rub)} ₽</b></div>)}
      </div></div>}

      <div className="field"><span className="flabel">Обращения в помощь · {f.feedback}</span>
        {s.feedback.length ? <div className="box">{s.feedback.map((x, i) => (
          <div className="pp" key={i}><span>{x.text}<br /><small style={{ color: "var(--muted)" }}>{x.first_name ?? "?"}{x.username ? ` @${x.username}` : ""} · {short(x.created_at)}</small></span></div>))}
        </div> : <p className="note" style={{ margin: 0, textAlign: "left" }}>Пока пусто.</p>}
      </div>
      <p className="note">Сводку можно получить и в боте командой /stats.</p>
    </>
  );
}
