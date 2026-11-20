import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { api } from './api';

export type AppConfig = {
  ready: boolean;
  error: string | null;
  chainId: number;
  earmark: Address | null;
  usdc: Address | null;
  explorer: string;
  changeLimit: string;
  hartwellUrl: string;
  features: { agent: 'claude' | 'rules'; events: 'quicknode' | 'poller'; calls: 'phone' | 'browser' | 'demo'; faucet: boolean };
};

const FALLBACK: AppConfig = {
  ready: false,
  error: 'The Earmark server is not reachable. Start it with npm run dev.',
  chainId: 5042002,
  earmark: null,
  usdc: null,
  explorer: 'https://explorer.testnet.arc.io',
  changeLimit: '10000000',
  hartwellUrl: 'http://localhost:5174',
  features: { agent: 'rules', events: 'poller', calls: 'demo', faucet: false },
};

let cached: Promise<AppConfig> | null = null;
export function loadConfig(force = false): Promise<AppConfig> {
  if (!cached || force) cached = api<AppConfig>('/api/config').catch(() => ((cached = null), FALLBACK));
  return cached;
}

export function useConfig(): AppConfig | null {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}

export const txUrl = (cfg: AppConfig | null, hash: string) => `${cfg?.explorer ?? 'https://explorer.testnet.arc.io'}/tx/${hash}`;
export const addressUrl = (cfg: AppConfig | null, a: string) => `${cfg?.explorer ?? 'https://explorer.testnet.arc.io'}/address/${a}`;
