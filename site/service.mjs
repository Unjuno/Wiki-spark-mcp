import { createWikiOperations } from '../src/operations.mjs';

export const TOOL_NAMES = Object.freeze(['wiki_discover', 'wiki_random', 'wiki_read', 'wiki_search', 'wiki_skill']);
const LANGUAGES = ['ja', 'en'];
const MODES = ['surprise', 'analogy', 'constraint', 'critique'];

export class ApiInputError extends Error {
  constructor(message) { super(message); this.code = 'INVALID_INPUT'; this.status = 400; }
}

function object(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new ApiInputError('Expected an object.');
  return value;
}
function text(value, field, max, required = true) {
  if (!required && value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ApiInputError(`Invalid ${field}.`);
  return value.trim();
}
function language(v) {
  if (v === undefined) return 'ja';
  if (!LANGUAGES.includes(v)) throw new ApiInputError('Language must be ja or en.');
  return v;
}
function integer(v, field, def, max) {
  if (v === undefined) return def;
  if (!Number.isInteger(v) || v < 1 || v > max) throw new ApiInputError(`${field} must be 1..${max}.`);
  return v;
}
function list(v, field, max, min = 0) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length < min || v.length > max ||
    v.some((item) => typeof item !== 'string' || item.length > 200 || !item.trim() || /[|\r\n]/.test(item)))
    throw new ApiInputError(`Invalid ${field}.`);
  return v.map((s) => s.trim());
}

/** Reject unknown fields so typos cannot silently change behavior. */
export function validateToolInput(name, raw) {
  if (!TOOL_NAMES.includes(name)) throw new ApiInputError('Unknown WikiSpark tool.');
  const input = object(raw);
  const allowed = {
    wiki_discover: ['language'],
    wiki_random: ['language', 'count'],
    wiki_read: ['language', 'title'],
    wiki_search: ['language', 'query', 'limit'],
    wiki_skill: ['language', 'task', 'count', 'mode', 'titles', 'requirements', 'avoid']
  }[name];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new ApiInputError('Unexpected input field.');
  const result = { language: language(input.language) };
  if (name === 'wiki_random') result.count = integer(input.count, 'count', 3, 4);
  if (name === 'wiki_read') result.title = text(input.title, 'title', 200);
  if (name === 'wiki_search') {
    result.query = text(input.query, 'query', 200);
    result.limit = integer(input.limit, 'limit', 5, 10);
  }
  if (name === 'wiki_skill') {
    result.task = text(input.task, 'task', 1200);
    result.count = integer(input.count, 'count', 3, 4);
    result.mode = input.mode === undefined ? 'surprise' : input.mode;
    if (!MODES.includes(result.mode)) throw new ApiInputError('Invalid mode.');
    result.requirements = list(input.requirements, 'requirements', 8) ?? [];
    result.avoid = list(input.avoid, 'avoid', 8) ?? [];
    if (input.titles !== undefined) result.titles = list(input.titles, 'titles', 4, 1);
  }
  return result;
}

export function createSiteService(wikipedia) {
  const operations = createWikiOperations(wikipedia);
  return async function invoke(name, raw = {}, context = {}) {
    const args = validateToolInput(name, raw);
    return operations[name](args, context);
  };
}
