# Architecture

`src/server.mjs` owns the stdio lifecycle. `src/mcp.mjs` registers four read-only tools and returns matching text and structured payloads. `src/wiki.mjs` handles search, excerpt acquisition, bounded random sampling and context assembly. `src/http.mjs` owns the fixed-origin HTTP boundary, pacing, caching, size limits and cooldowns.

There is no database, shell execution, embedded LLM or server-side model sampling. The client decides whether and how to use the returned context. The JSON snapshot includes the actual excerpt and a hash; title-based replay fetches current content and is not immutable replay.

Configuration: `WIKIMEDIA_CONTACT` is required, ASCII-only and at most 200 characters. It is sent to Wikimedia in the User-Agent, not used as an execution target. No arbitrary endpoint configuration is supported.

Tests use a Node preload only in a child-process test invocation. The production entrypoint never imports the fixture. The live script does not use a preload.
