import { buildArticleDiscovery } from './discovery.mjs';
import { buildWikiSkill, selectSkillMode } from './wiki.mjs';

/** One behavior layer shared by stdio MCP, the public HTTP API and site tools. */
export function createWikiOperations(wikipedia) {
  return Object.freeze({
    wiki_search: ({ query, language = 'ja', limit = 5 }, { signal } = {}) =>
      wikipedia.search(query, { language, limit, signal }),
    wiki_read: ({ title, language = 'ja' }, { signal } = {}) =>
      wikipedia.read(title, { language, signal }),
    wiki_random: async ({ language = 'ja', count = 3 }, { signal } = {}) => {
      const articles = await wikipedia.randomArticles({ language, count, signal });
      return { language, requested_count: count, returned_count: articles.length,
        complete: articles.length === count, articles };
    },
    wiki_discover: async ({ language = 'ja' }, { signal } = {}) => {
      const articles = await wikipedia.randomArticles({ language, count: 1, signal });
      return buildArticleDiscovery(articles[0], { language });
    },
    wiki_skill: async ({ task, language = 'ja', count = 3, mode = 'surprise',
      titles, requirements = [], avoid = [] }, { signal } = {}) => {
      const chosen = mode === 'surprise' ? selectSkillMode() : mode;
      const articles = titles?.length
        ? await wikipedia.readMany(titles, { language, signal })
        : await wikipedia.randomArticles({ language, count, signal });
      const usable = articles.filter((article) => article.extract.length >= 60);
      return { ...buildWikiSkill({ task, articles: usable, mode: chosen, language, requirements, avoid }),
        requested_count: titles?.length ?? count, returned_count: usable.length,
        complete: usable.length === (titles?.length ?? count) };
    }
  });
}
