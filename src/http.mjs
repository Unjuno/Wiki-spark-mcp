import { setTimeout as delay } from 'node:timers/promises';
import { VERSION } from './version.mjs';
const MAX_BYTES = 524288;

async function boundedJson(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error('Wikipedia response too large.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Wikipedia returned an empty response.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Wikipedia response too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Wikipedia API returned an invalid JSON response.'); }
}

// One sequential queue per server. Only fixed Wikipedia hosts are allowed.
export class WikiHttp {
  constructor({ contact, fetchImpl = globalThis.fetch, timeoutMs = 9000,
    minIntervalMs = 150, now = Date.now, sleepImpl = (ms, signal) => delay(ms, undefined, { signal }) } = {}) {
    if (typeof contact !== 'string' || !contact.trim() || /[^\x20-\x7e]/.test(contact) || contact.length > 200) {
      throw new Error('Set WIKIMEDIA_CONTACT to your genuine contact URL or email address.');
    }
    if (typeof fetchImpl !== 'function') throw new Error('fetchImpl must be a function.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('timeoutMs must be between 1 and 120000 milliseconds.');
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 0 || minIntervalMs > 3000) throw new Error('Invalid minimum request interval.');
    this.contact = contact.trim(); this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs;
    this.minIntervalMs = minIntervalMs; this.now = now; this.sleep = sleepImpl;
    this.tail = Promise.resolve(); this.nextAt = 0; this.cooldownUntil = 0; this.cache = new Map();
  }

  request(language, params, { signal } = {}) {
    if (!['ja', 'en'].includes(language)) return Promise.reject(new Error(`Unsupported language: ${language}`));
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', maxlag: '5', ...params });
    const run = this.tail.then(() => this.perform(url, params.list !== 'random', signal));
    this.tail = run.catch(() => {});
    return run;
  }

  rateError() {
    return new Error(`Wikipedia is rate limiting requests; retry after ${Math.max(1, Math.ceil((this.cooldownUntil - this.now()) / 1000))} seconds.`);
  }

  async perform(url, cacheable, operationSignal) {
    operationSignal?.throwIfAborted();
    const key = url.href;
    const cached = this.cache.get(key);
    if (cacheable && cached?.until > this.now()) return structuredClone(cached.data);
    if (this.cooldownUntil > this.now()) throw this.rateError();
    for (let attempt = 0; attempt < 2; attempt++) {
      operationSignal?.throwIfAborted();
      const wait = this.nextAt - this.now();
      if (wait > 0) await this.sleep(wait, operationSignal);
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const signal = operationSignal ? AbortSignal.any([timeout, operationSignal]) : timeout;
      let response, payload;
      try {
        this.nextAt = this.now() + this.minIntervalMs;
        response = await this.fetchImpl(url, {
          method: 'GET', redirect: 'error', signal,
          headers: { Accept: 'application/json', 'User-Agent': `WikiSparkMCP/${VERSION} (${this.contact}) Node.js/${process.versions.node}` }
        });
        if (response.redirected) throw new Error('Wikipedia redirects are not allowed.');
        if (response.ok) payload = await boundedJson(response, signal);
      } catch (error) {
        throw new Error(`Wikipedia request failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const limited = response.status === 429 || response.status === 503 || payload?.error?.code === 'maxlag';
      if (limited) {
        await response.body?.cancel().catch(() => {});
        const header = response.headers.get('retry-after');
        let waitMs = 600;
        if (header && /^\d+$/.test(header)) waitMs = Math.max(100, Number(header) * 1000);
        else if (header && Number.isFinite(Date.parse(header))) waitMs = Math.max(100, Date.parse(header) - this.now());
        this.cooldownUntil = this.now() + waitMs;
        if (waitMs > 3000 || attempt === 1) throw this.rateError();
        await this.sleep(waitMs, operationSignal);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`Wikipedia API HTTP ${response.status}`);
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid Wikipedia response payload.');
      if (payload.error) throw new Error(`Wikipedia API: ${String(payload.error.info || payload.error.code || 'unknown error').slice(0, 300)}`);
      const field = url.searchParams.get('list') || 'pages';
      if (!Array.isArray(payload.query?.[field])) throw new Error(`Invalid Wikipedia response: missing ${field} array.`);
      if (cacheable) {
        for (const [oldKey, entry] of this.cache) if (entry.until <= this.now()) this.cache.delete(oldKey);
        if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { until: this.now() + 60000, data: structuredClone(payload) });
      }
      return payload;
    }
    throw new Error('Wikipedia API could not complete the request.');
  }
}
