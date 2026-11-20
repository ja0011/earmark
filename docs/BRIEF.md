Build a complete, polished, animated web app for EARMARK, a fictional product for the UBC 2026 Hackathon (Consumer Apps track, Best use of Arc, QuickNode Streams bounty, ElevenLabs bounty). EARMARK lets you send money that can only be spent on one specific item at one specific store. Any small leftover goes to the person you sent it to. The landing page tells one story: Maya sends her brother Alex $45 for a snow shovel, Alex buys it at the store, and the change comes back to him. Then the working app lets judges do it themselves.

fal.ai makes every photographic and filmed asset (people, products, the store, video). You build everything else in code: layout, the gift card, the fingerprint animation, the smart contract, the store, every flow and every interaction. No placeholder images in the finished site.

Build it as TWO separate websites plus a plugin, in one repo:
```
earmark/
├─ contracts/          the Earmark smart contract (Foundry)
├─ earmark-app/        the Earmark website: landing page, send, gift, store install
├─ earmark-plugin/     the plugin any store installs: a checkout button + a server-side signer
└─ hartwell-supply/    a SEPARATE fictional store website that installs earmark-plugin
   ├─ frontend/        store pages, cart, checkout with the Earmark button
   └─ backend/         the store's own server, with the /earmark/sign route and the store's private key in its own .env
```
Hartwell Supply must only talk to Earmark through earmark-plugin, exactly like any other store would. The store's private key lives only in hartwell-supply/backend/.env, never in earmark-app.

Use nested sessions: one session generates and processes every fal.ai asset, one writes and tests the smart contract, one builds earmark-app and earmark-plugin, one builds hartwell-supply. The site sessions scaffold while the others work and wire each piece in as it lands.

========================================
DESIGN SYSTEM (save to CLAUDE.md)
========================================
Direction: a receipt that keeps a promise. Light, honest, precise. Paper and ink, with one colour that means "locked".

Colours:
- Receipt #F5F2EB (main light background)
- Ink #121212 (all dark text)
- Vault #15171C (dark sections)
- Seal #2F6BFF (the only accent: locks, active states, lines)
- Change #F2B705 (leftover money only, very sparingly)
- Fog #9DA1A8 (muted text on dark)

Type (Google Fonts):
- Display: Bricolage Grotesque 800, line-height 0.92, letter-spacing -0.02em. Hero headline clamp(4rem, 10vw, 10rem).
- Body: Manrope 400/500. Body text 18px minimum, line-height 1.5.
- Data: JetBrains Mono 500 for amounts, addresses, hashes, timers and receipts.
- No text smaller than 15px anywhere.

Stack: React + Vite + TypeScript, Tailwind, GSAP + ScrollTrigger, Lenis smooth scroll (driven from GSAP's ticker), viem for Arc testnet, Foundry for contracts, a small Node/Express backend (store signing, agent, webhooks, calls).

AVOID: gradient text, purple gradients, Inter, Roboto, Arial, Space Grotesk, Instrument Serif, all-caps eyebrow labels above every heading, arrows on every button, identical rounded cards with soft grey shadows, emoji icons, fake statistics, lorem ipsum, generic copy (elevate, unlock, seamless, revolutionize, empower). No real store names, brands or logos. The store is the fictional HARTWELL SUPPLY. Keep copy short and exactly as written below.

========================================
FAL.AI ASSETS (generate first, in this order)
========================================
Use the cheapest model that looks right (Nano Banana for images, Kling for video). For every image, check it before moving on and regenerate anything off-model.

1. MAYA REFERENCE (2k): a woman in her early 30s, warm smile, dark hair in a low bun, grey sweater. Front portrait and full body, neutral studio. Keeps Maya identical in every later shot.
2. ALEX REFERENCE (2k): a man in his early 20s, messy light-brown hair, navy beanie, puffer jacket. Front portrait and full body, neutral studio. Keeps Alex identical in every later shot.
3. THE SHOVEL (2k): a snow shovel, studio product shot, three-quarter view, plain light background, matte black handle, wide steel-blue blade, no logos. Remove the background.
4. HERO FILM (10 seconds, 1080p, 16:9, no audio): start frame = a quiet suburban driveway at dawn after heavy snowfall, a car buried to the windows. "Snow keeps falling softly, the camera slowly pushes in toward the buried car, warm light comes on in the house window. Continuous shot, calm, cinematic."
5. STORY STILLS (3:2, using the Maya and Alex references):
   - Maya on her couch in a warm apartment, looking at her phone, smiling
   - Alex standing on his buried driveway, holding his phone, laughing
   - Alex shoveling snow with the shovel from step 3, breath visible, sunrise
6. HARTWELL SUPPLY (2k, 16:9): the front of a small fictional neighbourhood hardware store in winter, painted sign reading "HARTWELL SUPPLY", warm light inside, snow on the sidewalk.
7. STORE PRODUCTS (square, plain light background, background removed, same light and angle as the shovel): the shovel, an ice scraper, insulated work gloves, a bag of rock salt, a claw hammer, a cordless drill. No logos.

Processing (you, with ffmpeg):
- Convert every image to WebP with responsive sizes.
- Extract the hero film to a WebP frame sequence at 15fps, 1600px wide, quality 72, for scroll scrubbing on a canvas. Keep an MP4 too.

========================================
SMART CONTRACT (Solidity + Foundry, Arc testnet)
========================================
Contract name: Earmark. Holds USDC on Arc. Look up the Arc testnet USDC address in Circle's docs; never hardcode a guess.

- registerStore(address store, address signer): owner only. Saves which key a store signs with.
- createGift(address receiver, address store, bytes32 itemId, uint256 amount, uint64 expiry): pulls USDC from the sender. Saves the gift and its fingerprint = keccak256(sender, receiver, store, itemId, amount, expiry, nonce). Emits GiftCreated.
- redeem(uint256 giftId, uint256 price, bytes32 orderId, bytes storeSignature): only callable by the receiver. Rebuilds the order with EIP-712 and checks the signature came from the store's registered signer. Checks: the item matches, price ≤ amount, the gift isn't expired or used. Pays the store the price. If the leftover is $5 or less, sends it to the receiver. If it's more, sends it back to the sender. Marks the gift used. Emits GiftRedeemed.
- refund(uint256 giftId): after expiry, if unused, sends everything back to the sender. Emits GiftRefunded.
- Tests for every rule: wrong store, wrong item, wrong receiver, forged signature, over price, expired, already used, leftover under $5, leftover over $5, refund.
- Deploy to Arc testnet with a script, and save the address and ABI for the app.

========================================
LANDING PAGE SECTIONS, IN THIS ORDER
========================================
1. LOADER
Full-screen Receipt veil. Centre: a narrow paper receipt printing itself line by line in JetBrains Mono (ITEM: SNOW SHOVEL / STORE: HARTWELL SUPPLY / FOR: ALEX / STATUS: LOCKED). Under it: "Locking it in…". When assets are ready, the receipt tears off along a zigzag edge and the hero begins.

2. HERO: MONEY WITH A PURPOSE
The hero film fills the screen, scrubbed slowly by scroll on a canvas, darkened 35%. Centre-left: "MONEY WITH A PURPOSE." (display, huge, Receipt colour), then "Send money that can only be spent on what you meant it for." (Manrope, 20px). Centre-right: a gift card built in code (not an image): "$45.00" in JetBrains Mono, "Snow shovel · Hartwell Supply · For Alex", and a round Seal-blue lock badge. The card tilts toward the cursor (max 8°), and the lock catches a light glint as the cursor passes over it.
Top bar: "EARMARK" wordmark left; links right: How it works, The rules, The call, Try it.
Two buttons: "Send a gift" (solid Seal) and "See how it works" (outline).

3. THE PROBLEM (Receipt section)
Left: the Maya couch still. Right: a short conversation built in code as text bubbles appearing one at a time as you scroll:
- Maya: "Sent you $45 for a shovel."
- Alex: "Thanks!!"
- Alex (two days later): "…so I got pizza."
Headline under it: "YOU MEANT A SHOVEL." Copy: "Money doesn't remember why you sent it. Earmark does."

4. HOW IT WORKS (dark Vault section, pinned, about 300vh, three beats)
A vertical receipt down the centre that prints a new block for each beat, with the matching still beside it:
- LOCK: "Maya locks $45 for one shovel at one store." The gift card from the hero slides in and the lock snaps shut with a small bounce.
- SHOP: "Alex buys it at Hartwell Supply with one tap." The Hartwell Supply still, with a checkout line printing on the receipt: SNOW SHOVEL ... $39.98.
- CHANGE: "The $5.02 left over goes straight to Alex." The Alex shoveling still. A small stack of Change-yellow coins drops onto the receipt and the total line reads CHANGE TO ALEX ... $5.02.

5. THE RULES (Receipt section)
Headline: "ONLY THIS. ONLY THERE. ONLY THEM."
Three short rows, each with a lock that closes as it enters view:
- "Only this item. The snow shovel, nothing else."
- "Only this store. Hartwell Supply, nowhere else."
- "Only this person. Alex, nobody else."
Then the fingerprint moment: three JetBrains Mono strings (Maya's address, Alex's address, the store's address) and an item line slide toward the centre and merge into one hash that types out character by character, with the caption "One fingerprint. Change anything and it breaks." Hovering the hash shakes it and briefly shows "REJECTED" in Seal.

6. THE CALL (dark Vault section)
Headline: "IT EVEN CALLS." Copy: "Four days left? Earmark calls to remind you, and can buy it for you."
A phone-call card built in code: a round play button, a live waveform from a Web Audio analyser, the caller label ("Earmark") and the transcript typing in sync with a short recorded sample of the ElevenLabs agent saying: "Hey Alex, your $45 shovel gift expires in four days. Want me to buy it for you?" then Alex: "Yeah, do it." Nothing autoplays; the first click starts it.

7. TRY IT (Receipt section)
Headline: "SEND ONE." Copy: "It's live on Arc testnet. Lock a gift, then buy it."
Two large buttons into the app: "Send a gift" and "Open Hartwell Supply".

8. FOOTER
A long receipt tearing upward as you reach the bottom. On it: "Built on Arc with USDC." Nav links, "© 2026 Earmark", and "Back to the top".

========================================
THE WORKING APP
========================================
A. SEND (/send)
A text box: "Who's it for, and what should it buy?" with the example "Send Alex $45 for a snow shovel at Hartwell Supply." The agent (backend, Claude API) reads it, looks up the store's address and the item ID and price from the store catalogue, and Alex's address from contacts, then shows a review card: item, store, receiver, amount, expiry (30 days), and the fingerprint. "Lock it" approves USDC and calls createGift on Arc. Show the transaction with a link to the Arc testnet explorer.

B. RECEIVE (/gift/:id)
Alex's view of the gift card: amount, item, store, a countdown to expiry, and "Shop at Hartwell Supply". Status updates live (Locked, Spent, Refunded).

C. EARMARK PLUGIN (earmark-plugin/)
Two parts, published as one package the store imports:
- EarmarkPayButton (React component): props store, cart, signUrl, onPaid. On click it opens a small Earmark window where the shopper signs in with a WebAuthn passkey (Face ID or Touch ID), sees their gifts that work at this store, and picks one. If the cart doesn't match the gift's item, it shows "This gift only buys the snow shovel." and stops. Otherwise it POSTs the gift and cart to the store's signUrl, gets back the signed order, and calls redeem on the contract from the shopper's wallet.
- earmarkSigner (Node helper): takes the store's private key from the store's .env, looks up the real price server-side (never trust the browser's price), builds the EIP-712 Order (giftId, itemId, price, orderId, receiver) and signs it.
The EIP-712 domain, Order type and field order must match the contract exactly. Write a test that signs an order with earmarkSigner and redeems it against a local contract before building any UI.

D. HARTWELL SUPPLY (hartwell-supply/), the separate store website
Its own look (deep pine #2A2F24 header, warm off-white #FBFAF7 background, Bricolage Grotesque for the store name), its own URL, its own backend. A store page with the six products, a cart and a checkout. The checkout has two options: "Pay with Earmark gift" (the plugin button) and "Pay with card" (disabled, for show). The backend has one route, POST /earmark/sign, using earmarkSigner. After payment, show a printed receipt: SNOW SHOVEL ... $39.98 / CHANGE TO ALEX ... $5.02, with the transaction link.
Demo moment: adding the drill and trying to pay with the gift is rejected on screen with "This gift only buys the snow shovel."

E. STORE INSTALL (/stores in earmark-app)
A simple screen showing how a store owner adds Earmark, styled like an app install flow:
1. "Connect your store": store name and website.
2. "Create your store key": generates a key pair, shows the public address, and gives a one-time download of the private key for the store's .env. Registers the store in the contract (registerStore).
3. "Pick your products": a list of the store's products with toggles, linking each one to an Earmark item ID.
4. "Add the button": copy-paste code snippets for the checkout button and the signer route.
Headline: "ADD EARMARK IN UNDER AN HOUR." Copy: "A button for your checkout. A signer for your server. That's it."

F. NOTIFICATIONS (QuickNode Streams)
One Stream on Arc testnet filtered to the Earmark contract's GiftCreated, GiftRedeemed and GiftRefunded events, delivering to the backend's /webhooks/quicknode. The backend pushes in-app notifications: "Maya sent you $45 for a snow shovel." / "Alex bought the shovel. $5.02 went back to him."

G. THE REMINDER CALL (ElevenLabs Agents + Twilio)
A backend job that, at 7 days and 4 days before expiry, has an ElevenLabs voice agent call the receiver's registered number with the script from section 6. If they say yes, the agent requests a purchase, and the app shows a confirm prompt the receiver approves with their passkey before redeem runs. A "Call me now" button on the gift page triggers it for the demo.

Use mocks only for things that can't be real in a demo, and keep every key in .env with a .env.example.

========================================
README (for Devpost)
========================================
Write README.md with: what it does, architecture diagram, the contract address on Arc testnet, how it uses Arc and USDC, the EIP-712 order format, the fingerprint, safety rules, the QuickNode Stream configuration (network, dataset, filter logic, destination, and why), the ElevenLabs products used and how, how a store installs earmark-plugin, and setup steps for all three parts (contract, earmark-app, hartwell-supply).

========================================
QUALITY BAR
========================================
- Respect prefers-reduced-motion: no pinning or scrubbing, show key frames as stills, everything still usable.
- Stop rendering canvases when they are off screen. Pause the hero film when off screen or the tab is hidden.
- Fully responsive. On mobile the hero copy sits above the gift card, the how-it-works beats stack in one column, and the store and checkout work by tapping.
- Visible keyboard focus and accessible names on every control.
- When finished, run the contract tests and the plugin signing test, run both dev servers (earmark-app and hartwell-supply), do one full gift flow end to end on Arc testnet, screenshot every section and every screen of both sites at 1440x900 and 390x844, and fix anything that looks broken, overlapping or unreadable before you stop.
