# Синтез озвучки для промо-роликов: по одному mp3 на каждую фразу.
# Порядок: нейросетевой голос Microsoft (edge-tts) → Piper (офлайн-модель) → Google TTS.
import asyncio, json, os, subprocess, sys, traceback, urllib.request

S = json.load(open("voice/script.json", encoding="utf-8"))
os.makedirs("voice/out", exist_ok=True)
jobs = [(t, f"voice/out/{v['id']}_{i:02d}.mp3") for v in S["videos"] for i, t in enumerate(v["beats"])]
only = os.environ.get("ENGINE", "")

async def edge():
    import edge_tts
    print("edge-tts", getattr(edge_tts, "__version__", "?"))
    for text, path in jobs:
        for attempt in range(6):
            try:
                t = text if attempt < 2 else text.replace(" — ", ", ").replace("«", "").replace("»", "")
                await edge_tts.Communicate(t, S["voice"], rate=S["rate"]).save(path)
                await asyncio.sleep(1.2)
                print("edge ok", path); break
            except Exception as e:
                print("retry", path, repr(e)); await asyncio.sleep(6 + attempt * 4)
        else:
            raise RuntimeError("edge failed")

def piper():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "piper-tts"], check=True)
    base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx"
    for suf in ["", ".json"]:
        urllib.request.urlretrieve(base + suf, "voice.onnx" + suf)
    for text, path in jobs:
        wav = path.replace(".mp3", ".wav")
        r = subprocess.run([sys.executable, "-m", "piper", "-m", "voice.onnx", "-f", wav, "--", text], capture_output=True, text=True)
        if r.returncode:  # старый интерфейс: текст со стандартного ввода
            print(r.stderr[-500:])
            subprocess.run(["piper", "-m", "voice.onnx", "-f", wav], input=text.encode(), check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-b:a", "160k", path], check=True)
        os.remove(wav); print("piper ok", path)

def gtts():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "gTTS"], check=True)
    from gtts import gTTS
    for text, path in jobs:
        gTTS(text, lang="ru").save(path); print("gtts ok", path)

for name, fn in [("edge", lambda: asyncio.run(edge())), ("piper", piper), ("gtts", gtts)]:
    if only and name != only: continue
    try:
        fn(); open("voice/out/ENGINE", "w").write(name); print("DONE with", name); break
    except Exception:
        print(f"--- {name} failed ---"); traceback.print_exc()
else:
    sys.exit(1)
