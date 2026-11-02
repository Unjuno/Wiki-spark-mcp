# Architecture

`src/server.mjs` owns the stdio lifecycle. `src/mcp.mjs` registers four read-only tools and returns matching text and structured payloads. `src/wiki.mjs` handles search, excerpt acquisition, bounded random sampling and context assembly. `src/http.mjs` owns the fixed-origin HTTP boundary, pacing, caching, size limits and cooldowns.

There is no database, shell execution, embedded LLM or server-side model sampling. The client decides whether and how to use the returned context. The JSON snapshot includes the actual excerpt and a hash; title-based replay fetches current content and is not immutable replay.

Configuration: `WIKIMEDIA_CONTACT` is required, ASCII-only and at most 200 characters. It is sent to Wikimedia in the User-Agent, not used as an execution target. No arbitrary endpoint configuration is supported.

The official website Playground is a separate Sites Worker that imports the same `WikipediaAPI` and `buildWikiSkill` modules. Its public page is not an MCP transport. Authenticated, same-origin `POST /api/playground` and `POST /api/tools` share the same bounded execution path, fixed language hosts, request limits and isolate-local quota. The top-level page registers WebMCP tools with `document.modelContext.registerTool()` when supported. Those tools call `/api/tools` and mirror the result into the visible Playground. See `SECURITY.md` for the limit of in-memory quotas across Worker instances.

Tests use a Node preload only in a child-process test invocation. The production entrypoint never imports the fixture. The live script does not use a preload.
