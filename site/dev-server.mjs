import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.PORT) || 4173;
const workerPath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/server/index.js');
let loadedWorker;
async function currentWorker() {
  const { mtimeMs } = await stat(workerPath);
  if (loadedWorker?.mtimeMs !== mtimeMs) {
    loadedWorker = { mtimeMs, worker: (await import(`../dist/server/index.js?v=${mtimeMs}`)).default };
  }
  return loadedWorker.worker;
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers(incoming.headers);
    // Local preview cannot establish Sites identity. Keep the live endpoint closed.
    headers.delete('oai-authenticated-user-id');
    const origin = `${incoming.headers['x-forwarded-proto'] || 'http'}://${incoming.headers.host || 'localhost'}`;
    const method = incoming.method || 'GET';
    const init = { method, headers };
    if (method !== 'GET' && method !== 'HEAD') {
      const chunks = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.byteLength;
        if (size > 16 * 1024) {
          outgoing.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
          outgoing.end('{"error":{"code":"body_too_large"}}');
          return;
        }
        chunks.push(chunk);
      }
      init.body = Buffer.concat(chunks);
    }
    const response = await (await currentWorker()).fetch(new Request(new URL(incoming.url || '/', origin), init), {});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end('Preview request failed.');
  }
});

server.listen(port, '0.0.0.0', () => process.stdout.write(`WikiSpark preview listening on ${port}\n`));
