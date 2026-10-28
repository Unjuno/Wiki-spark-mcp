import { WikipediaAPI, buildWikiSkill, selectSkillMode } from '../src/wiki.mjs';
import { VERSION } from '../src/version.mjs';

const PAGE_HTML = "__WIKISPARK_HTML__";
const CONTACT = 'https://github.com/Unjuno/Wiki-spark-mcp/issues';
const BODY_LIMIT = 16 * 1024;
const MAX_ACTIVE = 4;
const USER_LIMIT = 5;
const IP_LIMIT = 10;
const HOUR = 60 * 60 * 1000;

const users = new Map();
const ips = new Map();
const globalRequests = [];
const activeUsers = new Set();
let activeRequests = 0;
let wiki;

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    ...extraHeaders
  }
});

function identity(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  return typeof id === 'string' && id.length > 0 && id.length <= 256 ? id : null;
}

function trimWindow(entries, now) {
  while (entries.length && entries[0] <= now - HOUR) entries.shift();
}

function takeLimit(map, key, limit, now) {
  let entries = map.get(key);
  if (!entries) {
    if (map.size >= 5000) {
      for (const [oldKey, oldEntries] of map) {
        trimWindow(oldEntries, now);
        if (!oldEntries.length) map.delete(oldKey);
      }
      if (map.size >= 5000) return { allowed: false, retryAfter: 3600 };
    }
    entries = [];
    map.set(key, entries);
  }
  trimWindow(entries, now);
  if (entries.length >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((entries[0] + HOUR - now) / 1000)) };
  entries.push(now);
  return { allowed: true };
}

function rateLimit(request, userId) {
  const now = Date.now();
  trimWindow(globalRequests, now);
  if (globalRequests.length >= 48) return { allowed: false, retryAfter: 3600 };
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const user = takeLimit(users, userId, USER_LIMIT, now);
  if (!user.allowed) return user;
  const address = takeLimit(ips, ip.slice(0, 128), IP_LIMIT, now);
  if (!address.allowed) {
    users.get(userId)?.pop();
    return address;
  }
  globalRequests.push(now);
  return { allowed: true };
}

async function readBoundedJson(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) throw Object.assign(new Error('body_too_large'), { status: 413 });
  if (!request.body) throw Object.assign(new Error('invalid_json'), { status: 400 });
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw Object.assign(new Error('body_too_large'), { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

function validateInput(input) {
  if (typeof input.task !== 'string' || !input.task.trim() || input.task.length > 1200) throw Object.assign(new Error('task_invalid'), { status: 400 });
  if (!['ja', 'en'].includes(input.language)) throw Object.assign(new Error('language_invalid'), { status: 400 });
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 4) throw Object.assign(new Error('count_invalid'), { status: 400 });
  if (!['surprise', 'analogy', 'constraint', 'critique'].includes(input.mode)) throw Object.assign(new Error('mode_invalid'), { status: 400 });
  const validateRules = (rules, name) => {
    if (!Array.isArray(rules) || rules.length > 8 || rules.some((rule) => typeof rule !== 'string' || !rule.trim() || rule.length > 200)) {
      throw Object.assign(new Error(`${name}_invalid`), { status: 400 });
    }
    return rules.map((rule) => rule.trim().replace(/[\r\n]+/g, ' '));
  };
  return {
    task: input.task.trim(), language: input.language, count: input.count,
    requestedMode: input.mode,
    requirements: validateRules(input.requirements ?? [], 'requirements'),
    avoid: validateRules(input.avoid ?? [], 'avoid')
  };
}

function validateToolInput(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw Object.assign(new Error('arguments_invalid'), { status: 400 });
  const allowed = {
    wiki_search: ['query', 'language', 'limit'],
    wiki_read: ['title', 'language'],
    wiki_random: ['language', 'count'],
    wiki_skill: ['task', 'language', 'count', 'mode', 'requirements', 'avoid']
  }[tool];
  if (!allowed || Object.keys(args).some((key) => !allowed.includes(key))) throw Object.assign(new Error('arguments_invalid'), { status: 400 });
  if (tool === 'wiki_skill') return validateInput({ ...args, task: args.task, language: args.language ?? 'ja', count: args.count ?? 3, mode: args.mode ?? 'surprise', requirements: args.requirements ?? [], avoid: args.avoid ?? [] });
  const language = args.language ?? 'ja';
  if (!['ja', 'en'].includes(language)) throw Object.assign(new Error('language_invalid'), { status: 400 });
  if (tool === 'wiki_search') {
    if (typeof args.query !== 'string' || !args.query.trim() || args.query.trim().length > 200) throw Object.assign(new Error('query_invalid'), { status: 400 });
    const limit = args.limit ?? 5;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw Object.assign(new Error('limit_invalid'), { status: 400 });
    return { query: args.query.trim(), language, limit };
  }
  if (tool === 'wiki_read') {
    if (typeof args.title !== 'string' || !args.title.trim() || args.title.trim().length > 200) throw Object.assign(new Error('title_invalid'), { status: 400 });
    return { title: args.title.trim(), language };
  }
  if (tool === 'wiki_random') {
    const count = args.count ?? 3;
    if (!Number.isInteger(count) || count < 1 || count > 4) throw Object.assign(new Error('count_invalid'), { status: 400 });
    return { language, count };
  }
  throw Object.assign(new Error('tool_not_found'), { status: 404 });
}

async function execute(tool, input, signal) {
  wiki ||= new WikipediaAPI({ contact: CONTACT, timeoutMs: 9000, minIntervalMs: 150 });
  if (tool === 'wiki_search') return { tool, live_wikipedia: true, ...await wiki.search(input.query, { language: input.language, limit: input.limit, signal }) };
  if (tool === 'wiki_read') return { tool, live_wikipedia: true, article: await wiki.read(input.title, { language: input.language, signal }) };
  const articles = await wiki.randomArticles({ language: input.language, count: input.count, signal });
  const usable = articles.filter((article) => article.extract.length >= 60);
  if (tool === 'wiki_random') return { tool, live_wikipedia: true, requested_count: input.count, returned_count: usable.length, complete: usable.length === input.count, articles: usable };
  const mode = input.requestedMode === 'surprise' ? selectSkillMode() : input.requestedMode;
  const skill = await buildWikiSkill({ task: input.task, articles: usable, mode, language: input.language, requirements: input.requirements, avoid: input.avoid });
  return { ...skill, tool, requested_count: input.count, returned_count: usable.length, complete: usable.length === input.count, live_wikipedia: true };
}

async function authenticatedToolRequest(request, url, userId, toolName, args, env = {}) {
  if (!userId) return json({ ok: false, error: { code: 'sign_in_required', message: 'Live Wikipediaにはサインインが必要です。', sign_in_url: '/signin-with-chatgpt?return_to=%2F%23playground' } }, 401);
  if (activeUsers.has(userId)) return json({ ok: false, error: { code: 'USER_REQUEST_IN_PROGRESS', message: '取得処理が進行中です。' } }, 429, { 'retry-after': '5' });
  if (activeRequests >= MAX_ACTIVE) return json({ ok: false, error: { code: 'SERVER_BUSY', message: 'ただいま利用が集中しています。' } }, 429, { 'retry-after': '15' });
  let input;
  try { input = validateToolInput(toolName, args); }
  catch (error) { return errorResponse(error); }
  const limit = rateLimit(request, userId);
  if (!limit.allowed) return json({ ok: false, error: { code: 'rate_limit_exceeded', message: 'この時間帯の実行上限に達しました。' } }, 429, { 'retry-after': String(limit.retryAfter) });
  activeUsers.add(userId);
  activeRequests++;
  try { return json({ ok: true, ...await execute(toolName, input, AbortSignal.timeout(45000), env) }); }
  catch (error) { return errorResponse(error); }
  finally { activeUsers.delete(userId); activeRequests--; }
}

function errorResponse(error) {
  const status = error.status || (error.name === 'TimeoutError' || error.name === 'AbortError' || /timed? ?out|aborted due to timeout/i.test(error.message) ? 504 : /rate limiting/i.test(error.message) ? 503 : 502);
  if (status === 400 || status === 413) return json({ error: { code: error.message, message: status === 413 ? '入力が大きすぎます。内容を短くしてください。' : '入力を確認してもう一度お試しください。' } }, status);
  if (status === 504) return json({ error: { code: 'wikipedia_timeout', message: 'Wikipediaの応答が時間内に完了しませんでした。少し待って再試行してください。' } }, status);
  if (status === 503) {
    const retry = error.message.match(/retry after (\d+) seconds/i);
    return json({ error: { code: 'wikipedia_rate_limited', message: 'Wikipedia側が一時的にリクエストを制限しています。少し待って再試行してください。' } }, status, { 'retry-after': retry?.[1] || '30' });
  }
  return json({ error: { code: 'wikipedia_unavailable', message: 'Wikipediaから記事を取得できませんでした。時間をおいて再試行してください。' } }, status);
}

function securePage() {
  return new Response(PAGE_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"
    }
  });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return securePage();

    if (request.method === 'GET' && url.pathname === '/api/session') {
      const userId = identity(request);
      return json({ authenticated: Boolean(userId) });
    }

    if (!['/api/playground', '/api/tools'].includes(url.pathname)) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, 405, { allow: 'POST' });

    const origin = request.headers.get('origin');
    if (origin !== url.origin || (request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
      return json({ error: { code: 'origin_denied', message: '同じサイトから実行してください。' } }, 403);
    }
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: { code: 'content_type_required', message: 'JSON形式で送信してください。' } }, 415);
    }

    const userId = identity(request);
    let body;
    try { body = await readBoundedJson(request); }
    catch (error) { return errorResponse(error); }
    if (url.pathname === '/api/tools') {
      if (typeof body.tool !== 'string' || !body.arguments || typeof body.arguments !== 'object' || Array.isArray(body.arguments)) return errorResponse(Object.assign(new Error('arguments_invalid'), { status: 400 }));
      const response = await authenticatedToolRequest(request, url, userId, body.tool, body.arguments, env);
      if (response.status === 200) { const payload = await response.json(); return json(payload); }
      const payload = await response.json();
      const toolCode = payload.error?.code === 'sign_in_required' ? 'AUTH_REQUIRED' : payload.error?.code === 'rate_limit_exceeded' ? 'RATE_LIMIT_EXCEEDED' : payload.error?.code?.toUpperCase() || 'TOOL_ERROR';
      return json({ ok: false, error: { code: toolCode, message: payload.error?.message || 'Tool execution failed.', ...(payload.error?.sign_in_url ? { sign_in_url: payload.error.sign_in_url } : {}) } }, response.status, Object.fromEntries(response.headers));
    }
    const { task, language, count, mode, requirements, avoid } = body;
    const response = await authenticatedToolRequest(request, url, userId, 'wiki_skill', { task, language, count, mode, requirements, avoid }, env);
    if (response.status !== 200) return response;
    const payload = await response.json();
    return json(payload);
  }
};
