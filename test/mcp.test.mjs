import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { VERSION } from '../src/version.mjs';
const serverPath = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const preload = fileURLToPath(new URL('./fixtures/fetch.mjs', import.meta.url));
const expectedTools = ['wiki_random', 'wiki_read', 'wiki_search', 'wiki_skill'];

for (const era of ['legacy', 'modern']) {
  test(`real stdio SDK transport: ${era}`, { timeout: 45000 }, async (t) => {
    const options = era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {};
    const client = new Client({ name: 'wiki-spark-test', version: VERSION }, options);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--import', preload, serverPath],
      env: { ...process.env, WIKIMEDIA_CONTACT: 'https://github.com/Unjuno/Wiki-spark-mcp/issues' }, stderr: 'pipe' });
    let stderr = '';
    transport.stderr?.on('data', (chunk) => { stderr += chunk; });
    t.after(async () => { await client.close(); assert.ok(!stderr.includes('TypeError'), stderr); });
    await client.connect(transport);
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text));
      return result.structuredContent;
    };
    await t.test('four discoverable, annotated read-only tools', async () => {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((tool) => tool.name).sort(), expectedTools);
      assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
    });
    for (const language of ['ja', 'en']) {
      await t.test(`search/read ${language}`, async () => {
        const search = await call('wiki_search', { query: 'Earth', language });
        assert.equal(search.results[0].snippet, 'synthetic result');
        const read = await call('wiki_read', { title: 'Earth', language });
        assert.equal(read.revision_id, 42);
        assert.ok(read.url.startsWith(`https://${language}.wikipedia.org/`));
      });
    }
    await t.test('random default count and uniqueness', async () => {
      const result = await call('wiki_random', {});
      assert.equal(result.returned_count, 3);
      assert.equal(result.complete, true);
      assert.equal(new Set(result.articles.map((a) => a.title)).size, 3);
    });
    for (const mode of ['analogy', 'constraint', 'critique', 'surprise']) {
      await t.test(`skill ${mode}`, async () => {
        const result = await call('wiki_skill', { task: 'Improve an interface', count: 1, mode, requirements: ['Keep the main action'] });
        assert.equal(result.version, VERSION);
        assert.ok(['analogy', 'constraint', 'critique'].includes(result.mode));
        assert.equal(result.source_trust, 'untrusted_reference');
        assert.equal(result.sources.length, 1);
        assert.match(result.snapshot_sha256, /^[a-f0-9]{64}$/);
        assert.ok(result.prompt.includes('Keep the main action'));
        assert.ok(!result.prompt.includes('Synthetic test data'));
      });
    }
    await t.test('short extracts produce explicit partial success', async () => {
      const result = await call('wiki_skill', { task: 'Improve', titles: ['Earth', 'Tiny'] });
      assert.equal(result.complete, false);
      assert.equal(result.returned_count, 1);
      assert.equal(result.requested_count, 2);
    });
    await t.test('missing article is a tool error, not a transport crash', async () => {
      const missing = await client.callTool({ name: 'wiki_read', arguments: { title: 'Missing' } });
      assert.equal(missing.isError, true);
      assert.match(missing.content[0].text, /not found/);
      await call('wiki_read', { title: 'Earth' });
    });
    await t.test('unsupported language and oversized count rejected', async () => {
      for (const args of [{ language: 'evil.example' }, { count: 5 }]) {
        try {
          const result = await client.callTool({ name: 'wiki_random', arguments: args });
          assert.equal(result.isError, true);
        } catch (error) {
          assert.match(String(error), /invalid|validation|language|count|schema/i);
        }
      }
    });
  });
}

test('entrypoint fails clearly without a contact and keeps stdout clean', () => {
  const env = { ...process.env }; delete env.WIKIMEDIA_CONTACT;
  const result = spawnSync(process.execPath, [serverPath], { env, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /WIKIMEDIA_CONTACT/);
});
