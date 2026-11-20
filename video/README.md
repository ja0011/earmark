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
| `clips.mjs` | fal.ai motion clips (Kling 2.5 turbo pro image-to-video, 5 s, no audio). `starts` composes the present start frame locally and makes 3 nano-banana-2 start frames; `videos` makes the clips (both paid, logged in `assets-src/log.md`, raw files in `assets-src/video/`, gitignored); `frames` (local ffmpeg, free) cuts the used part of each clip into `clips/<name>/f001.jpg…` at native 24 fps and writes `clips.js`. |
| `clips/` | The four clips as JPEG sequences: `present` (S1, ribbon off and lid lifts, receipt rises out of the glow), `usecase` (S2, behind the receipt cards under a cream wash), `coins` (S3, change beat, the change line is printed onto the blank receipt in the stage), `store` (opens S4, then stays as a dark backdrop). The stage blends neighbouring frames for slow motion and `seek()` waits for each frame to decode. |
| `capture.mjs` | Playwright captures of the real UI into `captures/`. Spends one real testnet gift; only needed to refresh the screenshots. |
| `captures/` | The screenshots used by the stage (2x), `stores-rects.js` (positions of the steps and snippets on /stores) and `tx.json` (the transactions behind them). |

To rebuild the clip frames from the raw clips: `node clips.mjs frames` (needs `assets-src/video/*-clip.mp4`; the frames already in `clips/` are enough to render).

Scene timing follows the voice: change the gaps in `make-audio.mjs` (`GAPS`, `END_HOLD`), run `npm run audio`, then `npm run render`.
