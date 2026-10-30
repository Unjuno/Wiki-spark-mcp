// Test-only preload. Production never imports this file or accepts fixture paths.
let next = 0;
const excerpt = 'Synthetic test data: a system exchanges resources through a constrained interface. Compare assumptions and test any proposed transfer. '.repeat(2);
const id = (title) => Array.from(title).reduce((n, c) => (n * 31 + c.codePointAt(0)) % 1000000007, 100);
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (!['ja.wikipedia.org', 'en.wikipedia.org'].includes(url.hostname)) throw new Error('Unexpected fixture host');
  const p = url.searchParams;
  let data;
  if (p.get('list') === 'search') data = { query: { search: [{ title: p.get('srsearch'), snippet: '<span>synthetic</span> result' }] } };
  else if (p.get('list') === 'random') data = { query: { random: [{ title: `Sample${++next}` }] } };
  else data = { query: { pages: p.get('titles').split('|').map((title) => title === 'Missing'
    ? { title, missing: true }
    : { pageid: id(title), ns: 0, title, extract: title === 'Tiny' ? 'short' : excerpt, lastrevid: 42 }) } };
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
};
