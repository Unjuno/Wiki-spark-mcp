import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WikipediaAPI, buildWikiSkill, cleanText, wikipediaArticleUrl,
  selectSkillMode, SKILL_MODES
} from '../src/wiki.mjs';

function mockResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const extract = 'これはテスト用のWikipedia抜粋です。異分野に関する説明が十分な長さで記載され、比較検証が必要になります。理論や目的を区別することで創造的な探索を安全に実施します。';
const page = (title, revisionId = 123456) => ({
  pageid: Array.from(title).reduce((n, c) => (n * 31 + c.codePointAt(0)) % 1000000007, 100),
  ns: 0,
  title,
  extract,
  lastrevid: revisionId
});
const fakeSource = (title = '地球') => ({
  title, extract, url: wikipediaArticleUrl('ja', title), revision_id: 123456
});

function mockAPI(fetchImpl) {
  return new WikipediaAPI({ contact: 'dev@example.org', fetchImpl });
}

test('Wikipedia hosts are restricted and article titles URL-encoded', () => {
  assert.match(wikipediaArticleUrl('ja', '量子 力学'), /^https:\/\/ja.wikipedia.org\/wiki\//);
  assert.match(wikipediaArticleUrl('en', 'Energy'), /^https:\/\/en.wikipedia.org\/wiki\//);
  assert.throws(() => wikipediaArticleUrl('evil.example', 'x'), /Unsupported language/);
});

test('cleanText removes HTML, markup entities and control characters', () => {
  assert.equal(cleanText(' <span class="x">hi</span> &amp; bye\u0000 '), 'hi & bye');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText('abcdef', 3), 'abc');
});

test('Wikimedia requests require a clean contact value and bounded timeout', () => {
  assert.throws(() => new WikipediaAPI(), /WIKIMEDIA_CONTACT/);
  assert.throws(() => new WikipediaAPI({ contact: 'x\r\nInjected: yes' }), /WIKIMEDIA_CONTACT/);
  assert.throws(() => new WikipediaAPI({ contact: 'dev@example.org', timeoutMs: 0 }), /timeoutMs/);
});

test('search supplies a Wikimedia User-Agent and removes HTML from snippets', async () => {
  let observed;
  const api = mockAPI(async (url, options) => {
    observed = { url: String(url), headers: options.headers };
    return mockResponse({ query: { search: [{ title: '地球', snippet: '<span>惑星</span>' }] } });
  });
  const result = await api.search(' 地球 ');
  assert.equal(result.query, '地球');
  assert.equal(result.results[0].snippet, '惑星');
  assert.match(result.results[0].url, /ja.wikipedia.org/);
  assert.match(observed.headers['User-Agent'], /dev@example.org/);
  assert.match(observed.url, /list=search/);
  assert.match(observed.url, /^https:\/\/ja.wikipedia.org\/w\/api.php/);
});

test('search rejects invalid input and an unsupported language', async () => {
  const api = mockAPI(async () => mockResponse({}));
  await assert.rejects(api.search(''), /Invalid search query/);
  await assert.rejects(api.search('ok', { limit: 20 }), /limit/);
  await assert.rejects(api.search('ok', { language: 'zz' }), /Unsupported language/);
});

test('read emits revision metadata, stable URL and a fetch timestamp', async () => {
  const api = mockAPI(async () => mockResponse({ query: { pages: [page('地球')] } }));
  const article = await api.read('地球');
  assert.equal(article.revision_id, 123456);
  assert.equal(article.permalink, 'https://ja.wikipedia.org/w/index.php?oldid=123456');
  assert.equal(article.source, 'Wikipedia');
  assert.equal(article.page_id, page('地球').pageid);
  assert.ok(Number.isFinite(Date.parse(article.fetched_at)));
});

test('read gracefully records absent revision metadata', async () => {
  const api = mockAPI(async () => mockResponse({ query: { pages: [page('地球', null)] } }));
  const article = await api.read('地球');
  assert.equal(article.revision_id, null);
  assert.equal(article.permalink, null);
});

test('read reports missing pages', async () => {
  const api = mockAPI(async () => mockResponse({ query: { pages: [{ title: 'missing', missing: true }] } }));
  await assert.rejects(api.read('missing'), /not found/);
});

test('readMany rejects multi-title delimiter in a single title', async () => {
  const api = mockAPI(async () => mockResponse({ query: { pages: [] } }));
  await assert.rejects(api.read('Earth|Moon'), /no pipes/);
});

test('random sampling requests separate starts and returns revisioned sources', async () => {
  const requested = [];
  let next = 0;
  const api = mockAPI(async (url) => {
    const params = new URL(url).searchParams;
    if (params.get('list') === 'random') {
      assert.equal(params.get('rnlimit'), '1');
      const title = `題材${next++}`;
      requested.push(title);
      return mockResponse({ query: { random: [{ title }] } });
    }
    return mockResponse({ query: { pages: params.get('titles').split('|').map((title) => page(title)) } });
  });
  const articles = await api.randomArticles({ count: 3 });
  assert.equal(articles.length, 3);
  assert.equal(requested.length, 3);
  assert.equal(new Set(articles.map((entry) => entry.title)).size, 3);
  assert.ok(articles.every((entry) => entry.permalink?.includes('oldid=')));
});

test('random sampling retries empty extracts with a bounded second round', async () => {
  let index = 0;
  const api = mockAPI(async (url) => {
    const params = new URL(url).searchParams;
    if (params.get('list') === 'random') {
      return mockResponse({ query: { random: [{ title: `題材${index++}` }] } });
    }
    const pages = params.get('titles').split('|').map((title) => {
      const result = page(title);
      if (title === '題材0') result.extract = '短い';
      return result;
    });
    return mockResponse({ query: { pages } });
  });
  const articles = await api.randomArticles({ count: 2 });
  assert.equal(articles.length, 2);
  assert.ok(!articles.some((article) => article.title === '題材0'));
  assert.equal(index, 3);
});

test('random sampling is bounded for repeated identical titles', async () => {
  let calls = 0;
  const api = mockAPI(async (url) => {
    const params = new URL(url).searchParams;
    if (params.get('list') === 'random') {
      calls++;
      return mockResponse({ query: { random: [{ title: '唯一の記事' }] } });
    }
    return mockResponse({ query: { pages: [page('唯一の記事')] } });
  });
  const articles = await api.randomArticles({ count: 3 });
  assert.equal(articles.length, 1);
  assert.ok(calls <= 12, `bounded retries: ${calls}`);
});

test('random sampling reports no usable articles', async () => {
  const api = mockAPI(async (url) => {
    const params = new URL(url).searchParams;
    return params.get('list') === 'random'
      ? mockResponse({ query: { random: [] } })
      : mockResponse({ query: { pages: [] } });
  });
  await assert.rejects(api.randomArticles({ count: 1 }), /no usable random articles/);
});

test('random sampling enforces count bounds', async () => {
  const api = mockAPI(async () => mockResponse({}));
  await assert.rejects(api.randomArticles({ count: 0 }), /Random count/);
  await assert.rejects(api.randomArticles({ count: 5 }), /Random count/);
});

test('wiki_skill separates sourced facts and hypotheses and uses safe URLs', async () => {
  const source = { ...fakeSource(), url: 'https://evil.example/steal' };
  const skill = await buildWikiSkill({ task: 'LPの改善', articles: [source], mode: 'analogy' });
  assert.equal(skill.mode, 'analogy');
  assert.equal(skill.replay.titles[0], '地球');
  assert.match(skill.prompt, /仮説/);
  assert.match(skill.prompt, /非信頼/);
  assert.ok(!skill.prompt.includes('evil.example'));
  assert.ok(skill.sources[0].url.startsWith('https://ja.wikipedia.org/'));
  assert.match(skill.snapshot_sha256, /^[0-9a-f]{64}$/);
});

test('wiki_skill supports explicit requirements and avoided changes', async () => {
  const skill = await buildWikiSkill({
    task: 'ページ改善', articles: [fakeSource()], mode: 'constraint',
    requirements: ['WCAGを満たす', '購入ボタンは残す'], avoid: ['個人情報の収集']
  });
  assert.equal(skill.mode, 'constraint');
  assert.ok(skill.prompt.includes('購入ボタンは残す'));
  assert.ok(skill.prompt.includes('個人情報の収集'));
  assert.deepEqual(skill.replay.requirements, ['WCAGを満たす', '購入ボタンは残す']);
});

test('wiki_skill fingerprint is deterministic for the same snapshot', async () => {
  const data = { task: '変更', articles: [fakeSource()], mode: 'critique' };
  const first = await buildWikiSkill(data);
  const second = await buildWikiSkill(data);
  assert.equal(first.snapshot_sha256, second.snapshot_sha256);
  assert.notEqual(first.snapshot_sha256, (await buildWikiSkill({ ...data, task: '別の変更' })).snapshot_sha256);
});

test('wiki_skill rejects invalid rules and modes', async () => {
  const base = { task: '変更', articles: [fakeSource()] };
  await assert.rejects(buildWikiSkill({ ...base, mode: 'surprise' }), /Unknown skill mode/);
  await assert.rejects(buildWikiSkill({ ...base, avoid: ['x'.repeat(201)] }), /avoid must be/);
  await assert.rejects(buildWikiSkill({ ...base, requirements: Array(9).fill('x') }), /requirements must be/);
});

test('mode generator returns only supported skills', () => {
  for (let i = 0; i < 100; i++) assert.ok(SKILL_MODES.includes(selectSkillMode()));
});

test('API respects a long Retry-After without retrying prematurely', async () => {
  let calls = 0;
  const api = mockAPI(async () => {
    calls++;
    return mockResponse({ error: 'rate-limited' }, 429, { 'retry-after': '30' });
  });
  await assert.rejects(api.search('地球'), /retry after 30 seconds/);
  assert.equal(calls, 1);
});

test('API retries 503 once, with a successful JSON result', async () => {
  let calls = 0;
  const api = mockAPI(async () => {
    calls++;
    return calls === 1
      ? mockResponse({}, 503, { 'retry-after': '0' })
      : mockResponse({ query: { search: [] } });
  });
  const result = await api.search('地球');
  assert.deepEqual(result.results, []);
  assert.equal(calls, 2);
});

test('API returns errors for malformed JSON and MediaWiki error responses', async () => {
  const invalid = mockAPI(async () => new Response('not-json', { status: 200 }));
  await assert.rejects(invalid.search('地球'), /invalid JSON/);
  const rejected = mockAPI(async () => mockResponse({ error: { code: 'badrequest', info: 'invalid parameter' } }));
  await assert.rejects(rejected.search('地球'), /invalid parameter/);
});
