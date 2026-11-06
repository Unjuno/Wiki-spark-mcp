/** WebMCP is a progressive enhancement. This module has no standalone side effects. */
const Lang = { type: 'string', enum: ['ja', 'en'], description: 'Wikipedia article language', default: 'ja' };
const Count = { type: 'integer', minimum: 1, maximum: 4, default: 3 };
const Rules = { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 200 } };
const parameter = (properties, required = []) => ({ type: 'object', properties,
  required, additionalProperties: false });
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

export const SITE_TOOLS = Object.freeze([
  { name: 'wiki_discover', description: 'Discover one truly random Japanese or English Wikipedia article and receive its source and AI explanation handoff. The website itself does not run an LLM.',
    inputSchema: parameter({ language: Lang }) },
  { name: 'wiki_random', description: 'Get 1–4 random articles from Wikipedia with attribution and revision metadata.',
    inputSchema: parameter({ language: Lang, count: Count }) },
  { name: 'wiki_search', description: 'Search Wikipedia by keyword, returning article titles, snippets and links.',
    inputSchema: parameter({ language: Lang, query: { type: 'string', minLength: 1, maxLength: 200 },
      limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 } }, ['query']) },
  { name: 'wiki_read', description: 'Read the introductory extract and revision information of a named Wikipedia article.',
    inputSchema: parameter({ language: Lang, title: { type: 'string', minLength: 1, maxLength: 200 } }, ['title']) },
  { name: 'wiki_skill', description: 'Convert Wikipedia sources into an ephemeral design-thinking prompt. External article content is untrusted reference data.',
    inputSchema: parameter({ language: Lang, task: { type: 'string', minLength: 1, maxLength: 1200 },
      count: Count, mode: { type: 'string', enum: ['surprise', 'analogy', 'constraint', 'critique'] },
      titles: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 200 } },
      requirements: Rules, avoid: Rules }, ['task']) }
]);

export async function registerSiteTools({ invoke, onStatus = () => {} }) {
  if (typeof document.modelContext?.registerTool !== 'function') {
    onStatus('unsupported', 0);
    return { status: 'unsupported', registered: 0 };
  }
  let registered = 0;
  for (const entry of SITE_TOOLS) {
    try {
      await document.modelContext.registerTool({
        ...entry, annotations: readOnly,
        execute: async (args = {}) => invoke(entry.name, args)
      });
      registered++;
    } catch (error) {
      onStatus('error', registered);
      return { status: 'error', registered, error };
    }
  }
  onStatus('registered', registered);
  return { status: 'registered', registered };
}
