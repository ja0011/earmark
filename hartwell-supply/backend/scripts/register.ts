/**
 * Asks the Earmark server to list Hartwell Supply and register its signer on chain.
 * Run after `npm run store-key`, with the Earmark server running (EARMARK_API_URL).
 */
import { registerWithEarmark } from 'earmark-plugin/server';
import { config, signerAddress, storeAddress } from '../src/config.ts';

const store = storeAddress();
const signer = signerAddress();
if (!store || !signer) {
  console.error('No store key in backend/.env. Run `npm run store-key` first.');
  process.exit(1);
}

const api = config.apiUrl.replace(/\/$/, '');
try {
  const result = await registerWithEarmark({
    earmarkApi: config.earmarkApiUrl,
    name: config.storeName,
    website: config.storeUrl,
    store,
    signer,
    catalogUrl: `${api}/earmark/catalog`,
    signUrl: `${api}/earmark/sign`,
  });
  console.log(`Registered ${config.storeName} with Earmark at ${config.earmarkApiUrl}`);
  console.log(`  store / signer: ${store}`);
  console.log(`  on chain: ${result.onchain ? 'yes' : 'not yet'}`);
} catch (e) {
  console.error(`Could not register: ${(e as Error).message}`);
  console.error(`Is the Earmark server running at ${config.earmarkApiUrl}?`);
  process.exit(1);
}
