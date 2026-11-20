import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAddress, isAddress, type Address, type Hex } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..');

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export const PORT = Number(env('PORT', '8787'));
export const EARMARK_APP_URL = env('EARMARK_APP_URL', 'http://localhost:5173').replace(/\/$/, '');
export const HARTWELL_URL = env('HARTWELL_URL', 'http://localhost:5174').replace(/\/$/, '');
export const HARTWELL_API_URL = env('HARTWELL_API_URL', 'http://localhost:8788').replace(/\/$/, '');

export const RPC_URL = env('ARC_RPC_URL', 'https://rpc.testnet.arc.io');
export const EXPLORER = env('ARC_EXPLORER', 'https://explorer.testnet.arc.io');
export const DEPLOYMENT_FILE = resolve(ROOT, env('EARMARK_DEPLOYMENT', '../contracts/deployments/arc-testnet.json'));

export const ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY');
export const AGENT_MODEL = env('AGENT_MODEL', 'claude-sonnet-5-5');

export const DEPLOYER_PRIVATE_KEY = env('DEPLOYER_PRIVATE_KEY') as Hex | '';

export const QUICKNODE_ENABLED = env('QUICKNODE_ENABLED') === 'true';
export const QUICKNODE_STREAM_TOKEN = env('QUICKNODE_STREAM_TOKEN');

export const ELEVENLABS_API_KEY = env('ELEVENLABS_API_KEY');
export const ELEVENLABS_AGENT_ID = env('ELEVENLABS_AGENT_ID');
export const ELEVENLABS_PHONE_NUMBER_ID = env('ELEVENLABS_PHONE_NUMBER_ID');
export const ELEVENLABS_TOOL_SECRET = env('ELEVENLABS_TOOL_SECRET');
export const DEMO_RECEIVER_PHONE = env('DEMO_RECEIVER_PHONE');
/** Agent configured: browser calls work. */
export const AGENT_ENABLED = Boolean(ELEVENLABS_API_KEY && ELEVENLABS_AGENT_ID);
/** Twilio number imported into ElevenLabs as well: phone calls work. */
export const CALLS_ENABLED = Boolean(AGENT_ENABLED && ELEVENLABS_PHONE_NUMBER_ID);
export const CALL_MODE: 'phone' | 'browser' | 'demo' = CALLS_ENABLED ? 'phone' : AGENT_ENABLED ? 'browser' : 'demo';

export type Deployment = {
  chainId: number;
  earmark: Address;
  usdc: Address;
  owner?: Address;
  deployBlock?: number;
  deployTx?: Hex;
};

let cache: { mtime: number; dep: Deployment } | null = null;

/** Reads contracts/deployments/arc-testnet.json at runtime, so a fresh deploy is picked up without a restart. */
export function deployment(): Deployment {
  const override = env('EARMARK_ADDRESS');
  if (override) {
    return {
      chainId: Number(env('CHAIN_ID', '5042002')),
      earmark: getAddress(override),
      usdc: getAddress(env('USDC_ADDRESS', '0x3600000000000000000000000000000000000000')),
      deployBlock: Number(env('DEPLOY_BLOCK', '0')),
    };
  }
  if (!existsSync(DEPLOYMENT_FILE)) {
    throw new DeploymentMissing(
      `Earmark is not deployed yet: ${DEPLOYMENT_FILE} is missing. Deploy the contract (contracts/) or set EARMARK_ADDRESS in earmark-app/.env.`,
    );
  }
  const mtime = statSync(DEPLOYMENT_FILE).mtimeMs;
  if (cache && cache.mtime === mtime) return cache.dep;
  const raw = JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'));
  if (!isAddress(raw.earmark ?? '') || !isAddress(raw.usdc ?? '')) {
    throw new DeploymentMissing(`${DEPLOYMENT_FILE} has no valid "earmark" and "usdc" addresses.`);
  }
  const dep: Deployment = {
    chainId: Number(raw.chainId ?? 5042002),
    earmark: getAddress(raw.earmark),
    usdc: getAddress(raw.usdc),
    owner: raw.owner && isAddress(raw.owner) ? getAddress(raw.owner) : undefined,
    deployBlock: Number(raw.deployBlock ?? 0),
    deployTx: raw.deployTx,
  };
  cache = { mtime, dep };
  return dep;
}

export function tryDeployment(): Deployment | null {
  try {
    return deployment();
  } catch {
    return null;
  }
}

export class DeploymentMissing extends Error {
  status = 503;
  code = 'NOT_DEPLOYED';
}
