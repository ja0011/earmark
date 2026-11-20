# Motion shots for the Earmark demo video

Ten 5-second clips, 1920×1080, 30 fps, no audio. Product only: no people, hands, faces, text or logos. Made on fal.ai (Kling 2.5 Turbo Pro), $4.79 in total including retries. The prompts are in `scripts/assets/jobs/shots/`.

| File | What it shows | Use it for (voiceover line) |
|---|---|---|
| `01-lock.mp4` | Blue padlock on cream, shackle clicks shut | "Earmark fixes that. It locks money…" |
| `02-receipt-printing.mp4` | Blank receipt feeding out of a white printer | "Check the details, and lock it in." / any receipt moment |
| `03-change-coins.mp4` | Gold coins drop beside a blank receipt | "…the change goes straight to them." |
| `04-phone-notification.mp4` | Generic phone on cream, screen glows blue | "They get a notification…" |
| `05-store-counter.mp4` | Shopping bag with blue tag beside a card terminal | "For stores, it's a button at checkout…" |
| `06-gift.mp4` | White gift box with blue bow on a turntable | Opening line, or "it's not just gifts" |
| `07-textbook.mp4` | Plain textbook tied with ribbon and blank tag | Use case: a student's textbook |
| `08-blankets.mp4` | Folded blankets with ribbon and blank tag | "Donate to a shelter, and know it buys blankets." |
| `09-groceries.mp4` | Kraft box of produce with a blue bow | "Send groceries to family." |
| `10-team-books.mp4` | Three plain books tied with blue ribbon | "Give your team a learning budget." |

Retries (first takes rejected): coins had garbled text on the receipt; the phone looked like a real branded phone with an interface; the team books had garbled titles on the spines. Each was redone from a clean start image (image-to-video).

To regenerate a shot: `scripts/assets/make-shots.sh <name>` (text-to-video), or see `assets-src/log.md` for the exact request of each take.
