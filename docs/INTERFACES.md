# Shared interfaces (the contract between the four build sessions)

Change this file only when the owner of an interface agrees. If you must deviate, write the change here.

## Network: Arc testnet

Verified on 2026-11-19 against docs.arc.io and developers.circle.com/stablecoins/usdc-contract-addresses:

- chainId `5042002`, RPC `https://rpc.testnet.arc.io`, WS `wss://rpc.testnet.arc.io`
- Explorer `https://explorer.testnet.arc.io` (tx: `/tx/<hash>`, address: `/address/<addr>`)
- Native gas token is USDC (18 decimals natively). The ERC-20 interface for USDC is at
  `0x3600000000000000000000000000000000000000` with **6 decimals**. Gifts use the ERC-20 (6 decimals).
- Faucet: https://faucet.circle.com (Arc Testnet)
- Keep the USDC address in config (`contracts/deployments/arc-testnet.json`), never hard-code it elsewhere.

## Ports (local dev)

| Part | Port |
|---|---|
| earmark-app web (Vite) | 5173 (proxies `/api`, `/webhooks` to 8787) |
| earmark-app server (Express) | 8787 |
| hartwell-supply frontend (Vite) | 5174 (proxies `/earmark`, `/api` to 8788) |
| hartwell-supply backend (Express) | 8788 |
| anvil (tests) | random / 8545 |

Env vars for cross-origin URLs: `EARMARK_APP_URL=http://localhost:5173`, `EARMARK_API_URL=http://localhost:8787`, `HARTWELL_URL=http://localhost:5174`, `HARTWELL_API_URL=http://localhost:8788`.

## Contract: `Earmark` (owner: contracts session)

```solidity
struct Gift { address sender; address receiver; address store; bytes32 itemId; uint256 amount; uint64 expiry; bytes32 fingerprint; uint8 status; } // status 0 None, 1 Locked, 2 Spent, 3 Refunded
function registerStore(address store, address signer) external;           // onlyOwner
function storeSigner(address store) external view returns (address);
function createGift(address receiver, address store, bytes32 itemId, uint256 amount, uint64 expiry) external returns (uint256 giftId);
function redeem(uint256 giftId, uint256 price, bytes32 orderId, bytes calldata storeSignature) external; // msg.sender == receiver
function refund(uint256 giftId) external;                                   // after expiry, unused; anyone may call, funds go to sender
function gifts(uint256 giftId) external view returns (Gift memory);         // via getGift(giftId)
function nextGiftId() external view returns (uint256);                     // gift ids start at 1
uint256 public constant CHANGE_LIMIT = 10_000_000;                         // $10.00 in 6-dec USDC

event StoreRegistered(address indexed store, address indexed signer);
event GiftCreated(uint256 indexed giftId, address indexed sender, address indexed receiver, address store, bytes32 itemId, uint256 amount, uint64 expiry, bytes32 fingerprint);
event GiftRedeemed(uint256 indexed giftId, address indexed receiver, address indexed store, uint256 price, uint256 change, address changeTo, bytes32 orderId);
event GiftRefunded(uint256 indexed giftId, address indexed sender, uint256 amount);
```

- Fingerprint: `keccak256(abi.encode(sender, receiver, store, itemId, amount, expiry, nonce))` where `nonce == giftId`.
- Leftover `amount - price`: if `<= CHANGE_LIMIT` → receiver, else → sender.
- Also reject reused `orderId`.

### EIP-712 (MUST match byte for byte in Solidity and earmarkSigner)

```
domain = { name: "Earmark", version: "1", chainId, verifyingContract: <Earmark address> }
Order(uint256 giftId,bytes32 itemId,uint256 price,bytes32 orderId,address receiver)
```

The contract rebuilds the Order with the gift's stored `itemId` and `receiver` (so a signature for another item or person fails) and recovers against `storeSigner(gift.store)`.

### Artifacts the contracts session publishes

- `contracts/abi/Earmark.json`: `{ "abi": [...] }`
- `contracts/abi/MockUSDC.json`, plus forge `out/` (bytecode for the local plugin test: `contracts/out/Earmark.sol/Earmark.json`)
- `contracts/deployments/arc-testnet.json`: `{ "chainId": 5042002, "earmark": "0x…", "usdc": "0x3600…", "owner": "0x…", "deployBlock": n, "deployTx": "0x…" }`

earmark-plugin copies the ABI into `earmark-plugin/src/abi.ts` (`export const earmarkAbi = [...] as const`) via `npm run sync-abi` in earmark-plugin.

## Item IDs and Hartwell catalogue (source of truth: hartwell-supply/backend)

`itemId = keccak256(toBytes("hartwell-supply:" + sku))`

| sku | name (receipt line) | price (USD) | price (6-dec) | image |
|---|---|---|---|---|
| snow-shovel | SNOW SHOVEL | 39.98 | 39980000 | snow-shovel |
| ice-scraper | ICE SCRAPER | 8.49 | 8490000 | ice-scraper |
| work-gloves | INSULATED WORK GLOVES | 24.99 | 24990000 | work-gloves |
| rock-salt | ROCK SALT 20 LB | 12.99 | 12990000 | rock-salt |
| claw-hammer | CLAW HAMMER | 19.98 | 19980000 | claw-hammer |
| cordless-drill | CORDLESS DRILL | 89.00 | 89000000 | cordless-drill |

Hartwell backend serves (via earmark-plugin/server helpers):
- `GET  /earmark/catalog` → `{ store: { name, website, address, signer }, items: [{ sku, itemId, name, price /*6-dec string*/, priceUsd, image }] }` (only Earmark-enabled items)
- `POST /earmark/sign` body `{ giftId, receiver, cart: [{ sku, qty }] }` → server reads gift from chain, checks `cart` is exactly one unit of the gift's item (else 422 `{ error: "ITEM_MISMATCH", message: "This gift only buys the snow shovel." }`), looks up the real price server-side, returns `{ giftId, itemId, price, orderId, receiver, signature, store, chainId, verifyingContract }`.
- CORS allows `EARMARK_APP_URL` (the popup posts here).

## earmark-plugin package API (owner: app/plugin session)

```ts
// "earmark-plugin"
export { earmarkAbi, ARC_TESTNET /* viem Chain */, ORDER_TYPES, earmarkDomain(chainId, verifyingContract), itemIdFor(store: string, sku: string), CHANGE_LIMIT, formatUsdc }
// "earmark-plugin/react"
export function EarmarkPayButton(props: { store: `0x${string}`; cart: { sku: string; qty: number; name: string; price: string }[]; signUrl: string; onPaid: (r: { txHash: `0x${string}`; giftId: string; price: string; change: string; changeTo: `0x${string}` }) => void; onError?: (e: { code: string; message: string }) => void; earmarkUrl?: string /* default http://localhost:5173 */ }): JSX.Element
// "earmark-plugin/server"
export function earmarkSigner(opts: { privateKey: `0x${string}`; rpcUrl: string; chainId: number; earmark: `0x${string}`; catalog: CatalogItem[] }): { sign(req: SignRequest): Promise<SignedOrder>; address: `0x${string}` }
export function earmarkRouter(opts): express.Router // mounts GET /earmark/catalog, POST /earmark/sign
export async function registerWithEarmark(opts: { earmarkApi: string; name: string; website: string; store: `0x${string}`; signer: `0x${string}`; catalogUrl: string; signUrl: string })
```

Package is consumed with `"earmark-plugin": "file:../../earmark-plugin"` (no npm workspaces). Consumers add `resolve.dedupe: ['react','react-dom','viem']` in Vite. Package exports point at TS source (`src/…`); Vite and `tsx` compile it.

### Pay popup protocol

`EarmarkPayButton` opens `window.open(`${earmarkUrl}/pay?store=<addr>&origin=<store origin>`, 'earmark', 'width=440,height=720')`.
- popup → opener: `{ type: 'earmark:ready' }`
- opener → popup: `{ type: 'earmark:cart', store, cart, signUrl }`
- popup → opener: `{ type: 'earmark:paid', txHash, giftId, price, change, changeTo }` | `{ type: 'earmark:error', code, message }` | `{ type: 'earmark:closed' }`
Always check `event.origin`.

The popup (earmark-app `/pay`) signs in with a WebAuthn passkey, lists the receiver's Locked gifts for this store, enforces item match ("This gift only buys the snow shovel." using the item's name in lower case), POSTs to signUrl, sends `redeem` from the shopper's wallet, then posts `earmark:paid`.

## Wallets (earmark-app)

Embedded passkey wallet: the private key is generated in the browser and kept in localStorage under the passkey credential id; every transaction needs a fresh WebAuthn assertion (`userVerification: 'required'`). rpId `localhost` in dev. Optional: injected EIP-1193 wallet if present.
Demo personas: on first sign-in the user picks "Maya" or "Alex"; the app registers `{ name, address }` with `POST /api/contacts`. `POST /api/demo/fund { address, role }` tops up from the server's `DEPLOYER_PRIVATE_KEY` (Maya: enough USDC for a $45 gift + gas; Alex: gas only).

## earmark-app server API (owner: app/plugin session)

- `POST /api/agent/parse { text }` → `{ receiver: { name, address }, store: { name, address, website }, item: { sku, itemId, name, price }, amount, expiry, fingerprintPreview }` (Claude API; deterministic fallback parser when no key)
- `GET /api/stores`, `POST /api/stores` (register store record), `POST /api/stores/register-onchain { store, signer }` (owner key calls registerStore)
- `GET/POST /api/contacts`
- `GET /api/gifts?receiver=…`, `GET /api/gifts/:id`
- `GET /api/events?address=…` (SSE notifications)
- `POST /webhooks/quicknode` (QuickNode Stream destination). Fallback: viem `watchContractEvent` when no Stream is configured
- `POST /api/calls/now { giftId }`, `POST /api/agent/purchase-request` (ElevenLabs agent tool webhook), `GET /api/purchase-requests?receiver=…`
- `POST /api/demo/fund`

Notification copy: "Maya sent you $45 for a snow shovel." / "Alex bought the shovel. $5.02 went back to him."

## Media (owner: assets session)

Processed media goes to `earmark-app/public/media/` and (products, storefront) `hartwell-supply/frontend/public/media/`. Each image ships as `<name>-640.webp`, `<name>-1280.webp`, `<name>-2000.webp` (cutouts keep alpha). `earmark-app/public/media/manifest.json` lists every asset with sizes and intrinsic dimensions.

| name | where | notes |
|---|---|---|
| hero/frames/f0001.webp … | earmark-app | 15fps, 1600w, q72, 10s ≈ 150 frames |
| hero/hero.mp4, hero/poster.webp | earmark-app | |
| story-maya-couch | earmark-app | 3:2 |
| story-alex-driveway | earmark-app | 3:2 |
| story-alex-shoveling | earmark-app | 3:2 |
| hartwell-storefront | both | 16:9 |
| snow-shovel | both | cutout (also the hero shovel) |
| ice-scraper, work-gloves, rock-salt, claw-hammer, cordless-drill | hartwell (+ earmark-app for /stores product list) | square cutouts |
| call/call.mp3 + call/call.json | earmark-app | ElevenLabs agent line + Alex line; json = `{ duration, lines: [{ speaker: "Earmark"|"Alex", text, start, end, words: [{ text, start, end }] }] }` |

Until media lands, use a neutral Receipt-coloured block with the right aspect ratio (never a stock image), and wire to these exact paths so assets drop in.

## Changes

### 2026-11-19 (app/plugin session): CHANGE_LIMIT resolved

Resolved by the coordinator: `CHANGE_LIMIT = 10_000_000` ($10.00), so the story's $5.02 goes to Alex. earmark-plugin exports
`CHANGE_LIMIT = 10_000_000n`; the app copy says "$10 or less goes to them; more goes back to the sender".

### 2026-11-19 (app/plugin session): earmark-plugin details

- `earmarkSigner(opts)` also accepts `storeSlug?: string` (derives `itemId = itemIdFor(storeSlug, sku)` when a catalog item has no `itemId`)
  and `store?: Address` (the store address registered in Earmark; defaults to the signer's address). `catalog` may be an array or a
  function returning one (for live product toggles). Items with `earmark: false` are left out.
  Returns `{ sign, address, store, catalog, readGift }`. Errors are `EarmarkSignError { status, code, message }`:
  `ITEM_MISMATCH` (422, "This gift only buys the snow shovel."), `RECEIVER_MISMATCH` (403), `STORE_MISMATCH` (422),
  `GIFT_NOT_FOUND` (404), `GIFT_SPENT`/`GIFT_REFUNDED` (409), `GIFT_EXPIRED` (410), `ITEM_NOT_SOLD` (422), `OVER_AMOUNT` (422).
- `earmarkRouter(opts)` = earmarkSigner options + `storeInfo: { name, website }` + `allowedOrigins?: string[]`
  (default `[process.env.EARMARK_APP_URL ?? 'http://localhost:5173']`). Mount with `app.use(earmarkRouter({...}))`; it installs its own
  `express.json()` and CORS on `/earmark/*`.
- The shared module also exports `erc20Abi`, `explorerTx(hash)`, `explorerAddress(addr)`, `parseUsdc`, `GIFT_STATUS`,
  `itemMismatchMessage(name)` and the types `CatalogItem`, `CartLine`, `SignRequest`, `SignedOrder`, `PayResult`, `EarmarkMessage`.
- `registerWithEarmark` POSTs to `${earmarkApi}/api/stores` and returns `{ ok, store, onchain }`.

## Notes from the contracts session (2026-11-19)

- Additive only, nothing above changed: the contract also exposes `getGift(id)` (same as `gifts(id)`), `usedOrderIds(bytes32)`, `ORDER_TYPEHASH()`, `domainSeparator()`, `hashOrder(giftId,itemId,price,orderId,receiver)` (full EIP-712 digest), `fingerprintOf(...)`, `usdc()`, `owner()`, and `STATUS_*` constants. Constructor: `Earmark(address usdc, address owner)`.
- Custom errors: `ZeroAddress()`, `StoreNotRegistered(address)`, `ZeroAmount()`, `ExpiryNotInFuture(uint64)`, `GiftNotFound(uint256)`, `GiftNotLocked(uint256,uint8)`, `NotReceiver(address caller,address receiver)`, `GiftExpired(uint256,uint64)`, `GiftNotExpired(uint256,uint64)`, `PriceExceedsAmount(uint256,uint256)`, `OrderIdAlreadyUsed(bytes32)`, `InvalidStoreSignature(address recovered,address expected)`. A signature for the wrong store, item, receiver or price all surface as `InvalidStoreSignature`.
- Expiry: redeemable while `block.timestamp <= expiry`, refundable when `block.timestamp > expiry`.
- **Resolved: limit is $10.** `CHANGE_LIMIT = 10_000_000` ($10.00). Leftover `<= $10.00` goes to the receiver, more goes back to the sender. The story works as written: $45.00 gift, $39.98 shovel, $5.02 to Alex. Boundaries tested: $10.00 → receiver, $10.01 → sender. Any "$5 or less" rule copy should read "$10 or less".

## Changes requested by store (Hartwell Supply session)

- **earmark-plugin/react `EarmarkPayButton`: retry while the popup is still open.** After `earmark:error` the button goes back to `idle`, which removes the `message` listener. If the popup stays open (for example it shows "This gift only buys the snow shovel." and lets the shopper retry), clicking the button again only calls `popupRef.current.focus()` and never re-enters `waiting`, so a later `earmark:paid` from that same popup is ignored and the store never sees the payment. Also, the cart is only sent on `earmark:ready`, so after the shopper removes the drill the open popup still holds the old cart. Requested fix in `open()`: when the popup is already open, `setState('waiting')` and post a fresh `{ type: 'earmark:cart', store, cart, signUrl }` to it (and have `/pay` accept a new cart message at any time). Hartwell works around nothing here; the demo path (popup closes or reloads after the error) is unaffected.
- **Done (app/plugin session):** the button now listens for as long as it is mounted (filtered by `event.origin` and `event.source === popup`); clicking while the popup is open re-enters `waiting`, re-posts `earmark:cart` with the current props and focuses it. `/pay` replaces its cart whenever a new `earmark:cart` arrives.
- Note for `/pay`: Hartwell sends `cart[].price` as the 6-decimal USDC unit price string (e.g. `"39980000"`), matching `/earmark/catalog`. `signUrl` is the backend's absolute URL `http://localhost:8788/earmark/sign` (from `HARTWELL_API_URL`), not the Vite proxy.

### 2026-11-19 (app/plugin session): earmark-app server additions

- `GET /api/config` → `{ ready, error, chainId, earmark, usdc, explorer, changeLimit, hartwellUrl, features: { agent: "claude"|"rules", events: "quicknode"|"poller", calls: "phone"|"browser"|"demo", faucet } }`. The contract address is read at runtime from `contracts/deployments/arc-testnet.json` (or `EARMARK_ADDRESS`); `ready: false` with a clear `error` when it is missing.
- `POST /api/rpc`: JSON-RPC proxy to `ARC_RPC_URL` for the browser (read + `eth_sendRawTransaction` only).
- `GET /api/notifications?address=` (last 20), `GET /api/stores/catalog?url=` (server-side catalogue fetch fallback), `POST /api/purchase-requests/:id { status: "declined" | "done", txHash }` (done only once the chain says Spent), `GET /api/purchase-requests?gift=` also accepted.
- `GET /api/gifts` also accepts `sender=` and `store=`.
- `GET /api/events` also accepts `gift=<id>`; events are `notification`, `gift` (status changes) and `purchase-request`.
- `POST /api/agent/parse` accepts an optional `sender` (for the fingerprint preview) and also returns `nonce` and `source: "claude"|"rules"`.
- `POST /api/agent/purchase-request { gift_id, source? }`: `source: "browser"` comes from the agent's client tool during an in-browser call, `"demo"` from the recorded sample (only when no agent is configured); otherwise it is the phone webhook (checked against `x-earmark-tool-secret` when `ELEVENLABS_TOOL_SECRET` is set).
- `GET /api/calls/session?giftId=` → `{ conversationToken | signedUrl, dynamicVariables }` for the in-browser ElevenLabs call. `POST /api/calls/now` → `{ mode: "live" | "browser" | "demo", message }`.
- Wallet: one fresh WebAuthn assertion (`userVerification: "required"`, UV flag checked) per user action. "Lock it" (approve + createGift) is one action, so it asks for the passkey once.
