// Local preview without Netlify: serves public/ and runs the API against a JSON file store.
// Usage: BAND_PASSWORD=test node scripts/dev-server.mjs  → http://localhost:8888
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handle } from '../lib/api.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dbFile = path.join(root, '.dev-store.json');
let db = {};
try { db = JSON.parse(await fs.readFile(dbFile, 'utf8')); } catch {}
const save = () => fs.writeFile(dbFile, JSON.stringify(db, null, 1));
const store = {
  async get(k) { return k in db ? structuredClone(db[k]) : null; },
  async setJSON(k, v) { db[k] = structuredClone(v); await save(); },
  async delete(k) { delete db[k]; await save(); },
  async list({ prefix = '' } = {}) { return { blobs: Object.keys(db).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
const env = { BAND_PASSWORD: process.env.BAND_PASSWORD || '' };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), store, env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  const file = path.join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(8888, () => console.log('http://localhost:8888' + (env.BAND_PASSWORD ? '  (parole: ' + env.BAND_PASSWORD + ')' : '')));
