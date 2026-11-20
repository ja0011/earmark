import type { Request, Response } from 'express';
import type { Address } from 'viem';
import { db, save, uid, type Notification } from './db';

type Client = { res: Response; address?: string; gift?: string };
const clients = new Set<Client>();

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client: Client = {
    res,
    address: typeof req.query.address === 'string' ? req.query.address.toLowerCase() : undefined,
    gift: typeof req.query.gift === 'string' ? req.query.gift : undefined,
  };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

function send(c: Client, event: string, data: unknown) {
  c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function notify(address: Address, text: string, extra: Partial<Notification> = {}) {
  const n: Notification = { id: uid(), address, text, kind: 'info', at: Date.now(), ...extra };
  db.notifications.push(n);
  save();
  for (const c of clients) if (c.address && c.address === address.toLowerCase()) send(c, 'notification', n);
  return n;
}

export function giftUpdate(giftId: string, data: Record<string, unknown>, addresses: string[] = []) {
  const set = new Set(addresses.map((a) => a.toLowerCase()));
  for (const c of clients) {
    if (c.gift === giftId || (c.address && set.has(c.address))) send(c, 'gift', { giftId, ...data });
  }
}

export function broadcastTo(address: string, event: string, data: unknown) {
  for (const c of clients) if (c.address === address.toLowerCase()) send(c, event, data);
}
