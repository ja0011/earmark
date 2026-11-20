/**
 * Local test chain: deploys MockUSDC + Earmark (from contracts/out) to an anvil at LOCAL_RPC (default
 * http://127.0.0.1:8545) and writes .local/deployment.json for the server (EARMARK_DEPLOYMENT=.local/deployment.json).
 * Uses anvil's well-known dev account 0 as owner. Never used for Arc.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

const rpc = process.env.LOCAL_RPC ?? 'http://127.0.0.1:8545';
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const owner = mnemonicToAccount('test test test test test test test test test test test junk');
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ account: owner, chain, transport: http(rpc) });
const art = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../contracts/out/${n}.sol/${n}.json`), 'utf8'));

const usdcArt = art('MockUSDC');
const emArt = art('Earmark');
const h1 = await wallet.deployContract({ abi: usdcArt.abi, bytecode: usdcArt.bytecode.object as Hex, args: [] });
const usdc = (await pub.waitForTransactionReceipt({ hash: h1 })).contractAddress!;
const h2 = await wallet.deployContract({ abi: emArt.abi, bytecode: emArt.bytecode.object as Hex, args: [usdc, owner.address] });
const r2 = await pub.waitForTransactionReceipt({ hash: h2 });
const out = resolve(import.meta.dirname, '../.local');
mkdirSync(out, { recursive: true });
const dep = { chainId: 31337, earmark: r2.contractAddress, usdc, owner: owner.address, deployBlock: Number(r2.blockNumber), deployTx: h2 };
writeFileSync(resolve(out, 'deployment.json'), JSON.stringify(dep, null, 2));
console.log(JSON.stringify(dep));
