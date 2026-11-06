# WikiSpark Site — discovery-first LP and public API

`site/` is a standalone, server-render-free Node.js site built on the core WikiSpark v0.4.0 logic. It uses no frontend packages and no LLM.

## Start

```bash
npm ci --ignore-scripts
export WIKIMEDIA_CONTACT="https://github.com/Unjuno/Wiki-spark-mcp/issues"
npm run site:start
```

Open http://127.0.0.1:3100. This serves the responsive LP and five anonymous API operations on the **same origin**. Each page load requests one real random Japanese Wikipedia article; the button draws again. It is **not** a mock and it never returns fallback articles on failure.

## Public API

`POST /api/tools/wiki_discover` with `{}` or `{"language":"en"}` returns `{ok:true,data:{kind:"wikipedia_article_discovery", article:{...}, explanation_status:"requires_client_ai",...}}`. Four more endpoints: `wiki_random`, `wiki_search`, `wiki_read`, `wiki_skill`. Use JSON and same-origin requests. `GET /api/health` returns metadata about mode and tool availability.

The server accepts anonymous users. No login, account, database or LLM key is required. Anonymous rate limits: default 12 requests per originating address per 60 seconds, 90 per process per 60 seconds, three concurrent total and one concurrent per address. The limits and abuse-resistance properties are **per process**, not globally distributed. This deployment **must use a single replica** unless an additional shared atomic limiter is installed. See `docs/SITE_ARCHITECTURE.md`.

## UI

The app uses an explicit reducer in `public/machine.js`; old responses cannot overwrite a newly selected language. Canvas is decorative, `prefers-reduced-motion` safe, and optional native HTML-in-Canvas feature detection never gates controls. No guessed links or article excerpts are rendered. The WebMCP adapter progressively registers five site tools in supported browsers. An unsupported browser has a working manual interface.

## Verify

```sh
npm run site:check
npm test
npm run test:live  # real Wikipedia, only with a real WIKIMEDIA_CONTACT
```

Browser E2E on the target host should test desktop/mobile layout, actual article selection, next article, English/Japanese, no account, and compatible WebMCP host invocation. This repository and the separately managed `chatgpt.site` project are **not auto-synced**.
