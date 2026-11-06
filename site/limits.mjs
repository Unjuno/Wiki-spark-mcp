/** Bounded in-process anti-abuse protection for a single-server deployment.
 * Not a distributed quota. Production multi-replica hosting needs a shared limiter.
 */
export class SlidingWindowLimiter {
  constructor({ windowMs = 60_000, perClient = 12, global = 90,
    concurrent = 3, perClientConcurrent = 1, now = Date.now } = {}) {
    this.windowMs = windowMs; this.perClient = perClient; this.global = global;
    this.concurrent = concurrent; this.perClientConcurrent = perClientConcurrent;
    this.now = now; this.clients = new Map(); this.globalHits = [];
    this.active = 0; this.activeClients = new Map();
  }
  acquire(clientKey) {
    const now = this.now(); const min = now - this.windowMs;
    this.globalHits = this.globalHits.filter((at) => at > min);
    for (const [key, timestamps] of this.clients) {
      const kept = timestamps.filter((at) => at > min);
      if (kept.length) this.clients.set(key, kept); else this.clients.delete(key);
    }
    const hits = this.clients.get(clientKey) ?? [];
    if (hits.length >= this.perClient || this.globalHits.length >= this.global)
      return { ok: false, code: 'RATE_LIMITED', retryAfter: Math.ceil(this.windowMs / 1000) };
    if (this.active >= this.concurrent || (this.activeClients.get(clientKey) ?? 0) >= this.perClientConcurrent)
      return { ok: false, code: 'BUSY', retryAfter: 2 };
    hits.push(now); this.clients.set(clientKey, hits);
    this.globalHits.push(now); this.active++;
    this.activeClients.set(clientKey, (this.activeClients.get(clientKey) ?? 0) + 1);
    let released = false;
    return { ok: true, release: () => {
      if (released) return;
      released = true; this.active--;
      const active = (this.activeClients.get(clientKey) ?? 1) - 1;
      if (active > 0) this.activeClients.set(clientKey, active);
      else this.activeClients.delete(clientKey);
    } };
  }
}
