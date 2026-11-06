import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WikipediaAPI } from '../src/wiki.mjs';
import { VERSION } from '../src/version.mjs';
import { createSiteService, validateToolInput, ApiInputError, TOOL_NAMES } from './service.mjs';
import { SlidingWindowLimiter } from './limits.mjs';

const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'public');
const STATIC = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/main.js': ['main.js', 'text/javascript; charset=utf-8'],
  '/machine.js': ['machine.js', 'text/javascript; charset=utf-8'],
  '/canvas.js': ['canvas.js', 'text/javascript; charset=utf-8'],
  '/webmcp.js': ['webmcp.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/robots.txt': ['robots.txt', 'text/plain; charset=utf-8']
});
const HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests"
});
function json(res, status, payload, extra = {}) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(payload));
}
function safeOrigin(req) {
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  if (!origin) return true;
  try { return new URL(origin).host.toLowerCase() === String(req.headers.host ?? '').toLowerCase(); }
  catch { return false; }
}
function clientAddress(req, trustProxy) {
  if (trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim().slice(0, 80);
  return req.socket.remoteAddress ?? 'unknown';
}
async function readJson(req) {
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json'))
    throw new ApiInputError('Content-Type must be application/json.');
  const chunks = []; let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 12_288) throw new ApiInputError('JSON request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiInputError('Malformed JSON.'); }
}

export function createWikiSite({ wikipedia, limiter = new SlidingWindowLimiter(),
  trustProxy = false, staticDir = SITE_DIR, requestTimeoutMs = 45_000 } = {}) {
  if (!wikipedia) throw new Error('A WikipediaAPI instance is required.');
  const invoke = createSiteService(wikipedia);
  return createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    try {
      if (path === '/api/health' && req.method === 'GET')
        return json(res, 200, { ok: true, version: VERSION, service: 'wiki-spark', tools: TOOL_NAMES,
          ai_explanations: false, access: 'anonymous', distributed_rate_limit: false });
      if (path.startsWith('/api/')) {
        if (req.method !== 'POST' || !path.startsWith('/api/tools/'))
          return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'API route not found.' } });
        if (!safeOrigin(req)) return json(res, 403,
          { ok: false, error: { code: 'ORIGIN_DENIED', message: 'Requests must originate from this site.' } });
        const name = path.slice('/api/tools/'.length);
        if (!TOOL_NAMES.includes(name)) return json(res, 404,
          { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown tool.' } });
        const input = await readJson(req);
        // Validate before consuming a rate-limit slot.
        validateToolInput(name, input);
        const lease = limiter.acquire(clientAddress(req, trustProxy));
        if (!lease.ok) return json(res, lease.code === 'RATE_LIMITED' ? 429 : 503,
          { ok: false, error: { code: lease.code, message: lease.code === 'BUSY' ? 'Too many requests in progress.' : 'Request limit reached.' } },
          { 'Retry-After': String(lease.retryAfter) });
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), requestTimeoutMs);
        // Do not cache the random result; each requested draw is fresh.
        try {
          const data = await invoke(name, input, { signal: abort.signal });
          return json(res, 200, { ok: true, data });
        } finally { clearTimeout(timeout); lease.release(); }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405,
        { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
      const asset = STATIC[path];
      if (!asset) return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Page not found.' } });
      const [filename, contentType] = asset;
      const content = await readFile(join(staticDir, filename));
      res.writeHead(200, { ...HEADERS, 'Content-Type': contentType, 'Cache-Control': filename === 'index.html' ? 'no-cache' : 'public, max-age=300' });
      return res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      const bad = error instanceof ApiInputError;
      const aborted = error?.name === 'AbortError' || error?.name === 'TimeoutError';
      const upstream = /Wikipedia|rate limiting|exhaust/i.test(error?.message ?? '');
      return json(res, bad ? 400 : aborted ? 504 : upstream ? 502 : 500, {
        ok: false, error: { code: bad ? 'INVALID_INPUT' : aborted ? 'UPSTREAM_TIMEOUT' : upstream ? 'WIKIPEDIA_UNAVAILABLE' : 'INTERNAL_ERROR',
          message: bad ? error.message : aborted ? 'Wikipedia request timed out.' : upstream ? 'Wikipedia is temporarily unavailable. Please retry.' : 'Request failed.' }
      });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const wikipedia = new WikipediaAPI({ contact: process.env.WIKIMEDIA_CONTACT });
    const server = createWikiSite({ wikipedia, trustProxy: process.env.TRUST_PROXY === '1' });
    const host = process.env.HOST ?? '127.0.0.1';
    const port = Number(process.env.PORT ?? 3100);
    server.listen(port, host, () => console.log(`WikiSpark site listening at http://${host}:${server.address().port}`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
