#!/usr/bin/env bash
# Deploy Earmark to Arc testnet and write contracts/deployments/arc-testnet.json.
# Reads DEPLOYER_PRIVATE_KEY from the repo-root .env (never printed).
# USDC address and RPC come from contracts/config/arc-testnet.json.
# Extra forge flags can be passed through, e.g. ./script/deploy-arc.sh --legacy
set -euo pipefail

CONTRACTS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$CONTRACTS_DIR/.." && pwd)"
CONFIG="$CONTRACTS_DIR/config/arc-testnet.json"
OUT="$CONTRACTS_DIR/deployments/arc-testnet.json"

[ -f "$ROOT_DIR/.env" ] || { echo "missing $ROOT_DIR/.env" >&2; exit 1; }
set -a; # shellcheck disable=SC1091
source "$ROOT_DIR/.env"; set +a

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "DEPLOYER_PRIVATE_KEY is empty in $ROOT_DIR/.env. Fund a key at https://faucet.circle.com (Arc Testnet) and set it." >&2
  exit 1
fi
case "$DEPLOYER_PRIVATE_KEY" in 0x*) ;; *) DEPLOYER_PRIVATE_KEY="0x$DEPLOYER_PRIVATE_KEY" ;; esac
export DEPLOYER_PRIVATE_KEY

CHAIN_ID="$(jq -r .chainId "$CONFIG")"
RPC_URL="${ARC_RPC_URL:-$(jq -r .rpcUrl "$CONFIG")}"
export USDC_ADDRESS="$(jq -r .usdc "$CONFIG")"

REMOTE_CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
[ "$REMOTE_CHAIN_ID" = "$CHAIN_ID" ] || { echo "RPC chainId $REMOTE_CHAIN_ID != expected $CHAIN_ID" >&2; exit 1; }

DEPLOYER="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
BAL="$(cast balance --rpc-url "$RPC_URL" "$DEPLOYER")"
echo "deployer $DEPLOYER  native balance $BAL wei"
[ "$BAL" != "0" ] || { echo "deployer has no gas. Fund it at https://faucet.circle.com (Arc Testnet)." >&2; exit 1; }

cd "$CONTRACTS_DIR"
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --slow "$@"

RUN="$CONTRACTS_DIR/broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"
EARMARK="$(jq -r '[.transactions[] | select(.contractName=="Earmark" and .transactionType=="CREATE")][0].contractAddress' "$RUN")"
TX="$(jq -r '[.transactions[] | select(.contractName=="Earmark" and .transactionType=="CREATE")][0].hash' "$RUN")"
BLOCK_HEX="$(jq -r --arg tx "$TX" '[.receipts[] | select(.transactionHash==$tx)][0].blockNumber' "$RUN")"
BLOCK="$(cast to-dec "$BLOCK_HEX")"
EARMARK="$(cast to-check-sum-address "$EARMARK")"

mkdir -p "$(dirname "$OUT")"
jq -n --argjson chainId "$CHAIN_ID" --arg earmark "$EARMARK" --arg usdc "$USDC_ADDRESS" \
  --arg owner "$DEPLOYER" --argjson deployBlock "$BLOCK" --arg deployTx "$TX" \
  '{chainId: $chainId, earmark: $earmark, usdc: $usdc, owner: $owner, deployBlock: $deployBlock, deployTx: $deployTx}' > "$OUT"

"$CONTRACTS_DIR/script/export-abi.sh" >/dev/null
echo "wrote $OUT"
cat "$OUT"
echo "explorer: $(jq -r .explorer "$CONFIG")/address/$EARMARK"
