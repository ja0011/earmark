#!/usr/bin/env python3
"""Encode one source image to <name>-640/1280/2000.webp in one or more media dirs.

Usage: python3 -I scripts/assets/process_image.py <src.png> <name> [--aspect W:H] <destDir> [<destDir> ...]
--aspect center-crops to an exact ratio first (e.g. 3:2, 16:9).
Cutouts (RGBA) keep alpha. Uses Pillow's libwebp (the local ffmpeg build has no libwebp encoder).
Run scripts/assets/build_manifest.py afterwards to refresh manifest.json.
"""
import os
import sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WIDTHS = (640, 1280, 2000)


def main():
    src, name, *dests = sys.argv[1:]
    aspect = None
    if dests and dests[0] == '--aspect':
        aw, ah = map(int, dests[1].split(':'))
        aspect, dests = aw / ah, dests[2:]
    im = Image.open(src)
    if aspect:
        if im.width / im.height > aspect:
            w = round(im.height * aspect)
            x = (im.width - w) // 2
            im = im.crop((x, 0, x + w, im.height))
        else:
            h = round(im.width / aspect)
            y = (im.height - h) // 2
            im = im.crop((0, y, im.width, y + h))
    alpha = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
    im = im.convert('RGBA' if alpha else 'RGB')
    files = []
    for w in WIDTHS:
        h = round(im.height * w / im.width)
        out = im.resize((w, h), Image.LANCZOS) if w != im.width else im
        for d in dests:
            dd = os.path.join(ROOT, d)
            os.makedirs(os.path.dirname(os.path.join(dd, name)), exist_ok=True)
            p = os.path.join(dd, f'{name}-{w}.webp')
            out.save(p, 'WEBP', quality=82 if not alpha else 86, method=6, alpha_quality=95)
        files.append({'width': w, 'height': h, 'src': f'/media/{name}-{w}.webp'})
    print(name, 'alpha' if alpha else 'opaque', [(x['width'], x['height']) for x in files], '->', dests)


if __name__ == '__main__':
    main()
