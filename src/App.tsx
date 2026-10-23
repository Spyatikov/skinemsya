import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { call, type LoadResult } from "./api";
import { API_URL } from "./config";
import { type Expense, type Group, myStats, nets, onN, pairCount, parseAmount, plan, plural, rubOf, shares, type Transfer } from "./money";
import { CATALOG, compact, inBase, inBaseShort, loadRates, money, rateOf, ratesDate, sym } from "./rates";
import { AddSheet, type Ctx, DetailSheet, GroupSheet, HelpSheet, InviteSheet, ScanSheet, type Sheet, defaultCurs } from "./sheets";
import { haptic, inTelegram, initTelegram, tg } from "./telegram";
import { Avatar, Fly, GroupImg, Ico, catName, dayName, guessCat, relDay, richText, todayISO, tripDates } from "./ui";

type Tab = "groups" | "feed" | "balances" | "chat";
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* нет хранилища */ } },
};
const BASES = ["RUB", "USD", "EUR", "INR"];

export default function App() {
  const [data, setData] = useState<LoadResult | null>(null);
  const [fatal, setFatal] = useState("");
  const [activeId, setActiveId] = useState<string | null>(ls.get("skinemsya-active"));
  const [tab, setTab] = useState<Tab>("feed");
  const [base, setBase] = useState(ls.get("skinemsya-base") || "RUB");
  const [curs, setCurs] = useState<string[]>(defaultCurs);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toastText, setToastText] = useState("");
  const [, setRatesTick] = useState(0);
  const toastTimer = useRef<number>();

  const toast = useCallback((t: string) => {
    setToastText(t); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(""), 2400);
  }, []);

  const reload = useCallback(async (join?: string) => {
    try {
      const r = await call<LoadResult>("load", join ? { join } : {});
      setData(r); setFatal("");
      if (r.joined) { setActiveId(r.joined); setTab("feed"); }
      return r;
    } catch (e) {
      setFatal((prev) => prev || (e as Error).message);
      return null;
    }
  }, []);

  // первый запуск
  useEffect(() => {
    initTelegram();
    loadRates().then(() => setRatesTick((x) => x + 1));
    if (!inTelegram || !API_URL) return;
    const join = new URLSearchParams(location.search).get("join") || undefined;
    reload(join);
  }, [reload]);

  // обновляем данные, пока приложение открыто: изменения друзей появятся сами
  useEffect(() => {
    if (!data) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") reload(); }, 10000);
    const onVis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [data, reload]);

  useEffect(() => { if (activeId) ls.set("skinemsya-active", activeId); }, [activeId]);
  useEffect(() => { ls.set("skinemsya-base", base); }, [base]);
  useEffect(() => { document.body.style.overflow = sheet ? "hidden" : ""; }, [sheet]);

  const groups = data?.groups ?? [];
  const g: Group | undefined = groups.find((x) => x.id === activeId) ?? groups[0];
  const me = data?.me ?? 0;

  const run = useCallback(async (action: string, payload: Record<string, unknown>, ok?: string) => {
    try {
      const res = await call<{ id?: string }>(action, payload);
      if (ok) toast(ok);
      haptic("success");
      await reload();
      if (action === "createGroup" && res.id) { setActiveId(res.id); setTab("feed"); setSheet({ kind: "invite" }); return true; }
      return true;
    } catch (e) {
      haptic("error"); toast((e as Error).message);
      return false;
    }
  }, [reload, toast]);

  const addCur = (code: string) => { const next = curs.includes(code) ? curs : [...curs, code]; setCurs(next); ls.set("skinemsya-curs", JSON.stringify(next)); };
  const close = () => setSheet(null);
  const ai = Boolean(data?.ai);
  const ctx: Ctx | null = g ? { g, me, base, curs, ai, addCur, run, close, open: setSheet, toast } : null;

  // ---------- экраны-заглушки ----------
  if (!inTelegram) return (
    <main><div className="wrap"><div className="center">
      <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Скинемся" />
      <h2>Скинемся</h2>
      <p>Это приложение для Telegram: общие траты в поездках с друзьями. Открой его через бота в Telegram, чтобы войти под своим аккаунтом.</p>
    </div></div></main>
  );
  if (!API_URL) return <Center title="Сервер ещё не подключён" text="В сборке не задан адрес серверной функции. Добавь VITE_API_URL в настройки сборки." />;
  if (!data) return fatal
    ? <Center title="Не получилось загрузить" text={fatal} action={<button className="btn" onClick={() => { setFatal(""); reload(); }}>Попробовать снова</button>} />
    : <main><div className="wrap"><div className="center"><div className="spinner" /><p>Загружаю группы…</p></div></div></main>;

  const groupSheetCtx = ctx ?? { me, base, curs, ai, addCur, run, close, open: setSheet, toast };

  return (
    <>
      {!g ? (
        <main><div className="wrap"><div className="center">
          <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Скинемся" />
          <h2>Привет, {tg?.initDataUnsafe.user?.first_name ?? "путешественник"}!</h2>
          <p>Создай группу для поездки и позови друзей по ссылке. Траты, валюты и долги посчитаются сами.</p>
          <button className="btn" onClick={() => setSheet({ kind: "group", create: true })}>Создать группу</button>
          <p style={{ fontSize: 13 }}>Если друг уже создал группу, попроси у него ссылку-приглашение и открой её.</p>
          <button className="linkbtn" onClick={() => setSheet({ kind: "help" })}>Помощь</button>
        </div></div></main>
      ) : (
        <>
          {tab !== "groups" && <Header g={g} base={base} onEdit={() => setSheet({ kind: "group" })} onBase={() => {
            const opts = [...BASES, ...(BASES.includes(g.currency) ? [] : [g.currency])];
            const next = opts[(opts.indexOf(base) + 1) % opts.length];
            setBase(next); toast("Итоги в " + next);
          }} />}
          <main><div className="wrap" id="view">
            {tab === "feed" && <Feed c={ctx!} onTab={setTab} />}
            {tab === "balances" && <Balances c={ctx!} onTab={setTab} />}
            {tab === "groups" && <Groups groups={groups} active={g.id} me={me} base={base} onPick={(id) => { setActiveId(id); setTab("feed"); window.scrollTo(0, 0); }} onCreate={() => setSheet({ kind: "group", create: true })} onHelp={() => setSheet({ kind: "help" })} />}
            {tab === "chat" && <Chat c={ctx!} onTab={setTab} />}
          </div></main>
          <nav className="tabs" aria-label="Разделы"><div className="wrap">
            <button className="tab" aria-current={tab === "groups" ? "page" : "false"} onClick={() => setTab("groups")}><svg viewBox="0 0 24 24"><circle className="fillme" cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.8 3-6 6.5-6s6 2.2 6.5 6M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5c2 .8 3.2 2.8 3.5 5.5" /></svg>Группы</button>
            <button className="tab" aria-current={tab === "feed" || tab === "balances" ? "page" : "false"} onClick={() => { setTab("feed"); window.scrollTo(0, 0); }}><svg viewBox="0 0 24 24"><rect className="fillme" x="4" y="3" width="16" height="18" rx="3" /><path className="lines" d="M8 8h8M8 12h8M8 16h5" /></svg>Расходы</button>
            <button className="tab" aria-current={tab === "chat" ? "page" : "false"} onClick={() => { setTab("chat"); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50); }}><svg viewBox="0 0 24 24"><path className="fillme" d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z" /></svg>Чат</button>
            <button className="plusbtn" aria-label="Добавить расход" onClick={() => setSheet({ kind: "add" })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 4v16M4 12h16" /></svg></button>
          </div></nav>
        </>
      )}

      {sheet && (
        <div className="sheetwrap"><div className="backdrop" onClick={close} />
          <section className="sheet" role="dialog" aria-modal="true">
            <div className="grab" />
            {sheet.kind === "group" ? <GroupSheet key={sheet.create ? "new" : g?.id} c={groupSheetCtx as Ctx} create={sheet.create || !g} />
              : ctx && sheet.kind === "add" ? <AddSheet key={sheet.edit?.id ?? "new"} c={ctx} edit={sheet.edit} />
              : ctx && sheet.kind === "scan" ? <ScanSheet key={sheet.edit?.id ?? "new"} c={ctx} edit={sheet.edit} />
              : ctx && sheet.kind === "detail" ? <DetailSheet key={sheet.id} c={ctx} id={sheet.id} />
              : ctx && sheet.kind === "invite" ? <InviteSheet c={ctx} />
              : sheet.kind === "help" ? <HelpSheet c={groupSheetCtx} />
              : null}
          </section>
        </div>
      )}
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </>
  );
}

function Center({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <main><div className="wrap"><div className="center"><h2>{title}</h2><p>{text}</p>{action}</div></div></main>;
}

// ---------- шапка ----------
function Header({ g, base, onEdit, onBase }: { g: Group; base: string; onEdit: () => void; onBase: () => void }) {
  return (
    <header className="top"><div className="wrap">
      <button className="gav" onClick={onEdit} aria-label="Настройки группы"><GroupImg g={g} /></button>
      <button className="trip" onClick={onEdit}><h1>{g.name}</h1><p>{tripDates(g)}</p></button>
      <button className="cur edit" onClick={onEdit} aria-label="Редактировать группу"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
      <button className="cur" onClick={onBase} aria-label="Валюта итогов">{sym(base)}<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5l4 4 4-4" /></svg></button>
    </div></header>
  );
}

// ---------- лента ----------
const nameOf = (c: Ctx, id: number | null) => (id === c.me ? "Ты" : c.g.members.find((m) => m.id === id)?.first_name ?? "Кто-то");
const paidBy = (c: Ctx, id: number | null) => (id === c.me ? "платил ты" : "платил(а) " + nameOf(c, id));

function Feed({ c, onTab }: { c: Ctx; onTab: (t: Tab) => void }) {
  const { g } = c;
  const st = myStats(g, c.me);
  const days = useMemo(() => {
    const d: Record<string, Expense[]> = {};
    for (const e of g.expenses) (d[e.spent_on] ??= []).push(e);
    return Object.entries(d).sort((a, b) => b[0].localeCompare(a[0]));
  }, [g.expenses]);
  const label = st.net > 1 ? ["pos", "Тебе вернут", "+"] : st.net < -1 ? ["neg", "С тебя", "−"] : ["", "Ты в расчёте", ""];
  return (
    <>
      <section className="hero" aria-label="Твой баланс"><div className="hero-top">
        <p className="lbl">{label[1]}</p>
        <p className={`big num ${label[0]}`}>{label[2]}{inBaseShort(Math.abs(st.net) > 1 ? Math.abs(st.net) : 0, c.base)}</p>
      </div>
        <dl className="facts num">
          <div><dt>Все расходы</dt><dd>{inBaseShort(st.spent, c.base)}</dd></div>
          <div><dt>Твоя доля</dt><dd>{inBaseShort(st.share, c.base)}</dd></div>
          <div><dt>В группе</dt><dd>{g.members.length} чел.</dd></div>
        </dl>
      </section>
      <div className="acts">
        <button className="act" onClick={() => c.open({ kind: "scan" })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16M7.5 12h9" /></svg>Скан чека</button>
        <button className="act" onClick={() => { onTab("balances"); window.scrollTo(0, 0); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2.5" width="14" height="19" rx="3" /><path d="M8.5 7h7" /><g fill="currentColor" stroke="none"><circle cx="9" cy="12.5" r="1" /><circle cx="12" cy="12.5" r="1" /><circle cx="15" cy="12.5" r="1" /><circle cx="10.5" cy="16.5" r="1" /><circle cx="13.5" cy="16.5" r="1" /></g></svg>Расчёт</button>
        <button className="act" onClick={() => c.open({ kind: "invite" })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9.5" cy="7.5" r="4" /><path d="M2.5 20.5c0-4 3.1-6.5 7-6.5s7 2.5 7 6.5zM19 6v6M16 9h6" /></svg>Позвать</button>
      </div>
      {!g.expenses.length && <div className="empty"><b>Пока ни одной траты</b><p>Добавь первую кнопкой «+» внизу или позови друзей, чтобы они тоже вносили расходы.</p><button className="btn sm" onClick={() => c.open({ kind: "invite" })}>Позвать друзей</button></div>}
      {days.map(([d, list]) => (
        <div key={d} style={{ display: "contents" }}>
          <div className="day"><b>{relDay(d)}</b><span>· {dayName(d)}</span></div>
          <div className="list">{list.map((e) => e.kind === "transfer" ? (
            <button className="row" key={e.id} onClick={() => c.open({ kind: "detail", id: e.id })}><Ico k="transfer" />
              <div className="mid"><div className="t"><b>{nameOf(c, e.from_user)} → {e.to_user === c.me ? "тебе" : nameOf(c, e.to_user)}</b></div>
                <small>{e.pending ? <span className="tag wait">ждёт подтверждения</span> : "Перевод в счёт долга"}</small></div>
              <div className="amt"><b className="num" style={e.pending ? { color: "var(--muted)" } : undefined}>{inBaseShort(rubOf(e), c.base)}</b></div>
            </button>
          ) : (
            <button className="row" key={e.id} onClick={() => c.open({ kind: "detail", id: e.id })}><Ico k={e.category} />
              <div className="mid"><div className="t"><b>{e.title || catName(e.category)}</b>{e.source === "chat" ? <span className="tag">из чата</span> : e.source === "scan" ? <span className="tag">по чеку</span> : null}</div>
                <small>{catName(e.category)} · {paidBy(c, e.payer)} · {onN(Object.keys(shares(e)).length)}</small></div>
              <div className="amt"><b className="num">{compact(Number(e.amount), e.currency)}</b>{e.currency !== c.base && <small className="num">{inBaseShort(rubOf(e), c.base)}</small>}</div>
            </button>
          ))}</div>
        </div>
      ))}
    </>
  );
}

// ---------- расчёт ----------
const whoGen = (c: Ctx, id: number) => (id === c.me ? "тебя" : nameOf(c, id));
function Balances({ c, onTab }: { c: Ctx; onTab: (t: Tab) => void }) {
  const { g } = c;
  const n = nets(g), p = plan(g), pc = pairCount(g);
  const max = Math.max(1, ...Object.values(n).map(Math.abs));
  const pendingOf = (t: Transfer) => g.expenses.find((x) => x.kind === "transfer" && x.pending && x.from_user === t.from && x.to_user === t.to);
  const action = (t: Transfer) => {
    const pe = pendingOf(t);
    if (!pe) return t.from === c.me
      ? <button className="btn sm" onClick={() => c.run("markPaid", { group_id: g.id, from_user: t.from, to_user: t.to, amount: t.rub }, `Ждём подтверждения ${whoGen(c, t.to)}`)}>Оплачено</button>
      : null;
    if (t.to === c.me) return <div className="txbtns">
      <button className="btn sm" onClick={() => c.run("confirmTransfer", { id: pe.id }, "Перевод подтверждён")}>Получил</button>
      <button className="btn sm ghost" onClick={() => c.run("rejectTransfer", { id: pe.id }, "Отметка снята")}>Не пришло</button>
    </div>;
    return <div className="waitbox"><span>Ждём подтверждения {whoGen(c, t.to)}</span></div>;
  };
  return (
    <>
      <button className="back" onClick={() => onTab("feed")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>Расходы</button>
      <section className="sec"><h2>Кто в плюсе, кто в минусе</h2><div className="box">
        {g.members.map((m) => {
          const v = n[m.id] || 0, w = (Math.abs(v) / max) * 50;
          return <div className="mrow" key={m.id}><Avatar p={m} size="lg" me={c.me} />
            <div><div className="mname">{m.id === c.me ? "Ты" : m.first_name}</div><div className="bar"><i style={{ background: `var(${v >= 0 ? "--plus" : "--minus"})`, ...(v >= 0 ? { left: "50%" } : { right: "50%" }), width: `${w}%` }} /></div></div>
            <b className={`num ${v > 1 ? "pos" : v < -1 ? "neg" : ""}`}>{v > 1 ? "+" : v < -1 ? "−" : ""}{inBaseShort(Math.abs(v), c.base)}</b></div>;
        })}
      </div></section>
      <section className="sec"><h2>Как рассчитаться</h2>
        {!p.length ? <p className="done">Все в расчёте. Можно ехать дальше.</p> : <>
          <p className="lead">Хватит {p.length} {plural(p.length, "перевода", "переводов", "переводов")} вместо {Math.max(pc, p.length)}: долги по кругу уже взаимно погашены.</p>
          <div className="box">{p.map((t, i) => (
            <div className="tx" key={i}>
              <Avatar p={g.members.find((m) => m.id === t.from)} size="md" me={c.me} /><Fly /><Avatar p={g.members.find((m) => m.id === t.to)} size="md" me={c.me} />
              <div className="who">{t.from === c.me ? "Ты" : nameOf(c, t.from)} → {t.to === c.me ? "тебе" : nameOf(c, t.to)}<br /><b className="num">{inBase(t.rub, c.base)}</b></div>
              {action(t)}
            </div>))}
          </div>
          <p className="note">«Оплачено» отмечает тот, кто переводит. Долг закроется, когда получатель подтвердит.</p>
        </>}
      </section>
      <p className="note">Суммы в {sym(c.base)} по курсу на день каждой траты{ratesDate() ? `, текущий курс от ${dayName(ratesDate()!)}` : ""}.</p>
    </>
  );
}

// ---------- группы ----------
function Groups({ groups, active, me, base, onPick, onCreate, onHelp }: { groups: Group[]; active: string; me: number; base: string; onPick: (id: string) => void; onCreate: () => void; onHelp: () => void }) {
  return (
    <>
      <div className="ghead"><h2>Группы</h2></div>
      <div className="list">{groups.map((g) => {
        const v = nets(g)[me] || 0, n = g.members.length;
        return (
          <button className={`grow ${g.id === active ? "on" : ""}`} key={g.id} onClick={() => onPick(g.id)}>
            <span className="gav"><GroupImg g={g} /></span>
            <div className="mid"><div className="t"><b>{g.name}</b>{g.id === active && <span className="tag">открыта</span>}</div>
              <small>{[tripDates(g), `${n} ${plural(n, "человек", "человека", "человек")}`].filter(Boolean).join(" · ")}</small></div>
            <div className="amt">{v > 1 ? <><b className="num pos">+{inBaseShort(v, base)}</b><small>тебе вернут</small></> : v < -1 ? <><b className="num neg">−{inBaseShort(-v, base)}</b><small>с тебя</small></> : <b style={{ color: "var(--muted)" }}>в расчёте</b>}</div>
          </button>);
      })}</div>
      <button className="btn wide newgroup" onClick={onCreate}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Создать группу</button>
      <p className="note">Группа — это поездка или любая общая затея: квартира, день рождения, дача.</p>
      <button className="helprow" onClick={onHelp}>
        <span className="ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.7M12 17h.01" /></svg></span>
        <span><b>Помощь</b><small>Ответы на вопросы и связь с разработчиком</small></span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </>
  );
}

// ---------- чат ----------
const CUR_ALIAS: Record<string, string> = {
  руб: "RUB", р: "RUB", "₽": "RUB", рублей: "RUB", рубля: "RUB", $: "USD", долл: "USD", долларов: "USD", "€": "EUR", евро: "EUR",
  рупий: "INR", рупии: "INR", "₹": "INR", rp: "IDR", бат: "THB", батов: "THB", "฿": "THB", лир: "TRY", лари: "GEL", драм: "AMD", тенге: "KZT",
};
for (const cc of CATALOG) CUR_ALIAS[cc.code.toLowerCase()] = cc.code;
const TGC = ["#65aadd", "#a695e7", "#f5a05c", "#4fbfc6", "#ee7aae", "#7fc77f"], TGN = ["#71b7f0", "#b9a6ff", "#ffb070", "#5fd0d8", "#ff8cbd", "#8fd78f"];
const CHECKS = <svg viewBox="0 0 18 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6l3.2 3.2L11 1.5M7.8 9.4l.9.6L16 1.5" /></svg>;
const HELP = "Чтобы записать трату, напиши **+сумма валюта что купили**.\nНапример: +1200 thb такси или +3500 руб ужин @Катя.\nИтог долгов покажет /итог.";
const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function Chat({ c, onTab }: { c: Ctx; onTab: (t: Tab) => void }) {
  const { g } = c;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const count = g.messages.length;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [count]);

  async function send(raw: string) {
    const t = raw.trim(); if (!t || busy) return;
    setBusy(true); setText("");
    let ok = true;
    if (/^\/(итог|summary)/i.test(t)) {
      const p = plan(g);
      const botText = p.length
        ? "**Как рассчитаться**\n" + p.map((x) => `${nameOf(c, x.from)} → ${nameOf(c, x.to)}: ${inBase(x.rub, c.base)}`).join("\n") + `\n${p.length} ${plural(p.length, "перевод", "перевода", "переводов")} вместо ${Math.max(pairCount(g), p.length)}.`
        : "Все в расчёте 🎉";
      ok = await c.run("sendMessage", { group_id: g.id, text: t, botText, openFeed: p.length > 0 });
    } else if (/^\/(помощь|help|start)/i.test(t)) {
      ok = await c.run("sendMessage", { group_id: g.id, text: t, botText: HELP });
    } else {
      const m = t.match(/^\+\s*(\d[\d\s.,]*)\s*(.*)$/);
      if (!m) {
        ok = await c.run("sendMessage", { group_id: g.id, text: t, ...(/^[+/]/.test(t) ? { botText: HELP } : {}) });
      } else {
        const amount = parseAmount(m[1]);
        let words = m[2].split(/\s+/).filter(Boolean), cur = g.currency;
        if (words.length && CUR_ALIAS[words[0].toLowerCase()]) cur = CUR_ALIAS[words.shift()!.toLowerCase()];
        const tagged = words.filter((w) => w.startsWith("@")).map((w) => {
          const q = w.slice(1).toLowerCase();
          return g.members.find((x) => x.first_name.toLowerCase() === q || x.username?.toLowerCase() === q || x.first_name.toLowerCase().startsWith(q));
        }).filter(Boolean).map((x) => x!.id);
        words = words.filter((w) => !w.startsWith("@"));
        const title = words.join(" ") || "Без названия";
        const members = tagged.length ? [...new Set([c.me, ...tagged])] : g.members.map((x) => x.id);
        const rate = rateOf(cur), rub = amount * rate;
        if (!amount) { ok = await c.run("sendMessage", { group_id: g.id, text: t, botText: HELP }); }
        else {
          const botText = `Записал **${title[0].toUpperCase() + title.slice(1)}**: ${money(amount, cur)}${cur !== c.base ? ", это примерно " + inBase(rub, c.base) : ""}.\nПлатил(а) ${tg?.initDataUnsafe.user?.first_name ?? "автор"}, делим ${onN(members.length)} по ${inBase(rub / members.length, c.base)}.`;
          ok = await c.run("sendMessage", { group_id: g.id, text: t })
            && await c.run("addExpense", { group_id: g.id, title: title[0].toUpperCase() + title.slice(1), category: guessCat(title), amount, currency: cur, rate, payer: c.me, split: { type: "equal", members }, source: "chat", spent_on: todayISO(), botText });
        }
      }
    }
    if (!ok) setText(t);
    setBusy(false);
  }

  let lastDay = "";
  return (
    <>
      <div className="msgs">
        {!g.messages.length && <div className="sep" style={{ maxWidth: 300, textAlign: "center", lineHeight: 1.35, padding: "8px 12px" }}>Обсуждайте траты здесь. Сообщение вида «+1200 такси» сразу запишется в расходы.</div>}
        {g.messages.map((msg, i) => {
          const day = localDay(msg.created_at), prev = g.messages[i - 1], next = g.messages[i + 1];
          const sep = day !== lastDay ? <div className="sep">{dayName(day)}</div> : null; lastDay = day;
          const first = !prev || prev.user_id !== msg.user_id || localDay(prev.created_at) !== day;
          const last = !next || next.user_id !== msg.user_id || localDay(next.created_at) !== day;
          const out = msg.user_id === c.me, bot = msg.user_id == null;
          const p = c.g.members.find((m) => m.id === msg.user_id);
          const idx = bot ? 0 : Math.abs(msg.user_id!) % TGC.length;
          const nm = bot ? "Скинемся" : p?.first_name ?? "Участник";
          return (
            <div key={msg.id} style={{ display: "contents" }}>
              {sep}
              <div className={`m ${out ? "out" : "in"} ${last ? "last" : ""} ${first && i ? "gap" : ""}`}>
                {!out && (bot
                  ? <span className={`tav ${last ? "" : "hide"}`} style={{ background: "#4fa3e8" }}>С</span>
                  : p?.photo_url ? <img className={`tav ${last ? "" : "hide"}`} src={p.photo_url} alt="" style={{ objectFit: "cover" }} />
                  : <span className={`tav ${last ? "" : "hide"}`} style={{ background: TGC[idx] }}>{nm[0]}</span>)}
                <div className="col">
                  <div className="bub">{!out && first && <span className="nm" style={{ color: bot ? "#71b7f0" : TGN[idx] }}>{nm}</span>}
                    {bot ? richText(msg.text) : msg.text}<span className="meta">{hm(msg.created_at)}{out && CHECKS}</span></div>
                  {msg.open_feed && <button className="kb" onClick={() => { onTab("feed"); window.scrollTo(0, 0); }}>Открыть расходы</button>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ height: 110 }} />
      <div className="composer"><div className="wrap">
        <div className="hints">
          {["+3500 руб ужин", "+800 руб сим-карты", "/итог", "/помощь"].map((h) => <button key={h} className="hint" onClick={() => setText(h)}>{h}</button>)}
        </div>
        <form className="inrow" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" placeholder="Сообщение или +сумма что купили" aria-label="Сообщение" maxLength={2000} />
          <button className="send" aria-label="Отправить" disabled={busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l18-8-6 16-3-7z" /></svg></button>
        </form>
      </div></div>
    </>
  );
}

