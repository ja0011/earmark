# EARMARK

**Money with a purpose.** Send money that can only be spent on what you meant it for.

Maya sends her brother Alex $45 for a snow shovel. The money is locked in USDC on Arc and can only buy that shovel, at Hartwell Supply, for Alex. Alex taps "Pay with Earmark gift" at checkout, the store gets $39.98, and the $5.02 change goes straight to Alex. If he tries to buy a drill with it, it says no. If he forgets, Earmark calls him.

**Try it live:** [Earmark](https://earmark-production-366133a5.up.railway.app) · [Hartwell Supply](https://hartwell-production.up.railway.app) (Arc testnet; live prices are about 1/100 of the story, so the demo gift is $0.45 and the shovel $0.40).

Built for UBC Hackathon 2026: Consumer Apps · Best use of Arc · QuickNode Streams · ElevenLabs.

## What's in the repo

```
earmark/
├─ contracts/          Earmark.sol (Foundry): gifts, EIP-712 store signatures, change split, refunds
├─ earmark-app/        The Earmark website + server
│  ├─ src/             landing page, /send, /gift/:id, /pay (checkout popup), /stores (store install)
│  └─ server/          Claude send agent, QuickNode webhook, ElevenLabs calls, notifications (SSE)
├─ earmark-plugin/     What any store installs: EarmarkPayButton (React) + earmarkSigner (Node)
└─ hartwell-supply/    A separate fictional store that installs earmark-plugin
   ├─ frontend/        store, cart, checkout
   └─ backend/         POST /earmark/sign, with the store's private key in its own .env
```

## Architecture

```
  Maya (browser)                       Alex (browser)                     Hartwell Supply
  earmark-app /send                    earmark-app /gift/:id              hartwell-supply/frontend
        │  "Send Alex $45 for a             │  live status, countdown,             │  cart → checkout
        │   snow shovel at Hartwell…"       │  "Call me now"                       │  <EarmarkPayButton/>
        ▼                                   │                                      │ opens popup
  earmark-app/server ──Claude API──┐        │                                      ▼
   tools: contacts, store,         │        │                       earmark-app /pay (Earmark popup)
   catalogue (GET /earmark/catalog)│        │                        passkey → pick gift → item check
        │                                   │                                      │ POST cart+gift
        │ review card + fingerprint         │                                      ▼
        ▼                                   │                       hartwell-supply/backend
  passkey wallet: approve + createGift      │                        earmarkSigner: real price from the
        │                                   │                        store's own catalogue, EIP-712 sign
        ▼                                   ▼                                      │ signed Order
  ┌──────────────────────────── Arc testnet ──────────────────────────────┐        │
  │ Earmark.sol holds USDC   createGift ─ redeem(giftId, price, orderId, sig) ◄─────┘ (from Alex's wallet)
  │ events: GiftCreated · GiftRedeemed · GiftRefunded                      │
  └───────────────┬────────────────────────────────────────────────────────┘
                  │ QuickNode Stream (filtered to the 3 events)
                  ▼
  earmark-app/server POST /webhooks/quicknode ──SSE──► "Maya sent you $45 for a snow shovel."
                  │                                    "Alex bought the shovel. $5.02 went back to him."
                  └─ reminder job (7 & 4 days before expiry) ──► ElevenLabs agent call (phone via Twilio, or in-browser)
```

## Contract on Arc testnet

| | |
|---|---|
| Earmark | `0x9d91F4ee5FfAd6A31d662801B695514770C4D0BD` ([explorer](https://explorer.testnet.arc.io/address/0x9d91F4ee5FfAd6A31d662801B695514770C4D0BD)) |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000` (6 decimals, from Circle's USDC address list) |
| Chain | Arc testnet, chainId `5042002`, RPC `https://rpc.testnet.arc.io` |

The deployed address is also in `contracts/deployments/arc-testnet.json`, which every part reads at runtime.

## How it uses Arc and USDC

- **The gift is real USDC.** `createGift` pulls USDC from the sender into the contract. Nothing is an IOU or a points balance.
- **Gas is USDC too.** Arc's native gas token is USDC, so a person only ever holds one asset: the same dollars pay for the gift and for the transaction. No one has to buy a gas token to send $45.
- **Fast finality** makes checkout feel like a card tap: the store sees `GiftRedeemed` before the receipt prints.
- **Dollar amounts stay dollars.** Prices, gifts and change are 6-decimal USDC, so $39.98 is `39980000` everywhere: contract, signer, receipt.

## Safety rules (enforced on chain)

| Rule | How |
|---|---|
| Only this item | The store signs an Order for an `itemId`; the contract rebuilds the Order with the gift's stored `itemId`, so a signature for any other item fails. |
| Only this store | The signature must recover to the signer registered for the gift's store (`registerStore`, owner only). |
| Only this person | Only the gift's `receiver` can call `redeem`, and the receiver is also inside the signed Order. |
| Price can't be inflated | `price ≤ amount`, and the price is signed by the store's server from its own catalogue. The browser's price is never trusted. |
| One use | The gift is marked Spent, and every `orderId` can be used once. |
| Expiry | After 30 days an unused gift can be refunded to the sender, in full. |
| Change | Leftover of **$10 or less** goes to the receiver; anything more goes back to the sender. (The brief said $5, but the story's own leftover is $5.02, so the limit is $10 and the story works as told.) |

`forge test`: 34 tests, including wrong store, wrong item, wrong receiver, forged signature, over price, expired, already used, reused orderId, change under and over the limit, refund, and a 1000-run fuzz of the change split.

## The fingerprint

Every gift has one hash that binds everything about it:

```solidity
fingerprint = keccak256(abi.encode(sender, receiver, store, itemId, amount, expiry, nonce))   // nonce == giftId
```

It's emitted in `GiftCreated`, shown on the review card before Maya locks the gift, and animated on the landing page. Change any field and the hash no longer matches.

## EIP-712 order format

```
domain = { name: "Earmark", version: "1", chainId: 5042002, verifyingContract: <Earmark> }
Order(uint256 giftId, bytes32 itemId, uint256 price, bytes32 orderId, address receiver)
itemId = keccak256("hartwell-supply:<sku>")       // e.g. hartwell-supply:snow-shovel
```

`earmarkSigner` (earmark-plugin/server) builds this with viem, and `Earmark.sol` hashes it with OpenZeppelin's `EIP712`. Both are tested against each other: `earmark-plugin/test/sign-and-redeem.test.ts` signs with `earmarkSigner` and redeems on a local anvil chain, and `test_HashOrder_MatchesManualEip712` checks the digest by hand.

## QuickNode Streams

| Setting | Value |
|---|---|
| Network | Arc testnet |
| Dataset | Receipts (block receipts with logs) |
| Start | the contract's deploy block, then follow the chain head |
| Filter | [`earmark-app/server/quicknode/filter.js`](earmark-app/server/quicknode/filter.js): keeps only logs from the Earmark address whose topic0 is `GiftCreated`, `GiftRedeemed` or `GiftRefunded`, decodes them, and returns `null` for every other block |
| Destination | Webhook `POST https://<earmark-server>/webhooks/quicknode`, verified with the Stream's security token (`QUICKNODE_STREAM_TOKEN`) |

**Why:** notifications must follow what actually happened on chain, not what the app thinks it did. Maya's tab, Alex's phone and the store all learn about a gift from the same filtered event stream, even if the transaction was sent from somewhere else (the store popup, the voice agent's purchase). Filtering in the Stream means the server receives a handful of small, already-decoded payloads instead of every block. The server dedupes by `txHash:logIndex` and pushes notifications over SSE. Without a Stream configured (local dev), it falls back to a viem log watcher so the demo still works. Full config: [`stream-config.md`](earmark-app/server/quicknode/stream-config.md).

## ElevenLabs

- **ElevenLabs Agents:** "Earmark reminder" is a conversational voice agent with dynamic variables (`receiver_name`, `amount`, `item`, `days_left`, `gift_id`, `channel`). It says *"Hey Alex, your $45 shovel gift expires in four days. Want me to buy it for you?"* If Alex says yes, it calls a tool that creates a purchase request. The agent never moves money: Alex approves in the app with his passkey, and only then does `redeem` run.
  - **In the browser** ("Call me now" on the gift page) via `@elevenlabs/client`, with a short-lived conversation token minted by the server, so the key never reaches the browser. The tool is a client tool, `request_purchase_in_app`.
  - **On the phone** via ElevenLabs' Twilio integration (`/v1/convai/twilio/outbound-call`). A reminder job calls 7 and 4 days before expiry, and the tool is a server webhook, `request_purchase`.
- **Text to Speech with timestamps:** the call sample on the landing page was generated with ElevenLabs TTS. Its character alignment drives the transcript typing in sync with the audio, and a Web Audio analyser draws the waveform.

Agent setup: [`earmark-app/server/elevenlabs/agent-config.md`](earmark-app/server/elevenlabs/agent-config.md).

## How a store installs Earmark

The `/stores` page in earmark-app walks through it. In code it's two pieces:

```tsx
// checkout page
import { EarmarkPayButton } from 'earmark-plugin/react'

<EarmarkPayButton
  store="0xYourStoreAddress"
  cart={cart}                                   // [{ sku, qty, name, price }]
  signUrl="https://your-store.example/earmark/sign"
  onPaid={(r) => showReceipt(r)}                // { txHash, giftId, price, change, changeTo }
/>
```

```ts
// your server
import { earmarkRouter } from 'earmark-plugin/server'

app.use(earmarkRouter({
  privateKey: process.env.EARMARK_STORE_PRIVATE_KEY,   // stays in your .env
  rpcUrl: 'https://rpc.testnet.arc.io',
  chainId: 5042002,
  earmark: '0xEarmarkContract',
  store: '0xYourStoreAddress',
  storeSlug: 'your-store',                             // itemId = keccak256("your-store:<sku>")
  catalog: () => yourEarmarkItems,                     // prices come from here, never the browser
  storeInfo: { name: 'Your Store', website: 'https://your-store.example' },
}))   // adds GET /earmark/catalog and POST /earmark/sign
```

Then the store's signer address is registered on the contract (`registerStore`), done from the `/stores` flow or with `npm run register` in hartwell-supply. Hartwell Supply is built exactly this way and talks to Earmark only through the plugin.

## Setup

Requirements: Node 20+, Foundry, an Arc testnet wallet with test USDC from [faucet.circle.com](https://faucet.circle.com).

Copy `.env.example` to `.env` at the repo root and fill it in; each part has its own `.env.example` too.

### 1. Contract

```sh
cd contracts
forge build && forge test
./script/deploy-arc.sh          # deploys with DEPLOYER_PRIVATE_KEY, writes deployments/arc-testnet.json
./script/export-abi.sh
```

### 2. earmark-app (+ plugin)

```sh
cd earmark-plugin && npm install && npm run sync-abi && npm test
cd ../earmark-app && npm install
cp .env.example .env            # ANTHROPIC_API_KEY, DEPLOYER_PRIVATE_KEY (owner + demo faucet), ELEVENLABS_*, …
npm run elevenlabs:agent        # creates the voice agent, writes ELEVENLABS_AGENT_ID
npm run dev                     # web http://localhost:5173 · server http://localhost:8787
```

### 3. hartwell-supply

```sh
cd hartwell-supply
npm run install:all
npm run store-key               # generates the store key into backend/.env (prints only the address)
npm run dev                     # store http://localhost:5174 · backend http://localhost:8788
npm run register                # registers the store's signer on Arc through Earmark
```

### Optional: phone calls and QuickNode

- **Phone:** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_PHONE_NUMBER`, run `npm run elevenlabs:import-twilio` in earmark-app (it writes `ELEVENLABS_PHONE_NUMBER_ID`), and set `PUBLIC_API_URL` to a public URL for the server, then re-run `npm run elevenlabs:agent`.
- **QuickNode:** create the Stream above pointing at `PUBLIC_API_URL/webhooks/quicknode`, put its security token in `QUICKNODE_STREAM_TOKEN`, and set `QUICKNODE_ENABLED=true`.

## Demo script

1. Open http://localhost:5173 and scroll the story.
2. **Send a gift:** sign in as Maya with a passkey, type *"Send Alex $45 for a snow shovel at Hartwell Supply."*, review, **Lock it**.
3. In another browser profile, sign in as Alex: "Maya sent you $45 for a snow shovel."
4. **Open Hartwell Supply:** add the cordless drill, then Pay with Earmark gift → *"This gift only buys the snow shovel."*
5. Swap for the snow shovel → pay → receipt: `SNOW SHOVEL ... $39.98 / CHANGE TO ALEX ... $5.02`, with the Arc transaction.
6. On a second gift, **Call me now** → say "Yeah, do it." → approve with your passkey.

## Credits

Every photo was generated with fal.ai (Nano Banana 2, BiRefNet): the upright wrapped present on the landing page and Hartwell Supply's storefront and products. Prompts are in `scripts/assets/jobs/`. Voices are ElevenLabs. Everything else (the see-through present effect, the gift card, receipts, fingerprint, store and contract) is built in code. Hartwell Supply, Maya and Alex are fictional.
