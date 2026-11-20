import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, defineChain, erc20Abi, http, type Address, type Hex, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_TESTNET } from 'earmark-plugin';
import type { AppConfig } from './config';

const rpc = () => `${window.location.origin}/api/rpc`;

export function chainOf(cfg: AppConfig) {
  if (cfg.chainId === ARC_TESTNET.id) return ARC_TESTNET;
  return defineChain({ id: cfg.chainId, name: `chain-${cfg.chainId}`, nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc()] } } });
}

let client: PublicClient | null = null;
export function publicClient(cfg: AppConfig): PublicClient {
  if (!client || client.chain?.id !== cfg.chainId) {
    client = createPublicClient({ chain: chainOf(cfg), transport: http(rpc(), { retryCount: 2 }), pollingInterval: 1500 }) as PublicClient;
  }
  return client;
}

export function walletFor(cfg: AppConfig, privateKey: Hex) {
  return createWalletClient({ account: privateKeyToAccount(privateKey), chain: chainOf(cfg), transport: http(rpc()) });
}

/** Human message for a viem error. */
export function chainMessage(e: unknown): string {
  const err = e as any;
  const name = err?.cause?.data?.errorName ?? err?.data?.errorName ?? err?.cause?.cause?.data?.errorName;
  const map: Record<string, string> = {
    GiftExpired: 'This gift has expired.',
    GiftNotLocked: 'This gift has already been used.',
    NotReceiver: 'Only the person this gift is for can spend it.',
    InvalidStoreSignature: "The store's signature didn't match this order.",
    PriceExceedsAmount: "The price is more than the gift.",
    OrderIdAlreadyUsed: 'That order was already paid.',
    StoreNotRegistered: "That store isn't registered with Earmark yet.",
    ExpiryNotInFuture: 'The expiry must be in the future.',
  };
  if (name && map[name]) return map[name];
  const msg: string = err?.shortMessage ?? err?.message ?? 'Something went wrong.';
  if (/insufficient funds|exceeds balance|transfer amount exceeds/i.test(msg)) return 'Not enough USDC in this wallet. Top it up and try again.';
  if (/NotAllowedError|denied|cancel/i.test(msg)) return 'The passkey check was cancelled.';
  return msg.split('\n')[0];
}

/**
 * Live USDC balance for an address (ERC-20 view of Arc's native USDC, 6 decimals).
 * Re-reads every 15s and whenever `bump` changes (e.g. after a notification).
 */
export function useBalance(cfg: AppConfig | null, address: Address | undefined, bump = 0) {
  const [balance, setBalance] = useState<bigint | null>(null);
  useEffect(() => {
    if (!cfg?.usdc || !address) return;
    let alive = true;
    const read = () =>
      publicClient(cfg)
        .readContract({ address: cfg.usdc as Address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
        .then((b) => alive && setBalance(b as bigint))
        .catch(() => {});
    read();
    const iv = setInterval(read, 15000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [cfg?.usdc, cfg?.chainId, address, bump]);
  return balance;
}
