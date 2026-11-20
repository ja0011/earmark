# EARMARK

Send money that can only be spent on one specific item at one specific store. Small leftover (≤ $5) goes to the receiver.
UBC 2026 Hackathon: Consumer Apps, Best use of Arc, QuickNode Streams, ElevenLabs.

The full product brief is `docs/BRIEF.md`. Shared interfaces between the parts are in `docs/INTERFACES.md`. Read both before changing anything.

## Repo layout

```
contracts/          Foundry. Earmark.sol, tests, deploy script, deployments/, abi/
earmark-app/        Earmark website (Vite+React+TS) + server/ (Express). Landing, /send, /gift/:id, /pay (plugin popup), /stores
earmark-plugin/     Package stores install: earmark-plugin (shared), earmark-plugin/react (EarmarkPayButton), earmark-plugin/server (earmarkSigner)
hartwell-supply/    SEPARATE fictional store. frontend/ (Vite) + backend/ (Express, POST /earmark/sign, store key in its own .env)
assets-src/         Raw fal.ai / ElevenLabs outputs (not served)
```

Hartwell Supply talks to Earmark ONLY through earmark-plugin. The store private key lives ONLY in `hartwell-supply/backend/.env`.

## Design system: "a receipt that keeps a promise"

Light, honest, precise. Paper and ink, with one colour that means "locked".

| Token  | Hex      | Use |
|--------|----------|-----|
| receipt | #F5F2EB | main light background |
| ink    | #121212  | all dark text |
| vault  | #15171C  | dark sections |
| seal   | #2F6BFF  | the ONLY accent: locks, active states, lines |
| change | #F2B705  | leftover money only, very sparingly |
| fog    | #9DA1A8  | muted text on dark |

Type (Google Fonts):
- Display: Bricolage Grotesque 800, line-height 0.92, letter-spacing -0.02em. Hero headline `clamp(4rem, 10vw, 10rem)`.
- Body: Manrope 400/500. Body text 18px minimum, line-height 1.5.
- Data: JetBrains Mono 500 for amounts, addresses, hashes, timers, receipts.
- No text smaller than 15px anywhere.

Stack: React + Vite + TypeScript, Tailwind, GSAP + ScrollTrigger, Lenis (driven from GSAP's ticker), viem (Arc testnet), Foundry, Node/Express.

AVOID: gradient text, purple gradients, Inter, Roboto, Arial, Space Grotesk, Instrument Serif, all-caps eyebrow labels above every heading, arrows on every button, identical rounded cards with soft grey shadows, emoji icons, fake statistics, lorem ipsum, generic copy (elevate, unlock, seamless, revolutionize, empower). No real store names, brands or logos. Keep copy short and exactly as written in the brief.

Hartwell Supply has its own look: deep pine #2A2F24 header, warm off-white #FBFAF7 background, Bricolage Grotesque for the store name.

## Quality bar

- prefers-reduced-motion: no pinning or scrubbing, key frames as stills, everything usable.
- Stop rendering canvases off screen. Pause the hero film off screen or when the tab is hidden.
- Fully responsive (1440x900 and 390x844 are the check sizes).
- Visible keyboard focus and accessible names on every control.
- Secrets only in `.env` files (gitignored), each with a `.env.example`.
