# Verification record — site/architecture refactor, 2026-11-07

Evidence and conditions are limited to the actual GitHub runners and local Node.js checks:

- [GitHub Actions main run](https://github.com/Unjuno/Wiki-spark-mcp/actions/runs/42250379017) from commit `8e1681f0ee7b67ae15d59687da08278c173ae5bc`.
- CI for Node.js 20, 22 and 24: successful. Node 22 log: **80 tests, 80 passed, 0 failed, 0 skipped**; syntax checks passed, `npm audit --audit-level=high` found no known vulnerable packages at test time.
- Live smoke: **10/10** real MCP SDK → child-process stdio server → real Wikimedia API calls succeeded; `wiki_search`, `wiki_read`, `wiki_random`, `wiki_discover`, `wiki_skill` in both ja and en; `mocked=false`.
- New anonymous web API tests: input schema constraints, same-origin and JSON body handling, rate/concurrency, random-source provenance, stale asynchronous results and WebMCP registration schema included in CI.
- Local browser Chromium is restricted by an administrative URL policy (`net::ERR_BLOCKED_BY_ADMINISTRATOR` on local navigation); no desktop/mobile screenshot validation of **this** new build is claimed. See [STATE_MACHINE.md](STATE_MACHINE.md) for state coverage.

**Not demonstrated:** automatic deployment to the separately managed Sites hostname, signed-off production traffic protection across replicas, host-level WebMCP discovery and invocation of the new site, real browser screenshot evaluation of the new build, or AI-generated explanations. In particular, *client-side registration success* is not the same thing as agent-host tool invocation.
