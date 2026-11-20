#!/usr/bin/env bash
# Hero film -> WebP frame sequence (15fps, 1600x900, q72), H.264 MP4 (faststart, no audio), poster.
# Usage: scripts/assets/process_hero.sh [assets-src/hero.mp4]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${1:-$ROOT/assets-src/hero.mp4}"
OUT="$ROOT/earmark-app/public/media/hero"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# center-crop to exact 16:9 (Kling 2.5 turbo pro delivers 1928x1072), then 1600x900
VF="crop='trunc(ih*16/9/2)*2':ih,scale=1600:900:flags=lanczos"

rm -rf "$OUT/frames" && mkdir -p "$OUT/frames"
ffmpeg -v error -y -i "$SRC" -vf "fps=15,$VF" -t 10 "$TMP/f%04d.png"
python3 -I - "$TMP" "$OUT/frames" <<'PY'
import sys, glob, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(src, 'f*.png')))
for f in files:
    Image.open(f).convert('RGB').save(os.path.join(dst, os.path.basename(f)[:-4] + '.webp'), 'WEBP', quality=72, method=4)
Image.open(files[0]).convert('RGB').save(os.path.join(dst, '..', 'poster.webp'), 'WEBP', quality=80, method=6)
print(len(files), 'frames')
PY
ffmpeg -v error -y -i "$SRC" -vf "$VF" -an -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -profile:v high -movflags +faststart "$OUT/hero.mp4"
ls "$OUT/frames" | wc -l
du -sh "$OUT/frames" "$OUT/hero.mp4" "$OUT/poster.webp"
