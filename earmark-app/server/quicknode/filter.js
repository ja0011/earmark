/**
 * QuickNode Streams filter for Earmark on Arc testnet.
 *
 * Stream config: network Arc Testnet, dataset "Receipts" (block receipts with logs),
 * destination Webhook -> https://<your-host>/webhooks/quicknode, security token = QUICKNODE_STREAM_TOKEN.
 * Replace EARMARK below with the address in contracts/deployments/arc-testnet.json (lower case).
 *
 * Returns only the Earmark contract's GiftCreated / GiftRedeemed / GiftRefunded logs, decoded,
 * or null so QuickNode skips the delivery entirely for blocks with nothing for us.
 */
const EARMARK = '0x9d91f4ee5ffad6a31d662801b695514770c4d0bd'; // Earmark on Arc testnet (contracts/deployments/arc-testnet.json)

const TOPICS = {
  '0x011646b8aaaf35685f302664a2d64bbf4527f9672523ba1b66ba4075c3fa89e6': 'GiftCreated', // (uint256,address,address,address,bytes32,uint256,uint64,bytes32)
  '0x29a2780b7367ee72c019f299753b9068538d72514af7b15e3c17c460075c3832': 'GiftRedeemed', // (uint256,address,address,uint256,uint256,address,bytes32)
  '0x6b5960a2dd87733f10cd737cafc43edc838100cebade18aaa39b6fc66a18a93b': 'GiftRefunded', // (uint256,address,uint256)
};

function word(data, i) {
  return '0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64);
}
function asUint(hex) {
  return BigInt(hex).toString();
}
function asAddress(hex) {
  return '0x' + hex.slice(-40);
}

function decode(name, topics, data) {
  const giftId = asUint(topics[1]);
  if (name === 'GiftCreated') {
    return {
      giftId,
      sender: asAddress(topics[2]),
      receiver: asAddress(topics[3]),
      store: asAddress(word(data, 0)),
      itemId: word(data, 1),
      amount: asUint(word(data, 2)),
      expiry: asUint(word(data, 3)),
      fingerprint: word(data, 4),
    };
  }
  if (name === 'GiftRedeemed') {
    return {
      giftId,
      receiver: asAddress(topics[2]),
      store: asAddress(topics[3]),
      price: asUint(word(data, 0)),
      change: asUint(word(data, 1)),
      changeTo: asAddress(word(data, 2)),
      orderId: word(data, 3),
    };
  }
  return { giftId, sender: asAddress(topics[2]), amount: asUint(word(data, 0)) };
}

function main(stream) {
  const blocks = Array.isArray(stream.data) ? stream.data : [stream.data];
  const events = [];
  for (const block of blocks) {
    const receipts = Array.isArray(block) ? block : block && block.receipts ? block.receipts : [];
    for (const receipt of receipts) {
      for (const log of receipt.logs || []) {
        if (!log.address || log.address.toLowerCase() !== EARMARK) continue;
        const name = TOPICS[(log.topics[0] || '').toLowerCase()];
        if (!name) continue;
        events.push({
          event: name,
          args: decode(name, log.topics, log.data),
          // raw fields so the server can re-decode with viem and dedupe by tx hash + log index
          address: log.address,
          topics: log.topics,
          data: log.data,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        });
      }
    }
  }
  return events.length ? { earmark: EARMARK, events } : null;
}
