# Монтаж ролика 1080×1920: фон с шапкой, экран приложения со скруглением, субтитры, озвучка, финальная карточка.
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
R = f"{ROOT}/render"
W, H, FPS = 1080, 1920, 30
AX, AY, AW, AH = 90, 176, 900, 1560
FONT = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
FONTB = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
LOGO = "/home/claude/skinemsya/public/logo.png"
END = 2.6

def font(path, size):
    for p in [path, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(p): return ImageFont.truetype(p, size)

def grad():
    im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=(int(14 + 10 * k), int(22 + 14 * k), int(36 + 22 * k)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    gd.ellipse([-300, -420, 900, 520], fill=(58, 134, 218, 70)); gd.ellipse([400, 1300, 1500, 2300], fill=(238, 122, 174, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    im.paste(glow, (0, 0), glow)
    return im

def logo(size):
    lg = Image.open(LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)
    m = Image.new("L", (size, size), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * .24), fill=255)
    lg.putalpha(m); return lg

def background(title):
    im = grad(); d = ImageDraw.Draw(im)
    lg = logo(96); im.paste(lg, (AX, 44), lg)
    d.text((AX + 120, 46), "Скинемся", font=font(FONTB, 46), fill=(255, 255, 255))
    d.text((AX + 120, 104), title, font=font(FONT, 32), fill=(150, 180, 214))
    # тень и рамка под экраном
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([AX - 4, AY + 10, AX + AW + 4, AY + AH + 18], radius=52, fill=(0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(22)); im.paste(sh, (0, 0), sh)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([AX - 3, AY - 3, AX + AW + 2, AY + AH + 2], radius=50, outline=(60, 78, 102), width=3)
    return im

def mask():
    m = Image.new("L", (AW, AH), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, AW - 1, AH - 1], radius=46, fill=255)
    return m

def endcard():
    im = grad(); d = ImageDraw.Draw(im)
    lg = logo(300); im.paste(lg, ((W - 300) // 2, 560), lg)
    def ctext(t, f, y, fill):
        w = d.textlength(t, font=f); d.text(((W - w) / 2, y), t, font=f, fill=fill)
    ctext("Скинемся", font(FONTB, 92), 910, (255, 255, 255))
    ctext("Общие траты в поездках — прямо в Telegram", font(FONT, 38), 1030, (170, 196, 226))
    pill = "@skinemsya_app_bot"; f = font(FONTB, 44); w = d.textlength(pill, font=f)
    d.rounded_rectangle([(W - w) / 2 - 36, 1140, (W + w) / 2 + 36, 1230], radius=45, fill=(58, 134, 218))
    ctext(pill, f, 1158, (255, 255, 255))
    return im

def wrap(text, n=34):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > n and cur: lines.append(cur); cur = w
        else: cur = (cur + " " + w).strip()
    if cur: lines.append(cur)
    return lines

def ass_time(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def subtitles(meta, path):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter SemiBold,44,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,0,2,2,60,60,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    for b in meta["beats"]:
        lines = wrap(b["text"])
        chunks = [lines[i:i + 2] for i in range(0, len(lines), 2)]
        total = sum(len(" ".join(c)) for c in chunks)
        t = b["start"]
        for c in chunks:
            d = b["dur"] * len(" ".join(c)) / total
            ev.append(f"Dialogue: 0,{ass_time(t)},{ass_time(t + d - 0.04)},Sub,,0,0,0,," + "\\N".join(c))
            t += d
    open(path, "w", encoding="utf-8").write(head + "\n".join(ev) + "\n")

def cfr_frames(meta, out):
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out): os.remove(f"{out}/{f}")
    seq, n = meta["seq"], int(meta["length"] * FPS)
    j = 0
    for i in range(n):
        t = i / FPS
        while j + 1 < len(seq) and seq[j + 1][0] <= t: j += 1
        os.symlink(f"{meta['dir']}/{seq[j][1]:05d}.jpg", f"{out}/{i:06d}.jpg")
    return n / FPS

def build(vid):
    meta = json.load(open(f"{R}/{vid}.json"))
    bg, mk, ec = f"{R}/{vid}_bg.png", f"{R}/mask.png", f"{R}/endcard.png"
    background(meta["title"]).save(bg); mask().save(mk); endcard().save(ec)
    L = cfr_frames(meta, f"{R}/cfr_{vid}")
    subtitles(meta, f"{R}/{vid}.ass")
    # озвучка
    ins, flt = [], []
    for k, b in enumerate(meta["beats"]):
        ins += ["-i", f"{ROOT}/{os.environ.get('AUDIO', 'voice/out')}/{vid}_{b['i']:02d}.mp3"]
        ms = int(b["start"] * 1000)
        flt.append(f"[{k + 3}:a]aresample=48000,adelay={ms}|{ms}[a{k}]")
    nb = len(meta["beats"])
    total = L + END
    fc = ";".join([
        f"[1:v]format=rgba[app0]", f"[2:v]format=gray,scale={AW}:{AH}[m]", "[app0][m]alphamerge[app]",
        f"[0:v][app]overlay={AX}:{AY}:shortest=1,ass={R}/{vid}.ass,fps={FPS},format=yuv420p,setsar=1[main]",
        f"[{nb + 3}:v]fps={FPS},format=yuv420p,setsar=1,fade=t=in:st=0:d=0.35[end]",
        "[main][end]concat=n=2:v=1:a=0,fade=t=in:st=0:d=0.3[v]",
        *flt,
        "".join(f"[a{k}]" for k in range(nb)) + f"amix=inputs={nb}:normalize=0:dropout_transition=0,apad,atrim=0:{total:.3f},afade=t=out:st={total - 0.6:.3f}:d=0.6[a]",
    ])
    cmd = ["ffmpeg", "-y", "-v", "error",
           "-loop", "1", "-framerate", str(FPS), "-t", f"{L:.3f}", "-i", bg,
           "-framerate", str(FPS), "-i", f"{R}/cfr_{vid}/%06d.jpg",
           "-loop", "1", "-framerate", str(FPS), "-t", f"{L:.3f}", "-i", mk,
           *ins,
           "-loop", "1", "-framerate", str(FPS), "-t", f"{END}", "-i", ec,
           "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", f"{R}/{vid}.mp4"]
    subprocess.run(cmd, check=True)
    print(vid, "done", round(total, 1), "s")

if __name__ == "__main__":
    for vid in sys.argv[1:]: build(vid)
