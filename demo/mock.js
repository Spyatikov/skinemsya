// Демо-окружение для записи роликов: заглушка Telegram WebApp и сервер в памяти.
(function () {
  const ME = 1;
  const P = {
    1: { id: 1, first_name: "Вячеслав", username: "spyatikov", photo_url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzViOGRlZiIvPgo8cGF0aCBkPSJNMTggMTAwYzItMTggMTUtMjcgMzItMjdzMzAgOSAzMiAyN3oiIGZpbGw9IiMxZjNhNjMiLz48cmVjdCB4PSI0NCIgeT0iNjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxNSIgcng9IjUiIGZpbGw9IiNmMWM3YTMiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iNDciIHJ4PSIxNiIgcnk9IjE4IiBmaWxsPSIjZjFjN2EzIi8+PHBhdGggZD0iTTMzIDQ0YzAtMTMgOC0yMCAxNy0yMHMxNyA3IDE3IDIwYy01LTYtMTAtOC0xNy04cy0xMiAyLTE3IDh6IiBmaWxsPSIjM2IyYTIwIi8+CjxjaXJjbGUgY3g9IjQ0IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxjaXJjbGUgY3g9IjU2IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxwYXRoIGQ9Ik00NSA1NnE1IDQgMTAgMCIgc3Ryb2tlPSIjOWE1YTRhIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+" },
    2: { id: 2, first_name: "Катя", username: "katya_travel", photo_url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YyYTY1YSIvPjxwYXRoIGQ9Ik0yNiA1MmMwLTIwIDEwLTMyIDI0LTMyczI0IDEyIDI0IDMydjMwSDI2eiIgZmlsbD0iIzdhM2UxZCIvPgo8cGF0aCBkPSJNMTggMTAwYzItMTggMTUtMjcgMzItMjdzMzAgOSAzMiAyN3oiIGZpbGw9IiNjMjQxMmQiLz48cmVjdCB4PSI0NCIgeT0iNjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxNSIgcng9IjUiIGZpbGw9IiNmNmQyYjUiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iNDciIHJ4PSIxNiIgcnk9IjE4IiBmaWxsPSIjZjZkMmI1Ii8+PHBhdGggZD0iTTMyIDQ2YzAtMTQgOC0yMiAxOC0yMnMxOCA4IDE4IDIyYy02LTgtMTItMTAtMTgtMTBzLTEyIDItMTggMTB6IiBmaWxsPSIjN2EzZTFkIi8+CjxjaXJjbGUgY3g9IjQ0IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxjaXJjbGUgY3g9IjU2IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxwYXRoIGQ9Ik00NSA1NnE1IDQgMTAgMCIgc3Ryb2tlPSIjOWE1YTRhIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+" },
    3: { id: 3, first_name: "Миша", username: "misha", photo_url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzRmYmZjNiIvPgo8cGF0aCBkPSJNMTggMTAwYzItMTggMTUtMjcgMzItMjdzMzAgOSAzMiAyN3oiIGZpbGw9IiMyZDVkM2IiLz48cmVjdCB4PSI0NCIgeT0iNjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxNSIgcng9IjUiIGZpbGw9IiNlOWI4OTYiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iNDciIHJ4PSIxNiIgcnk9IjE4IiBmaWxsPSIjZTliODk2Ii8+PHBhdGggZD0iTTM0IDQyYzEtMTEgOC0xNiAxNi0xNnMxNSA1IDE2IDE2Yy01LTQtMTAtNS0xNi01cy0xMSAxLTE2IDV6IiBmaWxsPSIjMWYxYTE3Ii8+CjxjaXJjbGUgY3g9IjQ0IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxjaXJjbGUgY3g9IjU2IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxwYXRoIGQ9Ik00NSA1NnE1IDQgMTAgMCIgc3Ryb2tlPSIjOWE1YTRhIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+" },
    4: { id: 4, first_name: "Аня", username: "anya", photo_url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlN2FhZSIvPjxwYXRoIGQ9Ik0yNyA1MGMwLTE4IDEwLTI5IDIzLTI5czIzIDExIDIzIDI5djE2SDI3eiIgZmlsbD0iI2UzYzA2YiIvPgo8cGF0aCBkPSJNMTggMTAwYzItMTggMTUtMjcgMzItMjdzMzAgOSAzMiAyN3oiIGZpbGw9IiM2YjNmYTAiLz48cmVjdCB4PSI0NCIgeT0iNjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxNSIgcng9IjUiIGZpbGw9IiNmN2Q3YzEiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iNDciIHJ4PSIxNiIgcnk9IjE4IiBmaWxsPSIjZjdkN2MxIi8+PHBhdGggZD0iTTMyIDQ2YzAtMTQgOC0yMiAxOC0yMnMxOCA4IDE4IDIyYy00LTktMTEtMTEtMTgtMTFzLTE0IDItMTggMTF6IiBmaWxsPSIjZTNjMDZiIi8+CjxjaXJjbGUgY3g9IjQ0IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxjaXJjbGUgY3g9IjU2IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxwYXRoIGQ9Ik00NSA1NnE1IDQgMTAgMCIgc3Ryb2tlPSIjOWE1YTRhIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+" },
    5: { id: 5, first_name: "Дима", username: "dima", photo_url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzdmYzc3ZiIvPgo8cGF0aCBkPSJNMTggMTAwYzItMTggMTUtMjcgMzItMjdzMzAgOSAzMiAyN3oiIGZpbGw9IiMzODRhOGMiLz48cmVjdCB4PSI0NCIgeT0iNjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxNSIgcng9IjUiIGZpbGw9IiNkOWEyN2YiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iNDciIHJ4PSIxNiIgcnk9IjE4IiBmaWxsPSIjZDlhMjdmIi8+PHBhdGggZD0iTTMzIDQ0YzAtMTMgOC0yMCAxNy0yMHMxNyA3IDE3IDIwYy01LTYtMTAtOC0xNy04cy0xMiAyLTE3IDh6IiBmaWxsPSIjMmIyMTFiIi8+CjxjaXJjbGUgY3g9IjQ0IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxjaXJjbGUgY3g9IjU2IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxwYXRoIGQ9Ik00NSA1NnE1IDQgMTAgMCIgc3Ryb2tlPSIjOWE1YTRhIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+" },
    6: { id: 6, first_name: "Оля", username: "olya", photo_url: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2E2OTVlNyIvPjxwYXRoIGQ9Ik0yNiA1MmMwLTIwIDEwLTMyIDI0LTMyczI0IDEyIDI0IDMydjMwSDI2eiIgZmlsbD0iIzRhMmExYSIvPgo8cGF0aCBkPSJNMTggMTAwYzItMTggMTUtMjcgMzItMjdzMzAgOSAzMiAyN3oiIGZpbGw9IiMyZjdmN2EiLz48cmVjdCB4PSI0NCIgeT0iNjAiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxNSIgcng9IjUiIGZpbGw9IiNmM2NkYjAiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iNDciIHJ4PSIxNiIgcnk9IjE4IiBmaWxsPSIjZjNjZGIwIi8+PHBhdGggZD0iTTMyIDQ2YzAtMTQgOC0yMiAxOC0yMnMxOCA4IDE4IDIyYy02LTgtMTItMTAtMTgtMTBzLTEyIDItMTggMTB6IiBmaWxsPSIjNGEyYTFhIi8+CjxjaXJjbGUgY3g9IjQ0IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxjaXJjbGUgY3g9IjU2IiBjeT0iNDkiIHI9IjEuOCIgZmlsbD0iIzJhMmEyYSIvPjxwYXRoIGQ9Ik00NSA1NnE1IDQgMTAgMCIgc3Ryb2tlPSIjOWE1YTRhIiBzdHJva2Utd2lkdGg9IjEuOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+" },
  };
  window.Telegram = { WebApp: {
    initData: "query_id=demo&user=demo&hash=demo",
    initDataUnsafe: { user: { id: ME, first_name: "Вячеслав" } },
    colorScheme: "dark", platform: "ios", version: "8.0", themeParams: {},
    ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {},
    openTelegramLink() {}, openLink() {}, disableVerticalSwipes() {},
    HapticFeedback: { notificationOccurred() {}, impactOccurred() {} },
  } };

  const IDR = 0.0052;
  let seq = 100;
  const id = () => "x" + seq++;
  const at = (d, t) => `${d}T${t}:00+03:00`;
  const ex = (o) => ({ kind: "expense", from_user: null, to_user: null, pending: false, source: "app", created_at: at(o.spent_on, "12:00"), title: null, ...o });
  const msg = (gid, uid, text, d, t, open = false) => ({ id: seq++, group_id: gid, user_id: uid, text, open_feed: open, created_at: at(d, t) });

  const bali = {
    id: "bali", name: "Бали", emoji: "🌴", photo: null, start_date: "2026-10-10", end_date: "2026-10-20", currency: "IDR",
    invite_code: "b4l1tr1p", created_by: 1, tg_chat_id: -100123, tg_chat_title: "Бали 2026 🌴", reminders: true, mirror_to_chat: false,
    members: [P[1], P[2], P[3], P[4]],
    expenses: [
      ex({ id: "e6", group_id: "bali", title: "Такси до храма", category: "ride", amount: 350000, currency: "IDR", rate: IDR, payer: 3, split: { type: "equal", members: [1, 2, 3, 4] }, source: "chat", spent_on: "2026-10-15" }),
      ex({ id: "e5", group_id: "bali", title: "Ужин в Jimbaran", category: "food", amount: 2450000, currency: "IDR", rate: IDR, payer: 1, source: "scan", spent_on: "2026-10-14",
        split: { type: "items", items: [
          { name: "Наси горенг", price: 180000, who: [1] },
          { name: "Креветки гриль", price: 620000, who: [2, 3] },
          { name: "Рыба на углях", price: 540000, who: [4] },
          { name: "Молодой кокос ×4", price: 200000, who: [1, 2, 3, 4] },
          { name: "Пиво Bintang ×6", price: 420000, who: [1, 3] },
          { name: "Салат", price: 150000, who: [2, 4] },
        ] } }),
      { id: "t1", group_id: "bali", kind: "transfer", title: null, category: "other", amount: 10000, currency: "RUB", rate: 1, payer: null, split: null, from_user: 3, to_user: 2, pending: false, source: "app", spent_on: "2026-10-14", created_at: at("2026-10-14", "21:00") },
      ex({ id: "e4", group_id: "bali", title: "Серф-урок", category: "fun", amount: 2700000, currency: "IDR", rate: IDR, payer: 4, split: { type: "weights", weights: { 1: 1, 2: 0, 3: 1, 4: 1 } }, spent_on: "2026-10-13" }),
      ex({ id: "e3", group_id: "bali", title: "Сим-карты", category: "other", amount: 3200, currency: "RUB", rate: 1, payer: 1, split: { type: "equal", members: [1, 2, 3, 4] }, source: "chat", spent_on: "2026-10-12" }),
      ex({ id: "e2", group_id: "bali", title: "Аренда скутеров", category: "ride", amount: 1600000, currency: "IDR", rate: IDR, payer: 3, split: { type: "equal", members: [1, 2, 3, 4] }, spent_on: "2026-10-11" }),
      ex({ id: "e1", group_id: "bali", title: "Вилла в Убуде", category: "home", amount: 14400000, currency: "IDR", rate: IDR, payer: 2, split: { type: "equal", members: [1, 2, 3, 4] }, spent_on: "2026-10-10" }),
    ],
    messages: [],
  };
  bali.messages = [
    msg("bali", null, "Группа создана. Пишите траты как «+1200 такси», я запишу их в общие расходы.", "2026-10-09", "19:02"),
    msg("bali", 3, "Кто брал сим-карты? Сколько вышло?", "2026-10-12", "10:05"),
    msg("bali", 1, "+3200 руб сим-карты", "2026-10-12", "10:07"),
    msg("bali", null, "Записал **Сим-карты**: 3 200 ₽.\nПлатил(а) Вячеслав, делим на четверых по 800 ₽.", "2026-10-12", "10:07", true),
    msg("bali", 4, "Сегодня едем к храму Танах-Лот, такси уже вызвали 🚕", "2026-10-15", "09:40"),
    msg("bali", 3, "+350000 такси до храма", "2026-10-15", "09:52"),
    msg("bali", null, "Записал **Такси до храма**: 350 000 Rp, это примерно 1 820 ₽.\nПлатил(а) Миша, делим на четверых по 455 ₽.", "2026-10-15", "09:52", true),
    msg("bali", 2, "Вечером ужин на пляже, кто за? 🌅", "2026-10-15", "11:14"),
  ];
  const shym = {
    id: "shym", name: "Шымкент", emoji: "🏔️", photo: null, start_date: "2026-09-04", end_date: "2026-09-07", currency: "KZT",
    invite_code: "shym2026", created_by: 1, tg_chat_id: null, tg_chat_title: null, reminders: true, mirror_to_chat: false,
    members: [P[1], P[5], P[6]],
    expenses: [ex({ id: "s1", group_id: "shym", title: "Гостиница", category: "home", amount: 54000, currency: "KZT", rate: 0.16, payer: 1, split: { type: "equal", members: [1, 5, 6] }, spent_on: "2026-09-04" })],
    messages: [],
  };
  const dacha = {
    id: "dacha", name: "Дача", emoji: "🏠", photo: null, start_date: null, end_date: null, currency: "RUB",
    invite_code: "dacha777", created_by: 2, tg_chat_id: null, tg_chat_title: null, reminders: false, mirror_to_chat: false,
    members: [P[1], P[2]],
    expenses: [
      ex({ id: "d1", group_id: "dacha", title: "Продукты и уголь", category: "food", amount: 6000, currency: "RUB", rate: 1, payer: 2, split: { type: "equal", members: [1, 2] }, spent_on: "2026-08-22" }),
      { id: "d2", group_id: "dacha", kind: "transfer", title: null, category: "other", amount: 3000, currency: "RUB", rate: 1, payer: null, split: null, from_user: 1, to_user: 2, pending: false, source: "app", spent_on: "2026-08-23", created_at: at("2026-08-23", "10:00") },
    ],
    messages: [],
  };
  const groups = [bali, shym, dacha];
  const G = (gid) => groups.find((g) => g.id === gid);
  const nowISO = () => new Date().toISOString();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const bot = (g, text, open = false) => g.messages.push({ id: seq++, group_id: g.id, user_id: null, text, open_feed: open, created_at: nowISO() });
  const rub = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
  const findEx = (eid) => { for (const g of groups) { const e = g.expenses.find((x) => x.id === eid); if (e) return [g, e]; } return [null, null]; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const RECEIPT = {
    place: "Warung Pantai", currency: "IDR", confidence: "high",
    items: [
      { name: "Nasi Goreng Ayam", name_ru: "Наси горенг с курицей", quantity: 2, line_total: 130000 },
      { name: "Mie Goreng", name_ru: "Ми горенг", quantity: 1, line_total: 60000 },
      { name: "Sate Lilit", name_ru: "Сате лилит", quantity: 1, line_total: 85000 },
      { name: "Gado-Gado", name_ru: "Гадо-гадо", quantity: 1, line_total: 55000 },
      { name: "Bintang Large", name_ru: "Пиво Bintang", quantity: 3, line_total: 135000 },
      { name: "Es Kelapa Muda", name_ru: "Молодой кокос", quantity: 2, line_total: 70000 },
    ],
    service_and_tax: 85600, discount: 0, total: 620600,
  };

  async function handle(action, p) {
    await wait(action === "load" ? 120 : 260);
    switch (action) {
      case "load": return { me: ME, joined: null, ai: true, bot: "skinemsya_app_bot", groups: clone(groups) };
      case "createGroup": {
        const g = { id: id(), invite_code: "nw" + seq, created_by: ME, tg_chat_id: null, tg_chat_title: null, mirror_to_chat: false, reminders: true, photo: null, emoji: "🌴", members: [P[ME]], expenses: [], messages: [], ...p };
        groups.unshift(g);
        bot(g, "Группа создана. Пишите траты как «+1200 такси», я запишу их в общие расходы.");
        return { id: g.id };
      }
      case "updateGroup": Object.assign(G(p.id), p); return { ok: true };
      case "leaveGroup": return { ok: true };
      case "addExpense": {
        const g = G(p.group_id); const { botText, ...rest } = p;
        const e = { id: id(), kind: "expense", from_user: null, to_user: null, pending: false, created_at: nowISO(), ...rest };
        g.expenses.unshift(e);
        if (botText) bot(g, botText, true);
        return { id: e.id };
      }
      case "updateExpense": { const [, e] = findEx(p.id); Object.assign(e, p); return { ok: true }; }
      case "deleteExpense": { const [g, e] = findEx(p.id); g.expenses.splice(g.expenses.indexOf(e), 1); return { ok: true }; }
      case "markPaid": {
        const g = G(p.group_id);
        const e = { id: id(), group_id: g.id, kind: "transfer", title: null, category: "other", amount: p.amount, currency: "RUB", rate: 1, payer: null, split: null, from_user: ME, to_user: p.to_user, pending: true, source: "app", spent_on: today(), created_at: nowISO() };
        g.expenses.unshift(e);
        bot(g, `Вячеслав отметил перевод ${P[p.to_user].first_name} на ${rub(p.amount)}. ${P[p.to_user].first_name}, подтверди получение, и долг закроется.`, true);
        return { id: e.id };
      }
      case "confirmTransfer": { const [g, e] = findEx(p.id); e.pending = false; bot(g, `Перевод на ${rub(e.amount)} подтверждён. Долг закрыт.`); return { ok: true }; }
      case "rejectTransfer": { const [g, e] = findEx(p.id); g.expenses.splice(g.expenses.indexOf(e), 1); return { ok: true }; }
      case "sendMessage": {
        const g = G(p.group_id);
        g.messages.push({ id: seq++, group_id: g.id, user_id: ME, text: p.text, open_feed: false, created_at: nowISO() });
        if (p.botText) { await wait(500); bot(g, p.botText, Boolean(p.openFeed)); }
        return { ok: true };
      }
      case "scanReceipt": await wait(2600); return clone(RECEIPT);
      case "unlinkChat": { const g = G(p.id); g.tg_chat_id = null; g.tg_chat_title = null; return { ok: true }; }
      case "feedback": return { ok: true };
      default: throw new Error("Неизвестное действие " + action);
    }
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    if (String(url).includes("/functions/v1/api")) {
      const body = JSON.parse(opts.body);
      try { return new Response(JSON.stringify(await handle(body.action, body)), { status: 200, headers: { "content-type": "application/json" } }); }
      catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 400 }); }
    }
    if (String(url).includes("currency-api")) return new Response("{}", { status: 503 });
    return realFetch(url, opts);
  };

  // хуки для сценария записи
  const poke = () => document.dispatchEvent(new Event("visibilitychange"));
  window.__demo = {
    lastGroup() { return groups[0].id; },
    join(gid, uid) { const g = G(gid); g.members.push(P[uid]); bot(g, `${P[uid].first_name} ${[2, 4, 6].includes(uid) ? "присоединилась" : "присоединился"} к группе`); poke(); },
    confirmPending(gid) { const g = G(gid); for (const e of g.expenses) if (e.kind === "transfer" && e.pending) { e.pending = false; bot(g, `${P[e.to_user].first_name} подтвердила перевод от Вячеслава на ${rub(e.amount)}. Долг закрыт.`); } poke(); },
  };
})();
