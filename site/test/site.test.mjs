import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWikiSite } from '../server.mjs';
import { SlidingWindowLimiter } from '../limits.mjs';
import { createSiteService, validateToolInput, ApiInputError } from '../service.mjs';
import { INITIAL_DISCOVERY, reduceDiscovery } from '../public/machine.js';
import { SITE_TOOLS } from '../public/webmcp.js';

function fakeWiki() {
  let serial = 0;
  const article = (lang, title = `Article ${++serial}`) => ({
    title, extract: 'A sourced Wikipedia article introduction with enough characters to pass the minimum excerpt length and exercise the output.',
    revision_id: 321, page_id: serial, language: lang, fetched_at: '2026-11-06T00:00:00.000Z',
    url: 'javascript:alert(1)', permalink: 'javascript:alert(1)', source: 'Wikipedia'
  });
  return {
    randomArticles: async ({ language, count, signal }) => {
      signal?.throwIfAborted();
      return Array.from({ length: count }, () => article(language));
    },
    search: async (query, { language, limit }) => ({ query, language,
      results: [{ title: 'Article', snippet: 'summary', url: `https://${language}.wikipedia.org/wiki/Article` }].slice(0, limit) }),
    read: async (title, { language }) => article(language, title),
    readMany: async (titles, { language }) => titles.map((title) => article(language, title))
  };
}
async function serverFixture(t, options = {}) {
  const server = createWikiSite({ wikipedia: fakeWiki(), ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function post(url, name, args, headers = {}) {
  return fetch(`${url}/api/tools/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(args) });
}

test('site serves semantic HTML, modules and secure response headers', async (t) => {
  const base = await serverFixture(t);
  const r = await fetch(base); const body = await r.text();
  assert.equal(r.status, 200);
  assert.match(body, /知らない世界を/);
  assert.match(body, /id="discover-button"/);
  assert.match(body, /name="description"/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/machine.js`)).status, 200);
  assert.equal((await fetch(`${base}/../src/mcp.mjs`)).status, 404);
});

test('public discovery works without authentication and returns genuine provenance fields', async (t) => {
  const base = await serverFixture(t);
  const a = await post(base, 'wiki_discover', {});
  const first = await a.json();
  assert.equal(a.status, 200);
  assert.equal(first.ok, true);
  assert.equal(first.data.article.language, 'ja');
  assert.equal(first.data.explanation_status, 'requires_client_ai');
  assert.match(first.data.article.url, /^https:\/\/ja\.wikipedia\.org\/wiki\//);
  assert.match(first.data.article.permalink, /^https:\/\/ja\.wikipedia\.org\/w\/index.php\?oldid=321/);
  assert.match(first.data.snapshot_sha256, /^[a-f0-9]{64}$/);
  const b = await post(base, 'wiki_discover', { language: 'en' });
  const second = await b.json();
  assert.equal(b.status, 200);
  assert.match(second.data.article.url, /^https:\/\/en\.wikipedia\.org\/wiki\//);
  assert.notEqual(first.data.article.title, second.data.article.title);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).access, 'anonymous');
});

test('all five site tools use the same operations layer as stdio MCP', async (t) => {
  const base = await serverFixture(t);
  const args = {
    wiki_discover: {}, wiki_random: { count: 2 }, wiki_read: { title: 'Earth' },
    wiki_search: { query: 'Earth', limit: 2 }, wiki_skill: { task: 'Help improve navigation', count: 1, mode: 'analogy' }
  };
  for (const [name, input] of Object.entries(args)) {
    const r = await post(base, name, input);
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify({ name, body }));
    assert.equal(body.ok, true);
    assert.ok(body.data);
  }
});

test('invalid inputs, unknown routes, wrong content types and cross-site requests are rejected', async (t) => {
  const base = await serverFixture(t);
  for (const value of [{ language: 'fr' }, { count: 2 }, { extra: 'value' }]) {
    const r = await post(base, 'wiki_discover', value);
    assert.equal(r.status, 400); assert.equal((await r.json()).error.code, 'INVALID_INPUT');
  }
  const cross = await post(base, 'wiki_discover', {}, { Origin: 'https://evil.example' });
  assert.equal(cross.status, 403);
  const fetchSite = await post(base, 'wiki_discover', {}, { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(fetchSite.status, 403);
  assert.equal((await post(base, 'wiki_unknown', {})).status, 404);
  const malformed = await fetch(`${base}/api/tools/wiki_discover`, { method: 'POST', body: '{invalid',
    headers: { 'Content-Type': 'application/json' } });
  assert.equal(malformed.status, 400);
  const wrongContent = await fetch(`${base}/api/tools/wiki_discover`, { method: 'POST', body: '{}',
    headers: { 'Content-Type': 'text/plain' } });
  assert.equal(wrongContent.status, 400);
});

test('API rejects excessive payloads and path traversal', async (t) => {
  const base = await serverFixture(t);
  const big = await fetch(`${base}/api/tools/wiki_search`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'x'.repeat(13000) }) });
  assert.equal(big.status, 400);
  const traversal = await fetch(`${base}/%2e%2e/%2e%2e/src/mcp.mjs`);
  assert.equal(traversal.status, 404);
});

test('single-instance anonymous rate limits and concurrency are bounded', () => {
  let now = 1000;
  const limiter = new SlidingWindowLimiter({ windowMs: 1000, perClient: 2, global: 3, concurrent: 2,
    perClientConcurrent: 1, now: () => now });
  const a = limiter.acquire('a'); assert.equal(a.ok, true);
  assert.equal(limiter.acquire('a').code, 'BUSY');
  const b = limiter.acquire('b'); assert.equal(b.ok, true);
  assert.equal(limiter.acquire('c').code, 'BUSY');
  a.release(); a.release(); assert.equal(limiter.active, 1);
  const a2 = limiter.acquire('a'); assert.equal(a2.ok, true);
  a2.release();b.release();
  assert.equal(limiter.acquire('a').code, 'RATE_LIMITED');
  assert.equal(limiter.acquire('c').code, 'RATE_LIMITED');
  now += 1001;
  const c = limiter.acquire('c'); assert.equal(c.ok, true); c.release();
});

test('server enforces the request limiter without leaking stack traces', async (t) => {
  const base = await serverFixture(t, { limiter: new SlidingWindowLimiter({ perClient: 1, global: 1 }) });
  assert.equal((await post(base, 'wiki_discover', {})).status, 200);
  const denied = await post(base, 'wiki_discover', {});
  assert.equal(denied.status, 429);
  const body = await denied.json();
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.equal(denied.headers.get('retry-after'), '60');
});

test('discovery state machine ignores stale responses and resets on language change', () => {
  const begin = reduceDiscovery(INITIAL_DISCOVERY, { type: 'START', source: 'page' });
  const next = reduceDiscovery(begin, { type: 'START', source: 'webmcp' });
  assert.equal(next.requestId, begin.requestId + 1);
  assert.equal(reduceDiscovery(next, { type: 'RESOLVE', requestId: begin.requestId, data: { article: { title: 'stale' } } }), next);
  const good = reduceDiscovery(next, { type: 'RESOLVE', requestId: next.requestId, data: { article: { title: 'fresh' } } });
  assert.equal(good.status, 'success');
  assert.equal(good.data.article.title, 'fresh');
  const changed = reduceDiscovery(good, { type: 'SET_LANGUAGE', language: 'en' });
  assert.equal(changed.status, 'idle'); assert.equal(changed.language, 'en'); assert.equal(changed.data, null);
  assert.equal(reduceDiscovery(changed, { type: 'REJECT', requestId: next.requestId, error: 'obsolete' }), changed);
  const canceled = reduceDiscovery(changed, { type: 'CANCEL' });
  assert.equal(canceled.requestId, changed.requestId + 1);
});

test('WebMCP exposes all five tools as read-only strict JSON Schema with no auth precondition', () => {
  assert.deepEqual(SITE_TOOLS.map((x) => x.name), ['wiki_discover', 'wiki_random', 'wiki_search', 'wiki_read', 'wiki_skill']);
  for (const t of SITE_TOOLS) {
    assert.equal(t.inputSchema.additionalProperties, false);
    assert.equal(t.inputSchema.type, 'object');
    assert.doesNotMatch(t.description, /login|sign.?in required/i);
  }
});

test('operation input validation rejects injection and malformed arrays', () => {
  assert.deepEqual(validateToolInput('wiki_discover', {}), { language: 'ja' });
  assert.throws(() => validateToolInput('wiki_read', { title: '' }), ApiInputError);
  assert.throws(() => validateToolInput('wiki_skill', { task: 'Hello', titles: ['a|b'] }), ApiInputError);
  assert.throws(() => validateToolInput('wiki_search', { query: 'hello', limit: '5' }), ApiInputError);
  assert.throws(() => validateToolInput('wiki_skill', { task: 'hi', mode: 'override_system' }), ApiInputError);
});
