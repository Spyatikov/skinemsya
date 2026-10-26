# Нарисованные аватарки участников (вместо фото из Telegram) → data URI в mock.js
import base64, json
people = {
  1: dict(bg="#5b8def", skin="#f1c7a3", hair="#3b2a20", style="short", shirt="#1f3a63"),
  2: dict(bg="#f2a65a", skin="#f6d2b5", hair="#7a3e1d", style="long", shirt="#c2412d"),
  3: dict(bg="#4fbfc6", skin="#e9b896", hair="#1f1a17", style="buzz", shirt="#2d5d3b"),
  4: dict(bg="#ee7aae", skin="#f7d7c1", hair="#e3c06b", style="bob", shirt="#6b3fa0"),
  5: dict(bg="#7fc77f", skin="#d9a27f", hair="#2b211b", style="short", shirt="#384a8c"),
  6: dict(bg="#a695e7", skin="#f3cdb0", hair="#4a2a1a", style="long", shirt="#2f7f7a"),
}
def svg(p):
    hair_back = {"long": f'<path d="M26 52c0-20 10-32 24-32s24 12 24 32v30H26z" fill="{p["hair"]}"/>',
                 "bob": f'<path d="M27 50c0-18 10-29 23-29s23 11 23 29v16H27z" fill="{p["hair"]}"/>'}.get(p["style"], "")
    hair_top = {"short": f'<path d="M33 44c0-13 8-20 17-20s17 7 17 20c-5-6-10-8-17-8s-12 2-17 8z" fill="{p["hair"]}"/>',
                "buzz": f'<path d="M34 42c1-11 8-16 16-16s15 5 16 16c-5-4-10-5-16-5s-11 1-16 5z" fill="{p["hair"]}"/>',
                "long": f'<path d="M32 46c0-14 8-22 18-22s18 8 18 22c-6-8-12-10-18-10s-12 2-18 10z" fill="{p["hair"]}"/>',
                "bob": f'<path d="M32 46c0-14 8-22 18-22s18 8 18 22c-4-9-11-11-18-11s-14 2-18 11z" fill="{p["hair"]}"/>'}[p["style"]]
    s = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="{p["bg"]}"/>{hair_back}
<path d="M18 100c2-18 15-27 32-27s30 9 32 27z" fill="{p["shirt"]}"/><rect x="44" y="60" width="12" height="15" rx="5" fill="{p["skin"]}"/>
<ellipse cx="50" cy="47" rx="16" ry="18" fill="{p["skin"]}"/>{hair_top}
<circle cx="44" cy="49" r="1.8" fill="#2a2a2a"/><circle cx="56" cy="49" r="1.8" fill="#2a2a2a"/><path d="M45 56q5 4 10 0" stroke="#9a5a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>'''
    return "data:image/svg+xml;base64," + base64.b64encode(s.encode()).decode()
print(json.dumps({k: svg(v) for k, v in people.items()}))
