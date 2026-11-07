import { INITIAL_DISCOVERY, reduceDiscovery } from './machine.js';
import { mountKnowledgeCanvas, mountNativeHTMLCanvas } from './canvas.js';
import { registerSiteTools, SITE_TOOLS } from './webmcp.js';
import { currentExplanationHandoff } from './handoff.js';

const $ = (id) => document.getElementById(id);
let state = { ...INITIAL_DISCOVERY };
let pending = null;
const sources = { ja: '日本語', en: 'English' };
const explanations = {
  ja: '記事の概要と出典を取得しました。AIによる解説は接続先のAIに依頼してください。',
  en: 'Article and provenance retrieved. Ask your connected AI to explain this article.'
};
function dispatch(event) { state = reduceDiscovery(state, event); render(); return state; }
function safeArticleLink(value) {
  if (typeof value !== 'string') return null;
  try { const u = new URL(value); return u.protocol === 'https:' &&
    ['ja.wikipedia.org', 'en.wikipedia.org'].includes(u.hostname) ? u.href : null; }
  catch { return null; }
}
function setLink(element, value) {
  const url = safeArticleLink(value);
  if (!url) { element.hidden = true; element.removeAttribute('href'); return; }
  element.href = url; element.hidden = false;
}
function render() {
  const busy = state.status === 'loading';
  $('discover-card').setAttribute('aria-busy', String(busy));
  $('discover-button').disabled = busy;
  $('discover-button').textContent = busy ? '記事を探しています…' : (state.status === 'success' ? '次の記事を発見する ↗' : 'ランダムに発見する ↗');
  $('language-ja').setAttribute('aria-pressed', String(state.language === 'ja'));
  $('language-en').setAttribute('aria-pressed', String(state.language === 'en'));
  $('discover-status').dataset.state = state.status;
  $('discover-status').textContent = ({ idle: 'READY / DISCOVER', loading: 'SEARCHING / WIKIPEDIA',
    success: 'FOUND / WIKIPEDIA', error: 'ERROR / RETRY' })[state.status];
  $('discover-error').hidden = state.status !== 'error';
  $('discover-error').textContent = state.status === 'error' ? state.error : '';
  const a = state.data?.article;
  $('article-empty').hidden = !!a || state.status === 'loading';
  $('article-loading').hidden = !busy;
  $('article-result').hidden = !a;
  $('copy-explanation').disabled = !a;
  if (!a) return;
  $('article-title').textContent = a.title;
  $('article-extract').textContent = a.extract;
  $('article-language').textContent = `${sources[a.language] ?? a.language} / WIKIPEDIA`;
  $('article-revision').textContent = a.revision_id ? `REVISION ${a.revision_id}` : 'REVISION NOT AVAILABLE';
  $('article-description').textContent = explanations[a.language] ?? explanations.ja;
  setLink($('article-link'), a.url);
  setLink($('revision-link'), a.permalink);
  $('article-result').classList.remove('arrived');
  requestAnimationFrame(() => $('article-result').classList.add('arrived'));
}
async function postTool(name, args, signal) {
  const response = await fetch(`/api/tools/${name}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal, cache: 'no-store', credentials: 'omit' });
  const body = await response.json().catch(() => ({ ok: false, error: { code: 'INVALID_RESPONSE' } }));
  if (!response.ok || !body.ok) {
    const error = new Error(body.error?.code ?? 'API_ERROR');
    error.code = body.error?.code ?? 'API_ERROR';
    error.retryAfter = response.headers.get('retry-after');
    throw error;
  }
  return body.data;
}
function userMessage(error) {
  if (error?.name === 'AbortError') return '前のリクエストを中断しました。';
  const code = error?.code;
  if (code === 'RATE_LIMITED') return '短時間のリクエストが多すぎます。少し時間をおいて再試行してください。';
  if (code === 'BUSY') return 'ただいま混み合っています。数秒後に再試行してください。';
  if (code === 'WIKIPEDIA_UNAVAILABLE' || code === 'UPSTREAM_TIMEOUT') return 'Wikipediaに接続できませんでした。再試行してください。';
  if (code === 'ORIGIN_DENIED') return 'このサイトから操作してください。';
  if (code === 'INVALID_INPUT') return '入力内容を確認してください。';
  return '記事の取得に失敗しました。再試行してください。';
}

export async function discover(language = state.language, source = 'page', externalSignal = null) {
  if (!['ja', 'en'].includes(language)) throw new Error('Invalid language');
  pending?.abort();
  if (language !== state.language) dispatch({ type: 'SET_LANGUAGE', language });
  pending = new AbortController();
  const controller = pending;
  const cancel = () => controller.abort();
  externalSignal?.addEventListener('abort', cancel, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const current = dispatch({ type: 'START', source }).requestId;
  try {
    const data = await postTool('wiki_discover', { language }, controller.signal);
    if (data?.kind !== 'wikipedia_article_discovery' || !data.article?.title || !data.article?.extract)
      throw new Error('INVALID_RESPONSE');
    dispatch({ type: 'RESOLVE', requestId: current, data });
    return data;
  } catch (error) {
    dispatch({ type: 'REJECT', requestId: current, error: userMessage(error) });
    throw error;
  } finally {
    externalSignal?.removeEventListener('abort', cancel);
    if (state.requestId === current) pending = null;
  }
}
function requestNext() { void discover().catch(() => {}); }

async function toolCall(name, args = {}, options = {}) {
  if (name === 'wiki_discover') return discover(args.language ?? 'ja', 'webmcp', options.signal);
  const data = await postTool(name, args, options.signal);
  const output = $('tool-output');
  output.textContent = JSON.stringify(data, null, 2).slice(0, 13_000);
  $('tool-output-wrapper').hidden = false;
  return data;
}
async function copyText(text, element) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    element.textContent = 'コピーしました ✓';
    setTimeout(() => { element.textContent = element.dataset.original; }, 1500);
  } catch { element.textContent = 'コピーできませんでした'; }
}

$('discover-button').addEventListener('click', requestNext);
$('hero-discover').addEventListener('click', () => { document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }); requestNext(); });
$('language-ja').addEventListener('click', () => { if (state.language !== 'ja') void discover('ja').catch(() => {}); });
$('language-en').addEventListener('click', () => { if (state.language !== 'en') void discover('en').catch(() => {}); });
$('copy-explanation').addEventListener('click', (event) => { void copyText(currentExplanationHandoff(state), event.currentTarget); });
$('copy-config').addEventListener('click', (event) => void copyText($('config-code').textContent, event.currentTarget));
$('tool-output-copy').addEventListener('click', (event) => void copyText($('tool-output').textContent, event.currentTarget));
$('advanced-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('advanced-submit');
  if (button.disabled) return;
  button.disabled = true;
  $('advanced-status').textContent = 'Wikipediaの記事を取得しています…';
  try {
    const form = new FormData(event.currentTarget);
    const args = { task: String(form.get('task') || ''), language: String(form.get('language') || 'ja'),
      mode: String(form.get('mode') || 'surprise'), count: Number(form.get('count') || '1') };
    const data = await toolCall('wiki_skill', args);
    $('advanced-status').textContent = `取得 ${data.returned_count}/${data.requested_count} · ${data.mode}`;
  } catch (error) { $('advanced-status').textContent = userMessage(error); }
  finally { button.disabled = false; }
});
const lastTool = $('webmcp-status');
void registerSiteTools({ invoke: toolCall,
  onStatus: (status, registered) => { lastTool.textContent = status === 'registered'
    ? `WebMCP / ${registered} site tools registered` : status === 'unsupported'
      ? 'WebMCP / このブラウザではサイトツールを利用できません' : `WebMCP / registration error (${registered}/${SITE_TOOLS.length})`; }
});
void mountKnowledgeCanvas($('orbit-canvas'));
mountNativeHTMLCanvas($('native-canvas'), $('native-fallback'));
render();

// One initial request per page load; navigation and animations never trigger another.
// No fallback to fabricated article data when the remote API fails.
void discover('ja', 'initial').catch(() => {});
