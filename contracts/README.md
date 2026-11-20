# Earmark contracts

Foundry project for `Earmark.sol`: USDC locked for one item, at one store, for one person.
Spec: `../docs/INTERFACES.md`.

## Build and test

```sh
forge build
forge test -vv
./script/export-abi.sh      # writes abi/Earmark.json and abi/MockUSDC.json ({ "abi": [...] })
```

Libraries are vendored in `lib/` (forge-std, OpenZeppelin v5.1.0). `src/test/MockUSDC.sol` is a 6-decimal, public-mint token for local tests only.

Bytecode for local tests (anvil) is at `out/Earmark.sol/Earmark.json` and `out/MockUSDC.sol/MockUSDC.json` after `forge build`.

## Deploy to Arc testnet

1. Put a funded key in the repo-root `.env` as `DEPLOYER_PRIVATE_KEY` (gas is USDC: https://faucet.circle.com, Arc Testnet).
2. Run `./script/deploy-arc.sh`.

The script reads the USDC address and RPC from `config/arc-testnet.json`, checks the chain id and the deployer balance, deploys `Earmark(usdc, owner = deployer)`, and writes `deployments/arc-testnet.json`:

```json
{ "chainId": 5042002, "earmark": "0x…", "usdc": "0x3600…", "owner": "0x…", "deployBlock": 0, "deployTx": "0x…" }
```

Extra forge flags pass through, for example `./script/deploy-arc.sh --legacy`.

Manual deploy elsewhere: `DEPLOYER_PRIVATE_KEY=0x… USDC_ADDRESS=0x… forge script script/Deploy.s.sol:Deploy --rpc-url <rpc> --broadcast`.

After deploying, register the store (owner only): `cast send <earmark> "registerStore(address,address)" <store> <signer> --rpc-url https://rpc.testnet.arc.io --private-key $DEPLOYER_PRIVATE_KEY`.

## Debug helpers (views)

- `domainSeparator()`, `ORDER_TYPEHASH()`, `hashOrder(giftId, itemId, price, orderId, receiver)`: the exact EIP-712 digest the store must sign.
- `fingerprintOf(sender, receiver, store, itemId, amount, expiry, nonce)`.
- `getGift(id)` / `gifts(id)`, `nextGiftId()`, `storeSigner(store)`, `usedOrderIds(orderId)`, `CHANGE_LIMIT()`.

Custom errors: `ZeroAddress`, `StoreNotRegistered`, `ZeroAmount`, `ExpiryNotInFuture`, `GiftNotFound`, `GiftNotLocked`, `NotReceiver`, `GiftExpired`, `GiftNotExpired`, `PriceExceedsAmount`, `OrderIdAlreadyUsed`, `InvalidStoreSignature`.
Change rule: leftover `amount - price` of $10.00 or less (`CHANGE_LIMIT = 10_000_000`) goes to the receiver; more goes back to the sender. Story: $45.00 gift, $39.98 shovel, $5.02 to the receiver.
A gift is redeemable while `block.timestamp <= expiry` and refundable once `block.timestamp > expiry`.
