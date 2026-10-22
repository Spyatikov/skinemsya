// Общие мелкие компоненты: аватарки, иконки, шапка шторки.
import type { ReactNode } from "react";
import type { Group, Profile } from "./money";

const COLORS = ["#65aadd", "#a695e7", "#f5a05c", "#4fbfc6", "#ee7aae", "#7fc77f", "#e7c35b", "#e08a7a"];
export const colorOf = (id: number) => COLORS[Math.abs(id) % COLORS.length];

export function Avatar({ p, size = "", me }: { p?: Profile; size?: "" | "sm" | "md" | "lg"; me?: number }) {
  if (!p) return <span className={`av ${size}`} style={{ background: "var(--sunk)" }}>?</span>;
  if (p.photo_url) return <img className={`av ${size}`} src={p.photo_url} alt={p.first_name} referrerPolicy="no-referrer" />;
  const letter = p.id === me ? "Я" : (p.first_name || "?")[0].toUpperCase();
  return <span className={`av ${size}`} style={{ background: colorOf(p.id) }} title={p.first_name}>{letter}</span>;
}

export function GroupImg({ g }: { g: Pick<Group, "photo" | "emoji"> }) {
  return <span className="gimg">{g.photo ? <img src={g.photo} alt="" /> : g.emoji || "🌴"}</span>;
}

export function SheetHead({ title, onClose, extra }: { title?: string; onClose: () => void; extra?: ReactNode }) {
  if (!title) return <button className="x xfloat" onClick={onClose} aria-label="Закрыть">✕</button>;
  return (
    <div className="shead">
      <h3>{title}</h3>
      <div style={{ display: "flex", gap: 8, flex: "none" }}>
        {extra}
        <button className="x" onClick={onClose} aria-label="Закрыть">✕</button>
      </div>
    </div>
  );
}

export const CAT_ICON: Record<string, ReactNode> = {
  home: <><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5" /></>,
  ride: <><path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" /><path d="M3.5 13a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" /><path d="M6 17.5v1.5M18 17.5v1.5" /><circle cx="7.3" cy="14.2" r="1" fill="currentColor" /><circle cx="16.7" cy="14.2" r="1" fill="currentColor" /></>,
  food: <><path d="M5 10h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" /><path d="M17 11.5h1.5a2 2 0 0 1 0 4H16.5M9 3.5c-.8 1 .8 2 0 3M12.5 3.5c-.8 1 .8 2 0 3" /></>,
  fun: <><circle cx="12" cy="6" r="3" /><path d="M12 9v6.5" /><path d="M4.5 16.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19z" /><path d="M15.5 14.5v-1a1.5 1.5 0 0 1 3 0v1" fill="currentColor" /></>,
  other: <><circle cx="12" cy="12" r="8" /><path d="M12 8.5v7M8.5 12h7" /></>,
  transfer: <path d="M5 9h13l-3-3M19 15H6l3 3" />,
};
export const CATS: [string, string][] = [["food", "Еда"], ["ride", "Транспорт"], ["home", "Жильё"], ["fun", "Развлечения"], ["other", "Другое"]];
export const catName = (k: string) => CATS.find((c) => c[0] === k)?.[1] ?? "Другое";
export const Ico = ({ k }: { k: string }) => (
  <span className={`ico ${k === "food" ? "warm" : ""}`}><svg viewBox="0 0 24 24">{CAT_ICON[k] ?? CAT_ICON.other}</svg></span>
);
export const Fly = () => (
  <svg className="fly" viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7h19M15 2l5 5-5 5" /></svg>
);
export const Pen = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
);

export function guessCat(t: string) {
  t = t.toLowerCase();
  if (/такси|байк|бензин|grab|uber|трансфер|автобус|паром|самол|поезд|метро|аренда авто|машин/.test(t)) return "ride";
  if (/ужин|обед|завтрак|кофе|еда|бар|пиво|ресторан|продукт|кафе|перекус/.test(t)) return "food";
  if (/отель|вилл|жиль|хостел|airbnb|квартир|апарт|номер/.test(t)) return "home";
  if (/храм|экскурс|дайв|серф|музей|массаж|вход|билет|кино|концерт|парк/.test(t)) return "fun";
  return "other";
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const parseDate = (d: string) => { const [y, m, da] = d.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, da); };
export const dayName = (d: string) => { const x = parseDate(d); return x.getDate() + " " + MONTHS[x.getMonth()]; };
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function relDay(d: string) {
  const diff = Math.round((parseDate(todayISO()).getTime() - parseDate(d).getTime()) / 864e5);
  return diff === 0 ? "Сегодня" : diff === 1 ? "Вчера" : ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"][parseDate(d).getDay()];
}
export function tripDates(g: { start_date: string | null; end_date: string | null }) {
  if (!g.start_date || !g.end_date) return g.start_date ? "с " + dayName(g.start_date) : "";
  const a = parseDate(g.start_date), b = parseDate(g.end_date);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return a.getDate() === b.getDate() ? dayName(g.start_date) : `${a.getDate()}–${dayName(g.end_date)}`;
  return `${dayName(g.start_date)} – ${dayName(g.end_date)}`;
}
/** **жирный** → <b>, всё остальное экранируется */
export function richText(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\n)/).map((part, i) =>
    part === "\n" ? <br key={i} /> : part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part);
}
