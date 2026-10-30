import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { VERSION } from '../src/version.mjs';
if (!process.env.WIKIMEDIA_CONTACT) throw new Error('Set WIKIMEDIA_CONTACT before live testing.');
const report = { version: VERSION, started_at: new Date().toISOString(), node: process.version,
  platform: process.platform, architecture: process.arch, mocked: false, results: [] };
const client = new Client({ name: 'wiki-spark-live-smoke', version: VERSION }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], env: { ...process.env }, stderr: 'inherit' }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 4);
  for (const [language, title] of [['ja', '地球'], ['en', 'Earth']]) {
    const cases = [
      ['wiki_search', { query: title, language, limit: 1 }],
      ['wiki_read', { title, language }],
      ['wiki_random', { language, count: 1 }],
      ['wiki_skill', { task: 'Improve navigation while preserving required actions', language, count: 1, mode: 'analogy', requirements: ['Preserve required actions'] }]
    ];
    for (const [name, args] of cases) {
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      const data = result.structuredContent;
      assert.ok(data && typeof data === 'object');
      if (name === 'wiki_search') assert.ok(data.results.length > 0);
      else if (name === 'wiki_read') assert.ok(data.extract.length > 0 && data.revision_id > 0);
      else { assert.equal(data.complete, true); assert.equal(data.returned_count, 1); }
      report.results.push({ name, language, status: 'PASS', data });
      console.log(`PASS ${name} ${language}`);
    }
  }
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = String(error); process.exitCode = 1;
  console.error(error);
} finally {
  await client.close();
  report.finished_at = new Date().toISOString();
  await mkdir('verification', { recursive: true });
  await writeFile('verification/live-smoke.json', JSON.stringify(report, null, 2) + '\n');
}
