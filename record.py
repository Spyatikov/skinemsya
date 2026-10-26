# Запись экрана демо-приложения по сценарию. Каждая «фраза» озвучки — отдельный бит:
# действия бита начинаются вместе с фразой, следующий бит ждёт, пока фраза договорится.
import asyncio, base64, datetime, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(f"{ROOT}/voice/script.json", encoding="utf-8"))
OUT = f"{ROOT}/render"; os.makedirs(OUT, exist_ok=True)
VW, VH, Z = 900, 1560, 900 / 390
GAP = 0.45

def dur(vid, i, text):
    f = f"{ROOT}/{os.environ.get('AUDIO', 'voice/out')}/{vid}_{i:02d}.mp3"
    if os.path.exists(f):
        return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))
    return len(text) / 14.5

TOUCH_JS = """
(() => { if (window.__touch) return; window.__touch = true;
  const st = document.createElement('style'); st.textContent = `
  .__t{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.35);
    border:2px solid rgba(255,255,255,.85);pointer-events:none;z-index:9999;animation:__tp .55s ease-out forwards}
  @keyframes __tp{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.25);opacity:0}}
  .__hl{outline:3px solid #5fb3ff !important;outline-offset:4px;border-radius:16px;transition:outline-color .3s;animation:__hlp 1.2s ease-in-out 2}
  @keyframes __hlp{50%{outline-color:rgba(95,179,255,.25)}}`;
  document.head.appendChild(st);
  window.__tap = (x, y) => { const Z = parseFloat(document.documentElement.style.zoom)||1; const d = document.createElement('div'); d.className='__t'; d.style.left=(x/Z)+'px'; d.style.top=(y/Z)+'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 700); };
})();
"""

class Rec:
    def __init__(self, page): self.page = page
    async def w(self, s): await self.page.wait_for_timeout(int(s * 1000))
    async def tap(self, loc, pause=0.55):
        if isinstance(loc, str): loc = self.page.locator(loc).first
        await loc.wait_for(state="visible", timeout=10000)
        b = await loc.bounding_box()
        in_sheet = await loc.evaluate("e => !!e.closest('.sheet')")
        fixed = await loc.evaluate("e => !!e.closest('.tabs,.composer')")
        if not fixed and (b["y"] < (20 if in_sheet else 80) * Z or b["y"] + b["height"] > VH - (20 if in_sheet else 100) * Z):
            await loc.evaluate("e => e.scrollIntoView({block:'center', behavior:'smooth'})")
            await self.w(0.7)
            b = await loc.bounding_box()
        x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
        await self.page.mouse.move(x, y)
        await self.page.evaluate(f"window.__tap({x},{y})")
        await self.w(0.12)
        await self.page.mouse.click(x, y)
        await self.w(pause)
    async def type(self, sel, text, delay=85):
        await self.tap(sel, 0.25)
        await self.page.keyboard.type(text, delay=delay)
    async def hl(self, sel, on=True):
        await self.page.evaluate("([s,on]) => document.querySelectorAll(s).forEach(e => e.classList.toggle('__hl', on))", [sel, on])
    async def scroll(self, y, el="window", smooth=True):
        js = ("(y) => window.scrollTo({top:y,behavior:'%s'})" if el == "window" else
              "(y) => document.querySelector('%s').scrollTo({top:y,behavior:'%%s'})" % el) % ("smooth" if smooth else "instant")
        await self.page.evaluate(js, y * Z)
    async def scroll_to(self, sel, block="center"):
        await self.page.evaluate("([s,b]) => document.querySelector(s).scrollIntoView({behavior:'smooth',block:b})", [sel, block])
    def sheet(self): return self.page.locator(".sheet")

# ---------- сценарии: список корутин по битам ----------
def v01(r: Rec):
    p = r.page
    async def b0(): await r.w(1.0)
    async def b1():
        await r.hl(".hero"); await r.w(4.5); await r.hl(".hero", False)
    async def b2():
        await r.scroll(420); await r.w(2.6); await r.scroll(900); await r.w(2.0)
    async def b3():
        await r.scroll(0); await r.w(0.7)
        for _ in range(3):
            await r.tap('button[aria-label="Валюта итогов"]', 1.2)
        await r.tap('button[aria-label="Валюта итогов"]', 0.35)
        await r.tap('button[aria-label="Валюта итогов"]', 0.4)
    async def b4():
        await r.w(0.9); await r.tap(p.locator(".row", has_text="Ужин в Jimbaran"), 1.6)
        await r.scroll(320, ".sheet"); await r.w(1.6)
    async def b5():
        await r.w(0.6); await r.tap('.sheet button[aria-label="Закрыть"]', 0.3)
    return [b0, b1, b2, b3, b4, b5]

def v02(r: Rec):
    p = r.page
    st = {}
    async def b0():
        await r.w(0.6); await r.tap(p.locator(".tab", has_text="Группы"), 0.4)
    async def b1():
        await r.tap(p.locator("button", has_text="Создать группу"), 0.6)
        await r.tap(p.locator(".sheet .chip", has_text="🏙️"), 0.3)
        await r.type("#f-tname", "Стамбул", 110)
        await p.fill("#f-start", "2026-11-05"); await p.fill("#f-end", "2026-11-09"); await r.w(0.5)
        await r.tap(p.locator(".sheet .chip", has_text="+ Добавить валюту"), 0.8)
        await r.tap(p.locator(".curitem", has_text="Турецкая лира"), 0.6)
        await r.tap(p.locator(".sheet .btn", has_text="Создать группу"), 0.6)
    async def b2():
        await r.w(1.0); await r.hl(".invite"); await r.w(1.6)
        await r.tap(p.locator(".sheet .btn", has_text="Отправить в Telegram"), 0.5); await r.hl(".invite", False)
    async def b3():
        gid = await p.evaluate("window.__demo.lastGroup()")
        await p.evaluate(f"window.__demo.join('{gid}', 2)"); await r.w(1.4)
        await p.evaluate(f"window.__demo.join('{gid}', 3)"); await r.w(1.2)
        await r.scroll_to(".sheet .field:last-of-type"); await r.w(1.2)
    async def b4():
        await r.tap('.sheet button[aria-label="Закрыть"]', 0.6)
        await r.tap('button[aria-label="Редактировать группу"]', 1.0)
        await r.scroll(380, ".sheet"); await r.w(1.5)
    return [b0, b1, b2, b3, b4]

def v03(r: Rec):
    p = r.page
    async def b0():
        await r.w(0.5); await r.tap(".plusbtn", 0.5)
    async def b1():
        await r.type("#f-amount", "4000", 140); await r.w(0.4)
        await r.tap(p.locator(".sheet .chip", has_text="INR"), 0.5)
        await r.type("#f-title", "Ужин на пляже", 70)
    async def b2():
        await r.hl(".preview"); await r.w(3.0); await r.hl(".preview", False)
    async def b3():
        payer = p.locator(".sheet .field", has_text="Кто платил")
        await r.tap(payer.locator(".chip", has_text="Катя"), 0.6)
        await r.tap(p.locator(".seg button", has_text="Долями"), 0.7)
        await r.tap(p.locator(".wrow", has_text="Миша").locator('button[aria-label="Больше"]'), 0.6)
        await r.scroll_to(".preview"); await r.w(1.0)
    async def b4():
        await r.tap(p.locator(".sheet .btn", has_text="Добавить расход"), 0.8)
        await r.scroll(0); await r.w(1.2); await r.hl(".list .row"); await r.w(1.4)
    return [b0, b1, b2, b3, b4]

def v04(r: Rec):
    p = r.page
    async def b0():
        await r.w(0.4); await r.tap(p.locator(".act", has_text="Скан чека"), 1.2)
        await r.tap(".drop", 0.2)
        await p.set_input_files("#f-file", f"{ROOT}/assets/receipt.jpg")
    async def b1():
        await p.wait_for_selector(".receipt", timeout=15000)
        await r.scroll(0, ".sheet", False); await r.w(1.6)
        await r.scroll_to(".receipt", "start"); await r.w(1.4)
    async def b2():
        plan = [(0, [0, 1]), (1, [2]), (2, [3]), (3, [1]), (4, [0, 2, 3]), (5, [1, 3])]
        for k, who in plan:
            item = p.locator(".receipt .item").nth(k)
            for w in who:
                await r.tap(item.locator(".who button").nth(w), 0.28)
    async def b3():
        await r.scroll_to(".sheet .field:has(.box)", "center"); await r.hl(".sheet .field:has(.box) .box"); await r.w(3.0)
        await r.hl(".sheet .field:has(.box) .box", False)
    async def b4():
        await r.tap(p.locator(".sheet .btn", has_text="Сохранить чек"), 0.9)
        await r.scroll(0); await r.w(0.6); await r.hl(".list .row"); await r.w(1.4)
    return [b0, b1, b2, b3, b4]

def v05(r: Rec):
    p = r.page
    async def b0():
        await r.w(0.4); await r.tap(p.locator(".act", has_text="Расчёт"), 1.0)
    async def b1():
        await r.scroll_to(".tx", "center"); await r.w(1.0); await r.hl(".lead"); await r.w(2.0); await r.hl(".lead", False)
    async def b2():
        await r.tap(p.locator(".tx .btn", has_text="Оплачено"), 0.6)
    async def b3():
        await r.hl(".waitbox"); await r.w(2.8); await r.hl(".waitbox", False)
        await p.evaluate("window.__demo.confirmPending('bali')"); await r.w(1.6)
    async def b4():
        await r.tap('button[aria-label="Редактировать группу"]', 0.9)
        await r.scroll_to("label[for=f-remind]", "center"); await r.w(0.6); await r.hl("label[for=f-remind]"); await r.w(2.4)
    return [b0, b1, b2, b3, b4]

def v06(r: Rec):
    p = r.page
    async def b0():
        await r.w(0.4); await r.tap(p.locator(".tab", has_text="Чат"), 0.8)
    async def b1():
        await r.type(".inrow input", "+800 руб такси", 90); await r.w(0.3)
        await r.tap(".send", 1.2); await r.scroll(99999); await r.w(0.6)
    async def b2():
        await r.tap(p.locator(".hint", has_text="/итог"), 0.5); await r.tap(".send", 1.4)
        await r.scroll(99999); await r.w(1.0)
    async def b3():
        await r.tap('button[aria-label="Редактировать группу"]', 0.9)
        await r.scroll_to("label[for=f-mirror]", "center"); await r.w(0.8)
        await r.tap("label[for=f-mirror]", 1.0)
    async def b4():
        await r.tap('.sheet button[aria-label="Закрыть"]', 0.5)
        await r.tap(p.locator(".tab", has_text="Группы"), 0.6)
        await r.tap(".helprow", 0.8); await r.type("#f-help", "Хочу экспорт расходов в таблицу 🙂", 45)
    async def b5():
        await r.tap('.sheet button[aria-label="Закрыть"]', 0.4)
        await r.tap(p.locator(".tab", has_text="Расходы"), 0.6)
    return [b0, b1, b2, b3, b4, b5]

SCEN = {"01-obzor": v01, "02-gruppa": v02, "03-rashod": v03, "04-chek": v04, "05-raschet": v05, "06-chat": v06}

async def record(v, pw):
    vid = v["id"]
    fdir = f"{OUT}/frames_{vid}"; subprocess.run(["rm", "-rf", fdir]); os.makedirs(fdir)
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=1, locale="ru-RU",
                              timezone_id="Europe/Moscow", permissions=["clipboard-read", "clipboard-write"])
    page = await ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    await page.add_init_script("document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.zoom=String(%s)})" % Z)
    await page.clock.install(time=datetime.datetime(2026, 10, 15, 11, 30, tzinfo=datetime.timezone(datetime.timedelta(hours=3))))
    await page.clock.resume()
    await page.goto("http://localhost:8765/index.html")
    await page.evaluate(TOUCH_JS)
    await page.wait_for_selector(".hero"); await page.wait_for_timeout(700)
    # захват кадров: DevTools screencast с метками времени
    cdp = await ctx.new_cdp_session(page)
    frames = []
    async def on_frame(f):
        k = len(frames); ts = f["metadata"]["timestamp"]
        frames.append(ts)
        open(f"{fdir}/{k:05d}.jpg", "wb").write(base64.b64decode(f["data"]))
        try: await cdp.send("Page.screencastFrameAck", {"sessionId": f["sessionId"]})
        except Exception: pass
    cdp.on("Page.screencastFrame", lambda f: asyncio.ensure_future(on_frame(f)))
    await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 90, "maxWidth": VW, "maxHeight": VH, "everyNthFrame": 1})
    await page.wait_for_timeout(500)
    # «пинаем» отрисовку, чтобы кадры шли и без изменений на экране
    await page.evaluate("""() => { const d=document.createElement('div'); d.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;z-index:99999';
       document.body.appendChild(d); let k=0; setInterval(()=>{d.style.background=(k++%2)?'#000':'#111'}, 33); }""")
    await page.wait_for_timeout(300)
    r = Rec(page)
    beats = SCEN[vid](r)
    marks = []
    start = time.time()
    for i, (fn, text) in enumerate(zip(beats, v["beats"])):
        d = dur(vid, i, text)
        bs = time.time()
        try: await fn()
        except Exception:
            await page.screenshot(path=f"{OUT}/fail_{vid}_{i}.png"); raise
        rest = d + GAP - (time.time() - bs)
        if rest > 0: await page.wait_for_timeout(int(rest * 1000))
        marks.append({"i": i, "start": bs - start, "dur": d, "text": text})
    await page.wait_for_timeout(700)
    end = time.time()
    await cdp.send("Page.stopScreencast"); await page.wait_for_timeout(300)
    await ctx.close(); await b.close()
    # индекс кадров → concat-файл для ffmpeg с длительностями
    lines, last = [], None
    idx = [(ts, k) for k, ts in enumerate(frames)]
    first = max([k for ts, k in idx if ts <= start] or [0])
    seq = [(max(ts, start), k) for ts, k in idx if k >= first and ts < end]
    for j, (ts, k) in enumerate(seq):
        nxt = seq[j + 1][0] if j + 1 < len(seq) else end
        lines.append(f"file '{fdir}/{k:05d}.jpg'\nduration {max(nxt - ts, 0.001):.4f}")
    lines.append(f"file '{fdir}/{seq[-1][1]:05d}.jpg'")
    open(f"{OUT}/{vid}.concat", "w").write("\n".join(lines) + "\n")
    meta = {"id": vid, "title": v["title"], "length": end - start, "frames": len(seq), "dir": fdir, "seq": [[round(ts - start, 4), k] for ts, k in seq], "beats": marks, "errors": errs}
    json.dump(meta, open(f"{OUT}/{vid}.json", "w"), ensure_ascii=False, indent=1)
    print(vid, f"{end - start:.1f}s", len(seq), "frames", "errors:", errs)

async def main():
    ids = sys.argv[1:] or list(SCEN)
    async with async_playwright() as pw:
        for v in S["videos"]:
            if v["id"] in ids: await record(v, pw)

asyncio.run(main())
