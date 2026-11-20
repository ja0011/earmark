# QuickNode Stream for Earmark

| Setting | Value |
|---|---|
| Network | Arc Testnet |
| Dataset | Receipts (block receipts with logs) |
| Start | the deploy block in `contracts/deployments/arc-testnet.json` (`deployBlock`), then latest |
| Filter | `server/quicknode/filter.js` with `EARMARK` set to the deployed address (lower case) |
| Destination | Webhook → `https://<your-earmark-server>/webhooks/quicknode`, POST, gzip allowed |
| Security token | copy into `QUICKNODE_STREAM_TOKEN`; the server checks `x-qn-signature` (HMAC-SHA256 of nonce + timestamp + body) |
| Reorg handling | on (latest-block delays are fine for notifications) |

Then set `QUICKNODE_ENABLED=true` in `earmark-app/.env`. Without it the server watches the contract with a viem poller
instead, so notifications work either way.

## Why

The filter keeps only the Earmark contract's `GiftCreated`, `GiftRedeemed` and `GiftRefunded` logs (by address and
topic0) and returns `null` for every other block, so QuickNode only delivers when something happens to a gift. The
server re-decodes each log with viem (`decodeEventLog`), dedupes by `transactionHash:logIndex`, and pushes in-app
notifications over SSE:

- GiftCreated → receiver: "Maya sent you $45 for a snow shovel."
- GiftRedeemed → sender and receiver: "Alex bought the shovel. $5.02 went back to him."
- GiftRefunded → sender: "Your $45 gift to Alex expired. It came back to you."

## Topic0s

| Event | Signature | topic0 |
|---|---|---|
| GiftCreated | `GiftCreated(uint256,address,address,address,bytes32,uint256,uint64,bytes32)` | `0x011646b8aaaf35685f302664a2d64bbf4527f9672523ba1b66ba4075c3fa89e6` |
| GiftRedeemed | `GiftRedeemed(uint256,address,address,uint256,uint256,address,bytes32)` | `0x29a2780b7367ee72c019f299753b9068538d72514af7b15e3c17c460075c3832` |
| GiftRefunded | `GiftRefunded(uint256,address,uint256)` | `0x6b5960a2dd87733f10cd737cafc43edc838100cebade18aaa39b6fc66a18a93b` |

## Test locally

```sh
curl -X POST localhost:8787/webhooks/quicknode -H 'x-qn-token: <QUICKNODE_STREAM_TOKEN>' \
  -H 'content-type: application/json' -d @sample-delivery.json
```
