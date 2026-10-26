# Нейросетевой голос Microsoft (edge-tts), с докачкой: готовые фразы не перегенерируются.
import asyncio, json, os, random
import edge_tts
S = json.load(open("voice/script.json", encoding="utf-8"))
os.makedirs("voice/edge", exist_ok=True)
jobs = [(t, f"voice/edge/{v['id']}_{i:02d}.mp3") for v in S["videos"] for i, t in enumerate(v["beats"])]
async def main():
    todo = [j for j in jobs if not os.path.exists(j[1])]
    for rnd in range(8):
        left = []
        for text, path in todo:
            try:
                t = text if rnd % 2 == 0 else text.replace(" — ", ", ").replace("«", "").replace("»", "")
                await edge_tts.Communicate(t, S["voice"], rate=S["rate"]).save(path)
                if os.path.getsize(path) < 2000: raise RuntimeError("short")
                print("ok", path)
            except Exception as e:
                if os.path.exists(path): os.remove(path)
                print("fail", path, repr(e)[:80]); left.append((text, path))
            await asyncio.sleep(random.uniform(1.5, 3.5))
        todo = left
        print(f"round {rnd}: left {len(todo)}")
        if not todo: break
        await asyncio.sleep(25 + rnd * 10)
    open("voice/edge/STATUS", "w").write(f"left {len(todo)}\n")
asyncio.run(main())
