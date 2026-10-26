# Синтез озвучки для промо-роликов: по одному mp3 на каждую фразу.
# Основной голос — нейросетевой Microsoft (edge-tts), запасной — Piper (офлайн-модель).
import asyncio, json, os, subprocess, sys, urllib.request

S = json.load(open("voice/script.json", encoding="utf-8"))
os.makedirs("voice/out", exist_ok=True)
jobs = [(t, f"voice/out/{v['id']}_{i:02d}.mp3") for v in S["videos"] for i, t in enumerate(v["beats"])]

async def edge():
    import edge_tts
    for text, path in jobs:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(text, S["voice"], rate=S["rate"]).save(path)
                print("edge ok", path); break
            except Exception as e:
                print("retry", path, repr(e)); await asyncio.sleep(4)
        else:
            raise RuntimeError("edge failed")

def piper():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "piper-tts"], check=True)
    base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx"
    for suf in ["", ".json"]:
        urllib.request.urlretrieve(base + suf, "voice.onnx" + suf)
    for text, path in jobs:
        wav = path.replace(".mp3", ".wav")
        subprocess.run(["piper", "-m", "voice.onnx", "-f", wav], input=text.encode(), check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-b:a", "160k", path], check=True)
        os.remove(wav); print("piper ok", path)
    open("voice/out/ENGINE", "w").write("piper")

try:
    asyncio.run(edge())
    open("voice/out/ENGINE", "w").write("edge")
except Exception as e:
    print("edge-tts unavailable:", e, "— switching to piper")
    piper()
