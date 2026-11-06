import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WikipediaAPI } from '../src/wiki.mjs';
import { createWikiSite } from '../site/server.mjs';
import { VERSION } from '../src/version.mjs';

/** Real HTTP → site JSON API → shared Wikipedia operation → Wikimedia.
 * Requires the operator's genuine WIKIMEDIA_CONTACT. No mock or login.
 */
async function main() {
  const wikipedia = new WikipediaAPI({ contact: process.env.WIKIMEDIA_CONTACT });
  const server = createWikiSite({ wikipedia });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const healthResponse = await fetch(`${base}/api/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.access, 'anonymous');
    assert.equal(health.version, VERSION);
    const checks = [];
    for (const language of ['ja', 'en']) {
      const response = await fetch(`${base}/api/tools/wiki_discover`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify({ language })
      });
      const payload = await response.json();
      assert.equal(response.status, 200, `${language}: ${JSON.stringify(payload)}`);
      assert.equal(payload.ok, true);
      assert.equal(payload.data.language, language);
      assert.equal(payload.data.kind, 'wikipedia_article_discovery');
      assert.equal(payload.data.source_trust, 'untrusted_reference');
      assert.equal(payload.data.explanation_status, 'requires_client_ai');
      assert.ok(payload.data.article.title.length > 0);
      assert.ok(payload.data.article.extract.length >= 60);
      assert.ok(payload.data.article.url.startsWith(`https://${language}.wikipedia.org/wiki/`));
      assert.match(payload.data.snapshot_sha256, /^[a-f0-9]{64}$/);
      checks.push({ name: 'wiki_discover', language, status: 'PASS',
        source: payload.data.article.url, revision_id: payload.data.article.revision_id });
      console.log(`PASS public HTTP wiki_discover ${language}: ${payload.data.article.title}`);
    }
    console.log(JSON.stringify({ status: 'PASS', mocked: false,
      channel: 'anonymous_public_http', access: 'anonymous', checks }, null, 2));
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
