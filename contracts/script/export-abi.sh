#!/usr/bin/env bash
# Build and export ABIs to contracts/abi/{Earmark,MockUSDC}.json as { "abi": [...] }.
set -euo pipefail
cd "$(dirname "$0")/.."
forge build --silent
mkdir -p abi
for c in Earmark MockUSDC; do
  jq '{abi: .abi}' "out/$c.sol/$c.json" > "abi/$c.json"
  echo "wrote abi/$c.json ($(jq '.abi | length' "abi/$c.json") entries)"
done
