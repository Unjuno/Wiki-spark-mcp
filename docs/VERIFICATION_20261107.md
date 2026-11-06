# Verification record — site/architecture refactor, 2026-11-07

Evidence and conditions are limited to the actual GitHub runners and local Node.js checks:

- [GitHub Actions main run](https://github.com/Unjuno/Wiki-spark-mcp/actions/runs/42250379017) from commit `8e1681f0ee7b67ae15d59687da08278c173ae5bc`.
- CI for Node.js 20, 22 and 24: successful. Node 22 log: **80 tests, 80 passed, 0 failed, 0 skipped**; syntax checks passed, `npm audit --audit-level=high` found no known vulnerable packages at test time.
- Live smoke: **10/10** real MCP SDK → child-process stdio server → real Wikimedia API calls succeeded; `wiki_search`, `wiki_read`, `wiki_random`, `wiki_discover`, `wiki_skill` in both ja and en; `mocked=false`.
- New anonymous web API tests: input schema constraints, same-origin and JSON body handling, rate/concurrency, random-source provenance, stale asynchronous results and WebMCP registration schema included in CI.
- Local browser Chromium is restricted by an administrative URL policy (`net::ERR_BLOCKED_BY_ADMINISTRATOR` on local navigation); no desktop/mobile screenshot validation of **this** new build is claimed. See [STATE_MACHINE.md](STATE_MACHINE.md) for state coverage.

**Not demonstrated:** automatic deployment to the separately managed Sites hostname, signed-off production traffic protection across replicas, host-level WebMCP discovery and invocation of the new site, real browser screenshot evaluation of the new build, or AI-generated explanations. In particular, *client-side registration success* is not the same thing as agent-host tool invocation.

## Later final updates

- Follow-up merge and timeout correction: [main Actions run](https://github.com/Unjuno/Wiki-spark-mcp/actions/runs/42251573549), commit `0790036d1e8d1d8090b98a6836a75932a5b2720c`. Node 22 **81/81 tests passed**, Node 20/22/24 jobs succeeded. Live stdio calls **10/10 passed** with `mocked=false`. This supersedes the earlier 80-test count for current main.
- The subsequent deployment verification includes a **distinct anonymous HTTP site → real Wikimedia** smoke check so site connectivity is not inferred solely from MCP stdio success. It only verifies GitHub-hosted runner behavior, **not** the separately managed `chatgpt.site` production URL.
