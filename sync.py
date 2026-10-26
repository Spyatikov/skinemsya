# Находит в записи розовые вспышки (начало и конец сценария) → точные времена в файле видео
import json, subprocess, sys
def flashes(video):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", "crop=40:40:430:760,scale=1:1,format=rgb24", "-f", "rawvideo", "-"], capture_output=True).stdout
    fps = 25
    mag = [out[i] > 200 and out[i + 1] < 80 and out[i + 2] > 200 for i in range(0, len(out) - 2, 3)]
    runs, cur = [], None
    for k, m in enumerate(mag):
        if m and cur is None: cur = k
        if not m and cur is not None: runs.append((cur / fps, k / fps)); cur = None
    if cur is not None: runs.append((cur / fps, len(mag) / fps))
    return runs
if __name__ == "__main__":
    print(flashes(sys.argv[1]))
