# Architecture

`src/server.mjs` owns the stdio lifecycle. `src/mcp.mjs` registers four read-only tools and returns matching text and structured payloads. `src/wiki.mjs` handles search, excerpt acquisition, bounded random sampling and context assembly. `src/http.mjs` owns the fixed-origin HTTP boundary, pacing, caching, size limits and cooldowns.

There is no database, shell execution, embedded LLM or server-side model sampling. The client decides whether and how to use the returned context. The JSON snapshot includes the actual excerpt and a hash; title-based replay fetches current content and is not immutable replay.

Configuration: `WIKIMEDIA_CONTACT` is required, ASCII-only and at most 200 characters. It is sent to Wikimedia in the User-Agent, not used as an execution target. No arbitrary endpoint configuration is supported.

The official website Playground is a separate Sites Worker that imports the same `WikipediaAPI` and `buildWikiSkill` modules. Its public page is not an MCP transport. Only the authenticated, same-origin `POST /api/playground` route fetches random articles; the Site Worker enforces fixed language hosts, request limits and an isolate-local quota. See `SECURITY.md` for the limit of in-memory quotas across Worker instances.

Tests use a Node preload only in a child-process test invocation. The production entrypoint never imports the fixture. The live script does not use a preload.
