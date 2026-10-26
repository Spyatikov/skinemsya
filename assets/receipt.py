# Фото чека для демонстрации скана (вымышленное кафе, вымышленные позиции)
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random
random.seed(3)
mono = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
monob = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
W, H = 620, 1150
p = Image.new("RGB", (W, H), (246, 244, 236))
d = ImageDraw.Draw(p)
f, fb, fbig = ImageFont.truetype(mono, 24), ImageFont.truetype(monob, 24), ImageFont.truetype(monob, 40)
y = 40
def c(t, font=f):
    global y; w = d.textlength(t, font=font); d.text(((W - w) / 2, y), t, fill=(40, 40, 40), font=font); y += font.size + 12
def row(a, b, font=f):
    global y; d.text((36, y), a, fill=(35, 35, 35), font=font); w = d.textlength(b, font=font); d.text((W - 36 - w, y), b, fill=(35, 35, 35), font=font); y += font.size + 14
c("WARUNG PANTAI", fbig); c("Jl. Pantai 21, Bali"); y += 6
c("-" * 40); row("Table 7", "15/10/2026 19:42"); row("Cashier: Wayan", "#004127"); c("-" * 40)
for a, b in [("2 x Nasi Goreng Ayam", "130.000"), ("1 x Mie Goreng", "60.000"), ("1 x Sate Lilit", "85.000"),
             ("1 x Gado-Gado", "55.000"), ("3 x Bintang Large", "135.000"), ("2 x Es Kelapa Muda", "70.000")]:
    row(a, b)
c("-" * 40); row("Subtotal", "535.000"); row("Service 5%", "26.750"); row("PB1 10%", "56.175"); row("Rounding", "2.675")
c("=" * 40); row("TOTAL", "IDR 620.600", fb); c("=" * 40)
row("CARD", "620.600"); y += 20; c("Terima kasih!"); c("Thank you, come again :)")
p = p.filter(ImageFilter.GaussianBlur(0.6))
# стол
bg = Image.new("RGB", (900, 1400), (121, 85, 58)); bd = ImageDraw.Draw(bg)
for i in range(0, 1400, 7):
    t = random.randint(-14, 14); bd.line([(0, i), (900, i + random.randint(-6, 6))], fill=(121 + t, 85 + t, 58 + t), width=6)
bg = bg.filter(ImageFilter.GaussianBlur(2))
sh = Image.new("RGBA", (W + 40, H + 40), (0, 0, 0, 0)); ImageDraw.Draw(sh).rectangle([20, 20, W + 20, H + 20], fill=(0, 0, 0, 120))
sh = sh.filter(ImageFilter.GaussianBlur(14))
pr = p.convert("RGBA").rotate(-3, expand=True, resample=Image.BICUBIC); shr = sh.rotate(-3, expand=True)
bg.paste(shr, (120, 125), shr); bg.paste(pr, (130, 110), pr)
bg.convert("RGB").save("/home/claude/promo/assets/receipt.jpg", quality=88)
