// Шторки: новый/изменение расхода, скан чека, детали траты, настройки группы, приглашение.
import { useMemo, useRef, useState } from "react";
import { BOT_USERNAME, inviteLink } from "./config";
import { type Expense, type Group, type ReceiptItem, type Split, nf, onN, parseAmount, plural, rubOf, shares } from "./money";
import { CATALOG, CUR, DEFAULT_CURS, inBase, money, rateLabel, rateOf, sym } from "./rates";
import { parseReceipt, recognize, recognizeAI } from "./receipt";
import { shareLink, tg } from "./telegram";
import { Avatar, CATS, Fly, GroupImg, Ico, Pen, SheetHead, catName, dayName, guessCat, todayISO } from "./ui";

export type Ctx = {
  g: Group; me: number; base: string; curs: string[]; ai: boolean;
  addCur: (c: string) => void;
  run: (action: string, payload: Record<string, unknown>, ok?: string) => Promise<boolean>;
  close: () => void;
  open: (s: Sheet) => void;
  toast: (t: string) => void;
};
export type Sheet =
  | { kind: "add"; edit?: Expense }
  | { kind: "scan"; edit?: Expense }
  | { kind: "detail"; id: string }
  | { kind: "group"; create?: boolean }
  | { kind: "invite" }
  | { kind: "help" };

const name = (c: Ctx, id: number | null) => (id === c.me ? "Ты" : c.g.members.find((m) => m.id === id)?.first_name ?? "Кто-то");
const prof = (c: Ctx, id: number | null) => c.g.members.find((m) => m.id === id);

// ---------- выбор валюты ----------
function CurPicker({ value, onChange, curs, addCur }: { value: string; onChange: (c: string) => void; curs: string[]; addCur: (c: string) => void }) {
  const [pick, setPick] = useState(false);
  const list = curs.includes(value) ? curs : [value, ...curs];
  if (pick) return (
    <>
      <div className="curlist">
        {CATALOG.filter((c) => !list.includes(c.code)).map((c) => (
          <button key={c.code} className="curitem" onClick={() => { addCur(c.code); onChange(c.code); setPick(false); }}>
            <b>{c.sym}</b><span>{c.name}</span><small>{c.code}</small>
          </button>
        ))}
      </div>
      <button className="linkbtn" onClick={() => setPick(false)}>Отмена</button>
    </>
  );
  return (
    <div className="chips">
      {list.map((c) => <button key={c} className="chip" aria-pressed={value === c} onClick={() => onChange(c)}>{c} {sym(c)}</button>)}
      <button className="chip addcur" onClick={() => setPick(true)}>+ Добавить валюту</button>
    </div>
  );
}

// ---------- новый расход / изменение ----------
export function AddSheet({ c, edit }: { c: Ctx; edit?: Expense }) {
  const { g } = c;
  const ids = g.members.map((m) => m.id);
  const [amount, setAmount] = useState(edit ? String(edit.amount) : "");
  const [cur, setCur] = useState(edit?.currency ?? g.currency);
  const [title, setTitle] = useState(edit?.title ?? "");
  const [cat, setCat] = useState(edit?.category ?? "food");
  const [catTouched, setCatTouched] = useState(Boolean(edit));
  const [payer, setPayer] = useState<number>(edit?.payer ?? c.me);
  const [mode, setMode] = useState<"equal" | "weights">(edit?.split?.type === "weights" ? "weights" : "equal");
  const [members, setMembers] = useState<number[]>(edit?.split?.type === "equal" ? edit.split.members : ids);
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const w = Object.fromEntries(ids.map((id) => [String(id), edit?.split?.type === "weights" ? 0 : 1]));
    return edit?.split?.type === "weights" ? { ...w, ...edit.split.weights } : w;
  });
  const [busy, setBusy] = useState(false);

  const a = parseAmount(amount);
  // при изменении траты курс сохраняем, если валюта не менялась
  const rate = edit && edit.currency === cur ? Number(edit.rate) : rateOf(cur);
  const rub = a * rate;
  const wTotal = Object.values(weights).reduce((x, y) => x + y, 0);
  const ok = a > 0 && (mode === "equal" ? members.length > 0 : wTotal > 0);

  async function save() {
    if (!ok || busy) return;
    setBusy(true);
    const split: Split = mode === "equal" ? { type: "equal", members } : { type: "weights", weights };
    const fields = { title: title.trim() || catName(cat), category: cat, amount: a, currency: cur, rate, payer, split };
    const done = edit
      ? await c.run("updateExpense", { id: edit.id, ...fields }, "Расход изменён")
      : await c.run("addExpense", { group_id: g.id, ...fields, source: "app", spent_on: todayISO() }, "Расход добавлен");
    setBusy(false);
    if (done) edit ? c.open({ kind: "detail", id: edit.id }) : c.close();
  }

  return (
    <>
      <SheetHead title={edit ? "Изменить расход" : "Новый расход"} onClose={c.close} />
      <label className="amountbox" htmlFor="f-amount">
        <input id="f-amount" inputMode="decimal" placeholder="0" value={amount} autoFocus={!edit} onChange={(e) => setAmount(e.target.value)} aria-label="Сумма" />
        <span>{sym(cur)}</span>
      </label>
      <CurPicker value={cur} onChange={setCur} curs={c.curs} addCur={c.addCur} />
      <div className="field">
        <label className="flabel" htmlFor="f-title">Что купили</label>
        <input className="text" id="f-title" placeholder="Например, ужин на пляже" value={title} maxLength={80}
          onChange={(e) => { setTitle(e.target.value); if (!catTouched) { const k = guessCat(e.target.value); if (k !== "other") setCat(k); } }} />
      </div>
      <div className="field"><span className="flabel">Категория</span>
        <div className="chips">{CATS.map(([k, n]) => <button key={k} className="chip" aria-pressed={cat === k} onClick={() => { setCat(k); setCatTouched(true); }}>{n}</button>)}</div>
      </div>
      <div className="field"><span className="flabel">Кто платил</span>
        <div className="chips">{g.members.map((m) => <button key={m.id} className="chip" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)}><Avatar p={m} size="sm" me={c.me} />{name(c, m.id)}</button>)}</div>
      </div>
      <div className="field"><span className="flabel">Как делим</span>
        <div className="seg">
          <button aria-pressed={mode === "equal"} onClick={() => setMode("equal")}>Поровну</button>
          <button aria-pressed={mode === "weights"} onClick={() => setMode("weights")}>Долями</button>
        </div>
        {mode === "equal" ? (
          <div className="chips">{g.members.map((m) => (
            <button key={m.id} className="chip" aria-pressed={members.includes(m.id)}
              onClick={() => setMembers(members.includes(m.id) ? members.filter((x) => x !== m.id) : [...members, m.id])}>
              <Avatar p={m} size="sm" me={c.me} />{name(c, m.id)}
            </button>))}
          </div>
        ) : (
          <div>{g.members.map((m) => (
            <div className="wrow" key={m.id}>
              <Avatar p={m} size="sm" me={c.me} /><span className="mname">{name(c, m.id)}</span>
              <button className="step" aria-label="Меньше" onClick={() => setWeights({ ...weights, [m.id]: Math.max(0, (weights[m.id] ?? 0) - 1) })}>−</button>
              <span className="w num">{weights[m.id] ?? 0}</span>
              <button className="step" aria-label="Больше" onClick={() => setWeights({ ...weights, [m.id]: Math.min(9, (weights[m.id] ?? 0) + 1) })}>+</button>
            </div>))}
          </div>
        )}
      </div>
      <div className="preview">
        {!a ? <span style={{ color: "var(--muted)" }}>Введи сумму, пересчитаю в {sym(c.base)} и разделю.</span>
          : mode === "equal" ? <>
            <b className="num">{cur !== c.base ? inBase(rub, c.base) : money(a, cur)}</b>
            <span className="num">{members.length ? `По ${inBase(rub / members.length, c.base)} ${onN(members.length)}` : "Выбери, на кого делим"}</span>
          </> : <>
            <b className="num">{inBase(rub, c.base)}</b>
            <span className="num">{wTotal ? g.members.filter((m) => weights[m.id]).map((m) => `${name(c, m.id)} ${inBase((rub * weights[m.id]) / wTotal, c.base)}`).join(", ") : "Поставь доли"}</span>
          </>}
        {a > 0 && cur !== c.base && <span className="rate-note">Курс: {rateLabel(cur, rate, c.base)}</span>}
      </div>
      <button className="btn wide" disabled={!ok || busy} onClick={save}>{busy ? "Сохраняю…" : edit ? "Сохранить изменения" : "Добавить расход"}</button>
    </>
  );
}

// ---------- скан чека ----------
export function ScanSheet({ c, edit }: { c: Ctx; edit?: Expense }) {
  const { g } = c;
  const fileRef = useRef<HTMLInputElement>(null);
  const editItems = edit?.split?.type === "items" ? edit.split.items : null;
  const [step, setStep] = useState<"pick" | "ocr" | "items">(editItems ? "items" : "pick");
  const [img, setImg] = useState<string | null>(null);
  const [progress, setProgress] = useState({ p: 0, stage: "" });
  const [err, setErr] = useState("");
  const [place, setPlace] = useState(edit?.title ?? "");
  const [cur, setCur] = useState(edit?.currency ?? g.currency);
  const [items, setItems] = useState<ReceiptItem[]>(editItems ? editItems.map((i) => ({ ...i, who: [...i.who] })) : []);
  const [prices, setPrices] = useState<string[]>(editItems ? editItems.map((i) => String(i.price)) : []);
  const [total, setTotal] = useState(edit ? String(edit.amount) : "");
  const [payer, setPayer] = useState<number>(edit?.payer ?? c.me);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setImg(URL.createObjectURL(f)); setErr(""); setStep("ocr");
    let note = "";
    // сначала ИИ на сервере, если он настроен; при сбое — распознавание на телефоне
    if (c.ai) {
      setProgress({ p: 0.35, stage: "ИИ читает чек" });
      const tick = window.setInterval(() => setProgress((x) => ({ ...x, p: Math.min(0.92, x.p + 0.04) })), 600);
      try {
        const r = await recognizeAI(f);
        window.clearInterval(tick);
        setItems(r.items); setPrices(r.items.map((i) => String(i.price)));
        setPlace(r.place);
        if (r.currency && CUR[r.currency]) { setCur(r.currency); if (!c.curs.includes(r.currency)) c.addCur(r.currency); }
        setTotal(r.total ? String(Math.round(r.total * 100) / 100) : "");
        if (!r.items.length) setErr("ИИ не нашёл позиции на фото. Добавь их вручную или сфотографируй чек ровнее и ближе.");
        else if (r.confidence === "low") setErr("Чек читается плохо: проверь названия и цены.");
        setStep("items");
        return;
      } catch (e) {
        window.clearInterval(tick);
        note = (e as Error).message;
      }
    }
    try {
      const text = await recognize(f, (p, stage) => setProgress({ p, stage }));
      const r = parseReceipt(text);
      const sum = r.items.reduce((s, i) => s + i.price, 0);
      setItems(r.items); setPrices(r.items.map((i) => String(i.price)));
      setPlace(r.place);
      setTotal(String(r.total && r.total >= sum ? r.total : sum + r.service || ""));
      if (!r.items.length) setErr("Не нашли позиции на фото. Добавь их вручную или попробуй сфотографировать чек ровнее и ближе.");
      else if (note) setErr(`${note} Распознали на телефоне, проверь позиции внимательнее.`);
      setStep("items");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось распознать чек"); setStep("pick");
    }
  }

  const sub = items.reduce((s, _, i) => s + parseAmount(prices[i] ?? ""), 0);
  const tot = parseAmount(total) || sub;
  const orphan = items.filter((i, k) => parseAmount(prices[k]) > 0 && !i.who.length).length;
  const per = useMemo(() => {
    const r: Record<number, number> = {};
    if (!sub) return r;
    items.forEach((it, k) => { const pr = parseAmount(prices[k]); if (!it.who.length || !pr) return; it.who.forEach((m) => (r[m] = (r[m] || 0) + (pr / it.who.length) * (tot / sub))); });
    return r;
  }, [items, prices, sub, tot]);
  const rate = edit && edit.currency === cur ? Number(edit.rate) : rateOf(cur);
  const ok = items.length > 0 && sub > 0 && !orphan;

  const upd = (k: number, patch: Partial<ReceiptItem>) => setItems(items.map((it, i) => (i === k ? { ...it, ...patch } : it)));
  async function save() {
    if (!ok || busy) return;
    setBusy(true);
    const clean = items.map((it, k) => ({ name: it.name.trim() || "Позиция", price: parseAmount(prices[k]), who: it.who })).filter((i) => i.price > 0);
    const fields = { title: place.trim() || "Чек", category: guessCat(place) === "other" ? "food" : guessCat(place), amount: Math.round(tot * 100) / 100, currency: cur, rate, payer, split: { type: "items", items: clean } };
    const done = edit
      ? await c.run("updateExpense", { id: edit.id, ...fields }, "Чек изменён")
      : await c.run("addExpense", { group_id: g.id, ...fields, source: "scan", spent_on: todayISO() }, "Чек сохранён");
    setBusy(false);
    if (done) edit ? c.open({ kind: "detail", id: edit.id }) : c.close();
  }

  if (step === "pick") return (
    <>
      <SheetHead title="Скан чека" onClose={c.close} />
      <label className="drop" htmlFor="f-file">
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 10h8M8 14h5" /></svg>
        <b>Сфоткай или загрузи чек</b>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Распознаю позиции, а каждый отметит, что ел</span>
      </label>
      <input ref={fileRef} type="file" id="f-file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {err && <div className="err-banner">{err}</div>}
      <button className="btn ghost wide" onClick={() => { setItems([{ name: "", price: 0, who: [] }]); setPrices([""]); setStep("items"); }}>Ввести позиции вручную</button>
      <p className="ocrnote">{c.ai ? "Чек прочитает ИИ: поймёт позиции на любом языке, сервис и налоги. Потом каждый отметит своё." : "Чек распознаётся прямо на телефоне. Первый раз загрузка языков занимает около минуты."}</p>
    </>
  );
  if (step === "ocr") return (
    <>
      <SheetHead title="Распознаю чек" onClose={c.close} />
      {img && <img src={img} alt="Чек" style={{ maxHeight: 220, objectFit: "contain", borderRadius: 12 }} />}
      <div className="progress"><i style={{ width: `${Math.round(progress.p * 100)}%` }} /></div>
      <p className="ocrnote">{progress.stage || "Начинаю"} · {Math.round(progress.p * 100)}%</p>
    </>
  );
  return (
    <>
      <SheetHead title={edit ? "Изменить чек" : "Кто что ел"} onClose={c.close} />
      {err && <div className="err-banner">{err}</div>}
      <div className="field"><label className="flabel" htmlFor="f-place">Где</label>
        <input className="text" id="f-place" value={place} placeholder="Например, ужин в Warung Made" maxLength={60} onChange={(e) => setPlace(e.target.value)} />
      </div>
      <CurPicker value={cur} onChange={setCur} curs={c.curs} addCur={c.addCur} />
      <div className="receipt">
        <div className="rhead"><b>{place || "Чек"}</b>Проверь позиции и отметь, кто что ел</div>
        {items.map((it, k) => (
          <div className={`item ${it.who.length || !parseAmount(prices[k]) ? "" : "warn"}`} key={k}>
            <div className="edit">
              <input value={it.name} placeholder="Название" onChange={(e) => upd(k, { name: e.target.value })} aria-label="Название позиции" />
              <input className="num" inputMode="decimal" value={prices[k] ?? ""} placeholder="0" onChange={(e) => setPrices(prices.map((p, i) => (i === k ? e.target.value : p)))} aria-label="Цена" />
              <button aria-label="Удалить позицию" onClick={() => { setItems(items.filter((_, i) => i !== k)); setPrices(prices.filter((_, i) => i !== k)); }}>×</button>
            </div>
            <div className="who">{g.members.map((m) => (
              <button key={m.id} aria-pressed={it.who.includes(m.id)} aria-label={name(c, m.id)}
                onClick={() => upd(k, { who: it.who.includes(m.id) ? it.who.filter((x) => x !== m.id) : [...it.who, m.id] })}>
                <Avatar p={m} me={c.me} />
              </button>))}
            </div>
          </div>
        ))}
        <button className="additem" onClick={() => { setItems([...items, { name: "", price: 0, who: [] }]); setPrices([...prices, ""]); }}>+ Добавить позицию</button>
        <div className="rsmall"><span>Сумма позиций</span><span className="num">{money(sub, cur)}</span></div>
        <div className="rtotal" style={{ alignItems: "center" }}><span>Итого по чеку</span>
          <input className="num" inputMode="decimal" value={total} placeholder={nf(sub)} onChange={(e) => setTotal(e.target.value)}
            style={{ width: 120, textAlign: "right", border: "1px solid #c9d0c8", borderRadius: 8, padding: "6px 8px", font: "inherit", fontWeight: 800, background: "#fff", color: "#1b221c" }} aria-label="Итого" />
        </div>
        {tot > sub && sub > 0 && <div className="rsmall"><span>Сервис и налог {nf(((tot - sub) / sub) * 100, 1)}%</span><span>делятся пропорционально</span></div>}
      </div>
      <div className="field"><span className="flabel">Кто платил</span>
        <div className="chips">{g.members.map((m) => <button key={m.id} className="chip" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)}><Avatar p={m} size="sm" me={c.me} />{name(c, m.id)}</button>)}</div>
      </div>
      {Object.keys(per).length > 0 && <div className="field"><span className="flabel">Получается</span>
        <div className="box">{g.members.filter((m) => per[m.id]).map((m) => <div className="pp" key={m.id}><Avatar p={m} size="sm" me={c.me} /><span>{name(c, m.id)}</span><b className="num">{inBase(per[m.id] * rate, c.base)}</b></div>)}</div>
      </div>}
      <button className="btn wide" disabled={!ok || busy} onClick={save}>
        {busy ? "Сохраняю…" : orphan ? `Отметь, кто ел: ${orphan} ${plural(orphan, "позиция", "позиции", "позиций")} без хозяина` : !sub ? "Добавь позиции с ценой" : edit ? "Сохранить изменения" : "Сохранить чек"}
      </button>
    </>
  );
}

// ---------- детали ----------
export function DetailSheet({ c, id }: { c: Ctx; id: string }) {
  const e = c.g.expenses.find((x) => x.id === id);
  const [sure, setSure] = useState(false);
  if (!e) return <><SheetHead title="Запись удалена" onClose={c.close} /><p className="note">Кто-то уже удалил эту запись.</p></>;
  const del = async () => { if (!sure) return setSure(true); if (await c.run("deleteExpense", { id: e.id }, "Удалено")) c.close(); };

  if (e.kind === "transfer") {
    const canDelete = e.pending ? e.from_user === c.me || e.to_user === c.me : e.to_user === c.me;
    return (
      <>
        <SheetHead title="Перевод" onClose={c.close} />
        <div className="box"><div className="pp">
          <Avatar p={prof(c, e.from_user)} me={c.me} /><i style={{ fontStyle: "normal" }}>{name(c, e.from_user)}</i><Fly />
          <Avatar p={prof(c, e.to_user)} me={c.me} /><span>{name(c, e.to_user)}</span><b className="num">{inBase(rubOf(e), c.base)}</b>
        </div></div>
        {e.pending ? <>
          <div className="waitnote">{name(c, e.from_user)} {e.from_user === c.me ? "отметил" : "отметил(а)"} перевод. Он засчитается, когда {e.to_user === c.me ? "ты подтвердишь" : name(c, e.to_user) + " подтвердит"} получение.</div>
          {e.to_user === c.me && <div className="txbtns wide">
            <button className="btn" onClick={async () => { if (await c.run("confirmTransfer", { id: e.id }, "Перевод подтверждён")) c.close(); }}>Получил</button>
            <button className="btn ghost" onClick={async () => { if (await c.run("rejectTransfer", { id: e.id }, "Отметка снята")) c.close(); }}>Не пришло</button>
          </div>}
        </> : <div className="waitnote ok">{name(c, e.to_user)} {e.to_user === c.me ? "подтвердил" : "подтвердил(а)"} получение.</div>}
        {canDelete && <button className={`btn danger wide ${sure ? "sure" : ""}`} onClick={del}>{sure ? "Нажми ещё раз, чтобы удалить" : e.pending ? "Отменить отметку" : "Удалить"}</button>}
      </>
    );
  }
  const sh = shares(e);
  const items = e.split?.type === "items" ? e.split.items : null;
  return (
    <>
      <SheetHead title={e.title || catName(e.category)} onClose={c.close}
        extra={<button className="x" aria-label="Изменить расход" onClick={() => c.open({ kind: items ? "scan" : "add", edit: e })}><Pen /></button>} />
      <div className="box">
        <div className="pp"><Ico k={e.category} /><span><b>{money(Number(e.amount), e.currency)}</b>
          {e.currency !== c.base && <><br /><small style={{ color: "var(--muted)" }}>{inBase(rubOf(e), c.base)} по курсу {dayName(e.spent_on)}: {rateLabel(e.currency, Number(e.rate), c.base)}</small></>}
        </span></div>
        <div className="pp"><Avatar p={prof(c, e.payer)} size="sm" me={c.me} /><span>{e.payer === c.me ? "Платил ты" : `Платил(а) ${name(c, e.payer)}`}</span></div>
      </div>
      {items && <div className="field"><span className="flabel">По чеку</span><div className="box">
        {items.map((it, k) => <div className="pp" key={k}><span>{it.name}</span><span style={{ flex: "none", display: "flex", gap: 2 }}>{it.who.map((w) => <Avatar key={w} p={prof(c, w)} size="sm" me={c.me} />)}</span><b className="num">{nf(Number(it.price))}</b></div>)}
      </div></div>}
      <div className="field"><span className="flabel">Доли</span><div className="box">
        {Object.keys(sh).map((m) => <div className="pp" key={m}><Avatar p={prof(c, Number(m))} size="sm" me={c.me} /><span>{name(c, Number(m))}</span><b className="num">{inBase(sh[Number(m)] * Number(e.rate), c.base)}</b></div>)}
      </div></div>
      <button className={`btn danger wide ${sure ? "sure" : ""}`} onClick={del}>{sure ? "Нажми ещё раз, чтобы удалить" : "Удалить"}</button>
    </>
  );
}

// ---------- группа: создание и настройки ----------
const EMOJIS = ["🌴", "🏔️", "🏖️", "🏙️", "⛺", "🚗", "🎿", "🍷", "🏠", "🎉"];
function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
      const k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k;
      cv.getContext("2d")!.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
      URL.revokeObjectURL(url); resolve(cv.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось открыть фото")); };
    img.src = url;
  });
}
export function GroupSheet({ c, create }: { c: Ctx | (Omit<Ctx, "g"> & { g?: Group }); create?: boolean }) {
  const g = create ? undefined : c.g;
  const [nameV, setName] = useState(g?.name ?? "");
  const [emoji, setEmoji] = useState(g?.emoji ?? "🏖️");
  const [photo, setPhoto] = useState<string | null>(g?.photo ?? null);
  const [start, setStart] = useState(g?.start_date ?? (create ? todayISO() : ""));
  const [end, setEnd] = useState(g?.end_date ?? "");
  const [cur, setCur] = useState(g?.currency ?? "RUB");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!nameV.trim()) return setErr("Впиши название группы.");
    if (start && end && end < start) return setErr("Дата конца раньше даты начала. Поправь даты.");
    setBusy(true);
    const fields = { name: nameV.trim(), emoji, photo, start_date: start || null, end_date: end || null, currency: cur };
    if (create) {
      const res = await c.run("createGroup", fields, "Группа создана");
      setBusy(false);
      if (res) c.close();
    } else {
      const res = await c.run("updateGroup", { id: g!.id, ...fields }, "Группа сохранена");
      setBusy(false);
      if (res) c.close();
    }
  }

  return (
    <>
      <SheetHead title={create ? "Новая группа" : undefined} onClose={c.close} />
      <label className="gav gbig" htmlFor="f-photo"><GroupImg g={{ photo, emoji }} />
        <i className="pen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5A2 2 0 0 1 5 6.5h2.5L9 4.5h6l1.5 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.6" /></svg></i>
      </label>
      <input type="file" id="f-photo" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { setPhoto(await shrinkPhoto(f)); } catch (x) { setErr((x as Error).message); } }} />
      {photo ? <div className="photoacts"><button onClick={() => setPhoto(null)}>Убрать фото</button></div>
        : <div className="field"><span className="flabel">Или выбери значок</span>
          <div className="chips">{EMOJIS.map((x) => <button key={x} className="chip" aria-pressed={emoji === x} style={{ fontSize: 18, padding: "5px 10px" }} onClick={() => setEmoji(x)}>{x}</button>)}</div>
        </div>}
      <div className="field"><label className="flabel" htmlFor="f-tname">Название</label>
        <input className="text" id="f-tname" maxLength={40} value={nameV} placeholder="Например, Бали" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field"><span className="flabel">Даты поездки</span>
        <div className="dates">
          <input className="text" type="date" id="f-start" value={start} aria-label="Начало" onChange={(e) => setStart(e.target.value)} />
          <input className="text" type="date" id="f-end" value={end} aria-label="Конец" onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="field"><span className="flabel">Основная валюта трат</span>
        <CurPicker value={cur} onChange={setCur} curs={c.curs} addCur={c.addCur} />
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Подставляется по умолчанию в новых тратах и в командах чата.</span>
      </div>
      {g && <div className="field"><span className="flabel">Участники</span><div className="box">
        {g.members.map((m) => <div className="pp" key={m.id}><Avatar p={m} size="sm" me={c.me} /><span>{m.id === c.me ? `${m.first_name} (ты)` : m.first_name}{m.username ? <small style={{ color: "var(--muted)" }}> @{m.username}</small> : null}</span>{m.id === g.created_by && <span style={{ flex: "none", color: "var(--muted)", fontSize: 13 }}>создатель</span>}</div>)}
        <div className="pp"><button style={{ color: "var(--accent)", fontWeight: 600 }} onClick={() => c.open({ kind: "invite" })}>+ Позвать участников</button></div>
      </div></div>}
      {g && <div className="field"><span className="flabel">Чат Telegram</span>
        {g.tg_chat_id ? (
          <div className="box"><div className="pp">
            <span className="ico"><svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z" /></svg></span>
            <span>Подключён «{g.tg_chat_title || "чат"}»<br /><small style={{ color: "var(--muted)" }}>Сообщения вида «+1200 такси» из чата записываются в расходы</small></span>
          </div>
            <div className="pp"><button style={{ color: "var(--minus)", fontWeight: 600 }} onClick={() => c.run("unlinkChat", { id: g.id }, "Чат отключён")}>Отключить чат</button></div>
          </div>
        ) : <>
          <button className="btn ghost wide" onClick={() => {
            const url = `https://t.me/${BOT_USERNAME}?startgroup=${g.invite_code}`;
            if (tg) tg.openTelegramLink(url); else window.open(url, "_blank");
          }}>Подключить чат Telegram</button>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Выбери чат поездки, бот присоединится к нему. Траты можно будет писать прямо в чате: «+1200 такси», «/itog» покажет расчёт.</span>
        </>}
      </div>}
      {create && <span style={{ color: "var(--muted)", fontSize: 13 }}>После создания получишь ссылку, чтобы позвать друзей.</span>}
      {err && <p className="err">{err}</p>}
      <button className="btn wide" disabled={busy} onClick={save}>{busy ? "Сохраняю…" : create ? "Создать группу" : "Сохранить"}</button>
    </>
  );
}

// ---------- приглашение ----------
export function InviteSheet({ c }: { c: Ctx }) {
  const link = inviteLink(c.g.invite_code);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); c.toast("Ссылка скопирована"); }
    catch {
      const el = document.getElementById("invlink");
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
      c.toast("Ссылка выделена, скопируй её вручную");
    }
  };
  return (
    <>
      <SheetHead title="Позвать друзей" onClose={c.close} />
      <p style={{ margin: 0, color: "var(--muted)" }}>Отправь ссылку друзьям. Кто откроет её в Telegram, сразу попадёт в группу «{c.g.name}». Имя и аватарку подставит Telegram.</p>
      <div className="invite" id="invlink">{link}</div>
      <button className="btn wide" onClick={() => shareLink(link, `Присоединяйся к группе «${c.g.name}» в Скинемся — считаем общие траты`)}>Отправить в Telegram</button>
      <button className="btn ghost wide" onClick={copy}>Скопировать ссылку</button>
      <div className="field"><span className="flabel">Уже в группе · {c.g.members.length} чел.</span><div className="box">
        {c.g.members.map((m) => <div className="pp" key={m.id}><Avatar p={m} size="sm" me={c.me} /><span>{m.id === c.me ? `${m.first_name} (ты)` : m.first_name}</span></div>)}
      </div></div>
    </>
  );
}

export const defaultCurs = () => {
  try { const v = JSON.parse(localStorage.getItem("skinemsya-curs") || "null"); if (Array.isArray(v) && v.length) return v as string[]; } catch { /* нет */ }
  return [...DEFAULT_CURS];
};

// ---------- помощь и обратная связь ----------
export function HelpSheet({ c }: { c: Omit<Ctx, "g"> & { g?: Group } }) {
  const [text, setText] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function attach(f?: File) {
    if (!f) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      setShot(cv.toDataURL("image/jpeg", 0.8)); URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  async function send() {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    const ok = await c.run("feedback", {
      text, group_id: c.g?.id ?? null, screenshot: shot ? shot.split(",")[1] : undefined,
      context: { group: c.g?.name ?? "", platform: `${tg?.platform ?? "web"} · Telegram ${tg?.version ?? "?"} · ${navigator.userAgent.slice(0, 120)}` },
    }, "Сообщение отправлено");
    setBusy(false);
    if (ok) setSent(true);
  }
  if (sent) return (
    <>
      <SheetHead title="Спасибо!" onClose={c.close} />
      <p style={{ margin: 0, color: "var(--muted)" }}>Сообщение ушло разработчику. Ответ придёт от бота @{BOT_USERNAME} в личные сообщения.</p>
      <button className="btn wide" onClick={c.close}>Готово</button>
    </>
  );
  return (
    <>
      <SheetHead title="Помощь" onClose={c.close} />
      <div className="box">
        <div className="pp"><span><b>Как позвать друзей?</b><br /><small style={{ color: "var(--muted)" }}>Кнопка «Позвать» на экране расходов. Ссылку можно отправить в любой чат.</small></span></div>
        <div className="pp"><span><b>Как записывать траты из чата Telegram?</b><br /><small style={{ color: "var(--muted)" }}>Карандаш в шапке группы → «Подключить чат Telegram». Потом пишите в чат «+1200 такси».</small></span></div>
        <div className="pp"><span><b>Почему долг не закрылся?</b><br /><small style={{ color: "var(--muted)" }}>Перевод засчитывается, когда получатель нажмёт «Получил».</small></span></div>
      </div>
      <div className="field"><label className="flabel" htmlFor="f-help">Написать разработчику</label>
        <textarea id="f-help" className="text" rows={5} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Что случилось или чего не хватает? Опиши по шагам, если что-то сломалось." style={{ resize: "vertical", fontFamily: "inherit" }} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {shot && <img className="thumb" src={shot} alt="Скриншот" />}
        <label className="chip addcur" htmlFor="f-shot" style={{ cursor: "pointer" }}>{shot ? "Заменить скриншот" : "+ Приложить скриншот"}</label>
        {shot && <button className="linkbtn" onClick={() => setShot(null)}>Убрать</button>}
        <input type="file" id="f-shot" accept="image/*" hidden onChange={(e) => attach(e.target.files?.[0])} />
      </div>
      <button className="btn wide" disabled={busy || text.trim().length < 3} onClick={send}>{busy ? "Отправляю…" : "Отправить"}</button>
      <p className="note">Вместе с сообщением уйдут твоё имя в Telegram и модель устройства, чтобы было проще разобраться.</p>
    </>
  );
}
