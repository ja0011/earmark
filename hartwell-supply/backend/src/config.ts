import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { isAddress } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = resolve(here, '..');
export const DEPLOYMENT_FILE = resolve(BACKEND_DIR, '../../contracts/deployments/arc-testnet.json');

type Hex = `0x${string}`;

function readDeployment(): { earmark?: string; chainId?: number } {
  if (!existsSync(DEPLOYMENT_FILE)) return {};
  try {
    return JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Earmark contract address: env first, then the contracts session's deployment file (read on every call). */
export function earmarkContract(): Hex | undefined {
  const fromEnv = process.env.EARMARK_CONTRACT?.trim();
  if (fromEnv && isAddress(fromEnv)) return fromEnv as Hex;
  const dep = readDeployment().earmark;
  return dep && isAddress(dep) ? (dep as Hex) : undefined;
}

export function signerKey(): Hex | undefined {
  const k = process.env.HARTWELL_SIGNER_PRIVATE_KEY?.trim();
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : undefined;
}

export function signerAddress(): Hex | undefined {
  const k = signerKey();
  return k ? privateKeyToAccount(k).address : undefined;
}

/** Payout address the gifts are locked to. For the demo it is the signer address. */
export function storeAddress(): Hex | undefined {
  const s = process.env.HARTWELL_STORE_ADDRESS?.trim();
  if (s && isAddress(s)) return s as Hex;
  return signerAddress();
}

export const config = {
  port: Number(process.env.PORT ?? 8788),
  chainId: Number(process.env.CHAIN_ID ?? 5042002),
  rpcUrl: process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io',
  earmarkAppUrl: process.env.EARMARK_APP_URL ?? 'http://localhost:5173',
  earmarkApiUrl: process.env.EARMARK_API_URL ?? 'http://localhost:8787',
  storeUrl: process.env.HARTWELL_URL ?? 'http://localhost:5174',
  apiUrl: process.env.HARTWELL_API_URL ?? 'http://localhost:8788',
  storeName: 'Hartwell Supply',
};
