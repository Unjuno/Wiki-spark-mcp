# WikiSpark architecture

The core `src/operations.mjs` defines exactly five read-only operations shared by two transports: `src/mcp.mjs` exposes them through the official MCP SDK over child-process stdio, while `site/service.mjs` exposes them through the public Node website's same-origin JSON API. `src/wiki.mjs` owns Wikipedia query/rand/extract assembly; `src/discovery.mjs` builds an explainable article handoff; `src/http.mjs` implements fixed destinations, bounded upstream GET calls, pacing, caching, retries and cooldowns.

The site is an optional standalone transport and landing page, not a replacement for the local stdio server or a remote HTTP MCP protocol server. It has no database or embedded LLM. Read-only users need no account. See [SITE_ARCHITECTURE.md](SITE_ARCHITECTURE.md) for deployment and security, and [STATE_MACHINE.md](STATE_MACHINE.md) for state transitions, races and fault recovery.

The existing public Sites project is managed separately from this GitHub repository. Updating GitHub does not deploy to `chatgpt.site` automatically. A successful CI job proves functionality in the runner, not production browser or WebMCP host compatibility.

Test fixtures are only loaded in test subprocesses; normal stdio and site startup do not import them. For live Wikipedia, set the genuine `WIKIMEDIA_CONTACT` in the server environment.
