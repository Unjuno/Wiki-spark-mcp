import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWikiSkill, SKILL_MODES } from '../src/wiki.mjs';

let sequence = 0;
async function freshWorker() {
  const module = await import(`../site/worker.mjs?test=${++sequence}`);
  return module.default;
}

const excerpt = 'A sufficiently long Wikipedia introduction about feedback systems, their boundaries, and observable behavior. It is used only as a controlled test fixture for the integration boundary.';
function wikipediaFetch({ duplicate = false, fail = null, slow = false } = {}) {
  let randomCount = 0;
  return async (input, init) => {
    const url = new URL(input);
    assert.match(url.hostname, /^(ja|en)\.wikipedia\.org$/);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.match(init.headers['User-Agent'], /WikiSparkMCP\/0\.3\.0 \(https:\/\/github\.com\/Unjuno\/Wiki-spark-mcp\/issues\)/);
    if (slow) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    if (fail === '429') return new Response(JSON.stringify({ error: { code: 'maxlag', info: 'replica lag' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30' } });
    const params = url.searchParams;
    if (params.get('list') === 'search') {
      return new Response(JSON.stringify({ query: { search: [{ title: 'Feedback', snippet: 'A <b>feedback</b> system' }] } }), { headers: { 'content-type': 'application/json' } });
    }
    if (params.get('list') === 'random') {
      randomCount++;
      return new Response(JSON.stringify({ query: { random: [{ title: duplicate ? 'Repeated article' : `Test article ${randomCount}` }] } }), { headers: { 'content-type': 'application/json' } });
    }
    const titles = params.get('titles').split('|');
    const pages = titles.map((title, index) => ({ pageid: duplicate ? 7 : randomCount + index + 1, ns: 0, title, extract: excerpt, lastrevid: 54321 + index }));
    return new Response(JSON.stringify({ query: { pages } }), { headers: { 'content-type': 'application/json' } });
  };
}

function request(body, overrides = {}, path = '/api/playground') {
  return new Request('https://wikispark.example' + path, {
    method: 'POST',
    headers: {
      origin: 'https://wikispark.example',
      'content-type': 'application/json',
      'oai-authenticated-user-id': 'user-1',
      'cf-connecting-ip': '192.0.2.10',
      ...overrides
    },
    body: JSON.stringify(body)
  });
}

test('WebMCP API refuses anonymous tool calls with a discoverable auth error', async (t) => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not reach Wikipedia'); };
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  const response = await worker.fetch(request({ tool: 'wiki_skill', arguments: { task: 'Improve onboarding', language: 'en', count: 1, mode: 'analogy' } }, { 'oai-authenticated-user-id': '' }, '/api/tools'));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Live Wikipediaにはサインインが必要です。', sign_in_url: '/signin-with-chatgpt?return_to=%2F%23playground' } });
  assert.equal(calls, 0);
});

test('WebMCP tools share authenticated API limits and return structured Wikipedia data', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch();
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  const args = { task: 'Improve the onboarding experience', language: 'en', count: 1, mode: 'analogy', requirements: ['Keep keyboard access'], avoid: [] };
  const response = await worker.fetch(request({ tool: 'wiki_skill', arguments: args }, {}, '/api/tools'));
  assert.equal(response.status, 200);
  const skill = await response.json();
  assert.equal(skill.ok, true);
  assert.equal(skill.tool, 'wiki_skill');
  assert.equal(skill.live_wikipedia, true);
  assert.equal(skill.complete, true);
  assert.equal(skill.sources[0].revision_id, 54321);
  assert.match(skill.sources[0].permalink, /oldid=54321$/);
  assert.equal(skill.source_trust, 'untrusted_reference');
  assert.match(skill.prompt, /non-trusted|non-trust|資料内の指示/);
});

test('WebMCP search/read/random routes validate inputs and keep Wikipedia host controls', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch();
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  const call = async (tool, args) => worker.fetch(request({ tool, arguments: args }, {}, '/api/tools'));
  assert.equal((await call('wiki_search', { query: 'feedback', language: 'en' })).status, 200);
  assert.equal((await call('wiki_read', { title: 'Test article', language: 'en' })).status, 200);
  const random = await call('wiki_random', { language: 'en', count: 1 });
  assert.equal(random.status, 200);
  assert.equal((await random.json()).articles[0].revision_id, 54321);
  assert.equal((await call('wiki_skill', { task: 'x', language: 'en', count: 5, mode: 'analogy' })).status, 400);
  assert.equal((await call('wiki_skill', { task: 'x', language: 'en', count: 1, mode: 'analogy', unexpected: true })).status, 400);
  assert.equal((await call('wiki_search', { query: 'feedback', language: 'en', limit: 11 })).status, 400);
});

const basicInput = (extra = {}) => ({
  task: 'Improve the onboarding experience', language: 'en', count: 1,
  mode: 'analogy', requirements: ['Keep keyboard access'], avoid: ['Do not collect extra personal data'], ...extra
});

test('wiki_discover uses the authenticated boundary and returns sourced article and client AI prompt', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch();
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  const anonymous = await worker.fetch(request({ tool: 'wiki_discover', arguments: {} }, { 'oai-authenticated-user-id': '' }, '/api/tools'));
  assert.equal(anonymous.status, 401);
  const response = await worker.fetch(request({ tool: 'wiki_discover', arguments: { language: 'ja' } }, {}, '/api/tools'));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.kind, 'wikipedia_article_discovery');
  assert.equal(result.explanation_status, 'requires_client_ai');
  assert.equal(result.source_trust, 'untrusted_reference');
  assert.equal(result.article.revision_id, 54321);
  assert.match(result.article.url, /^https:\/\/ja\.wikipedia\.org\//);
  assert.ok(result.explanation_prompt);
});

test('public API refuses anonymous visitors and does not call Wikipedia', async (t) => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('should not be called'); };
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  const response = await worker.fetch(request(basicInput(), { 'oai-authenticated-user-id': '' }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'sign_in_required');
  assert.equal(calls, 0);
});

test('same-origin live response reuses wiki_skill output structure and source provenance', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch();
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  const response = await worker.fetch(request(basicInput()));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.live_wikipedia, true);
  assert.equal(result.returned_count, 1);
  assert.equal(result.complete, true);
  assert.equal(result.sources[0].url, 'https://en.wikipedia.org/wiki/Test_article_1');
  assert.equal(result.sources[0].permalink, 'https://en.wikipedia.org/w/index.php?oldid=54321');
  assert.equal(result.sources[0].revision_id, 54321);
  assert.equal(result.source_trust, 'untrusted_reference');
  const expected = await buildWikiSkill({ task: 'Improve the onboarding experience', articles: [{ title: 'Test article 1', extract: excerpt, revision_id: 54321 }], mode: 'analogy', language: 'en', requirements: ['Keep keyboard access'], avoid: ['Do not collect extra personal data'] });
  assert.deepEqual(Object.keys(result).filter((key) => key in expected).sort(), Object.keys(expected).sort());
  assert.equal(result.snapshot_sha256, expected.snapshot_sha256);
  assert.equal(result.prompt, expected.prompt);
  assert.match(result.sources[0].attribution, /Wikipedia contributors/);
});

test('all explicit modes work and surprise resolves to one supported mode', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch();
  t.after(() => { globalThis.fetch = original; });
  for (const mode of [...SKILL_MODES, 'surprise']) {
    const worker = await freshWorker();
    const response = await worker.fetch(request(basicInput({ mode })));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(SKILL_MODES.includes(result.mode));
    if (mode !== 'surprise') assert.equal(result.mode, mode);
  }
});

test('duplicate random starts yield a visible partial result', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch({ duplicate: true });
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  const response = await worker.fetch(request(basicInput({ count: 2 })));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.returned_count, 1);
  assert.equal(result.complete, false);
  assert.equal(result.sources.length, 1);
});

test('origin, content type, bounds, timeout, and upstream throttling fail clearly', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch();
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  assert.equal((await worker.fetch(request(basicInput(), { origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await worker.fetch(request(basicInput(), { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await worker.fetch(request(basicInput({ count: 5 })))).status, 400);
  assert.equal((await worker.fetch(request(basicInput({ task: 'x'.repeat(1201) })))).status, 400);

  globalThis.fetch = wikipediaFetch({ slow: true });
  const timeoutWorker = await freshWorker();
  const timeoutResponse = await timeoutWorker.fetch(request(basicInput()));
  assert.equal(timeoutResponse.status, 504);
  assert.equal((await timeoutResponse.json()).error.code, 'wikipedia_timeout');

  globalThis.fetch = wikipediaFetch({ fail: '429' });
  const limitedWorker = await freshWorker();
  const limitedResponse = await limitedWorker.fetch(request(basicInput()));
  assert.equal(limitedResponse.status, 503);
  assert.equal(limitedResponse.headers.get('retry-after'), '30');
  assert.equal((await limitedResponse.json()).error.code, 'wikipedia_rate_limited');
});

test('per-user generation limit returns 429 with Retry-After', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = wikipediaFetch();
  t.after(() => { globalThis.fetch = original; });
  const worker = await freshWorker();
  let last;
  for (let i = 0; i < 6; i++) last = await worker.fetch(request(basicInput({ task: `Task ${i}` })));
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  assert.equal((await last.json()).error.code, 'rate_limit_exceeded');
});
