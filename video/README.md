# Earmark demo video

`earmark-demo.mp4`: 1920x1080, 30 fps, ~56 s, H.264 + AAC, captions burned in. Captions also in `earmark-demo-captions.srt`.

## Re-render (one command)

```sh
cd video && npm install && npx playwright install chromium && npm run render
```

Needs `ffmpeg` (with libx264) on the PATH. Frames go to a temp folder (`FRAMES_DIR` to override); a contact sheet (one frame every 2 s) is written next to them.

## What is what

| File | Role |
|------|------|
| `stage.html` | The whole video as one paused GSAP timeline. `window.seek(t)` sets the time and the caption. Open it in a browser and call `seek(12)` in the console to preview a moment. |
| `render.mjs` | Seeks the stage frame by frame in headless Chromium, mixes the audio (voice at its times, music ~18 dB under, SFX at the stage's `window.CUES`), encodes with `+faststart`, writes the `.srt`. |
| `make-audio.mjs` | ElevenLabs voice (one TTS-with-timestamps request per line), sound effects and music into `audio/`, then lays the lines out on the timeline in `voice.json` / `voice.js`. Only generates missing files; `--force` regenerates (costs credits). Needs `ELEVENLABS_API_KEY` in the repo-root `.env`. |
| `capture.mjs` | Playwright captures of the real UI into `captures/`. Spends one real testnet gift; only needed to refresh the screenshots. |
| `captures/` | The screenshots used by the stage (2x), `stores-rects.js` (positions of the steps and snippets on /stores) and `tx.json` (the transactions behind them). |

Scene timing follows the voice: change the gaps in `make-audio.mjs` (`GAPS`, `END_HOLD`), run `npm run audio`, then `npm run render`.
