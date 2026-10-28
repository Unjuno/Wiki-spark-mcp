import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const html = await readFile(resolve(root, 'site/index.html'), 'utf8');
const workerTemplate = await readFile(resolve(root, 'site/worker.mjs'), 'utf8');
const marker = '"__WIKISPARK_HTML__"';
if (!workerTemplate.includes(marker)) throw new Error('Worker HTML marker is missing.');

function bundleModule(source, { entry = false } = {}) {
  let output = source
    .replace(/^import .*;\n/gm, '')
    .replace(/^export (?=(?:const|class|function|async function)\b)/gm, '');
  if (entry) output = output.replace('export default {', 'const worker = {').replace(/\n};\s*$/, '\n};\nexport default worker;');
  return output;
}

const version = await readFile(resolve(root, 'src/version.mjs'), 'utf8');
const http = await readFile(resolve(root, 'src/http.mjs'), 'utf8');
const wiki = await readFile(resolve(root, 'src/wiki.mjs'), 'utf8');
const bundledWorker = [version, http, wiki, workerTemplate].map((source, index) => bundleModule(source, { entry: index === 3 })).join('\n');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await mkdir(resolve(dist, '.openai'), { recursive: true });
await writeFile(resolve(dist, 'server/index.js'), bundledWorker.replace(marker, JSON.stringify(html)));
await copyFile(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'));
console.log('Built WikiSpark Worker and static page.');
