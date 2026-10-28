import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const html = await readFile(resolve(root, 'site/index.html'), 'utf8');
const workerTemplate = await readFile(resolve(root, 'site/worker.mjs'), 'utf8');
const marker = '"__WIKISPARK_HTML__"';
if (!workerTemplate.includes(marker)) throw new Error('Worker HTML marker is missing.');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await mkdir(resolve(dist, 'src'), { recursive: true });
await mkdir(resolve(dist, '.openai'), { recursive: true });
await writeFile(resolve(dist, 'server/index.js'), workerTemplate.replace(marker, JSON.stringify(html)));
for (const file of ['wiki.mjs', 'http.mjs', 'version.mjs']) {
  await copyFile(resolve(root, 'src', file), resolve(dist, 'src', file));
}
await copyFile(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'));
console.log('Built WikiSpark Worker and static page.');
