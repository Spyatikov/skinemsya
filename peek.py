import json, sys
from PIL import Image
for vid in sys.argv[1:]:
    m = json.load(open(f"render/{vid}.json")); seq = m["seq"]
    ts = []
    for b in m["beats"]: ts += [b["start"] + b["dur"] * 0.35, b["start"] + b["dur"] * 0.95]
    ims = []
    for t in ts:
        k = max([s for s in seq if s[0] <= t], key=lambda s: s[0])[1]
        ims.append(Image.open(f"{m['dir']}/{k:05d}.jpg").resize((225, 390)))
    out = Image.new("RGB", (225 * len(ims), 390), "white")
    for i, im in enumerate(ims): out.paste(im, (225 * i, 0))
    out.save(f"render/peek_{vid}.png")
