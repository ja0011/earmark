import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Set KEY=value in an .env file (replacing an existing line or appending). Never logs the value. */
export function setEnv(file: string, key: string, value: string) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n?$/, '\n')}${key}=${value}\n`;
  writeFileSync(file, next);
}

export async function xi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (earmark-app/.env)');
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    ...init,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === 'object' ? JSON.stringify(body?.detail ?? body).slice(0, 800) : String(body).slice(0, 800);
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${detail}`);
  }
  return body as T;
}
