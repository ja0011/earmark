/**
 * Creates the Hartwell Supply signer key in backend/.env (only if none exists).
 * Prints only the public address. The private key never leaves backend/.env.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(backendDir, '.env');
const examplePath = resolve(backendDir, '.env.example');

if (!existsSync(envPath)) copyFileSync(examplePath, envPath);

let env = readFileSync(envPath, 'utf8');
const match = env.match(/^HARTWELL_SIGNER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m);

if (match) {
  const address = privateKeyToAccount(match[1] as `0x${string}`).address;
  console.log(`Store key already exists. Signer / payout address: ${address}`);
} else {
  const key = generatePrivateKey();
  const line = `HARTWELL_SIGNER_PRIVATE_KEY=${key}`;
  env = /^HARTWELL_SIGNER_PRIVATE_KEY=.*$/m.test(env)
    ? env.replace(/^HARTWELL_SIGNER_PRIVATE_KEY=.*$/m, line)
    : `${line}\n${env}`;
  writeFileSync(envPath, env);
  try { chmodSync(envPath, 0o600); } catch {}
  console.log(`Created store key in backend/.env. Signer / payout address: ${privateKeyToAccount(key).address}`);
}
