import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import { formatUsdc } from '../index';
import { earmarkSigner, EarmarkSignError, type EarmarkSignerOptions } from './signer';

export type EarmarkRouterOptions = EarmarkSignerOptions & {
  /** Public store details for GET /earmark/catalog */
  storeInfo: { name: string; website: string };
  /** Origins allowed to call the routes (the Earmark pay popup). Defaults to EARMARK_APP_URL or http://localhost:5173. */
  allowedOrigins?: string[];
};

function cors(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (allowed.includes('*') || allowed.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Mounts GET /earmark/catalog and POST /earmark/sign. Use: app.use(earmarkRouter({...})) */
export function earmarkRouter(opts: EarmarkRouterOptions): Router {
  const signer = earmarkSigner(opts);
  const allowed = (opts.allowedOrigins ?? [process.env.EARMARK_APP_URL ?? 'http://localhost:5173']).map((o) =>
    o.replace(/\/$/, ''),
  );
  const router = express.Router();
  router.use('/earmark', cors(allowed));
  router.use('/earmark', express.json({ limit: '32kb' }));

  router.get('/earmark/catalog', async (_req, res) => {
    try {
      const items = await signer.catalog();
      res.json({
        store: { name: opts.storeInfo.name, website: opts.storeInfo.website, address: signer.store, signer: signer.address },
        items: items.map((i) => ({
          sku: i.sku,
          itemId: i.itemId,
          name: i.name,
          price: i.price,
          priceUsd: i.priceUsd ?? formatUsdc(i.price, { symbol: false }),
          image: i.image ?? i.sku,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: 'CATALOG_ERROR', message: (e as Error).message });
    }
  });

  router.post('/earmark/sign', async (req, res) => {
    try {
      const { giftId, receiver, cart } = req.body ?? {};
      const order = await signer.sign({ giftId, receiver, cart });
      res.json(order);
    } catch (e) {
      if (e instanceof EarmarkSignError) {
        res.status(e.status).json({ error: e.code, message: e.message });
        return;
      }
      console.error('[earmark] sign failed', e);
      res.status(502).json({ error: 'SIGN_FAILED', message: 'Could not sign this order. Try again.' });
    }
  });

  return router;
}
