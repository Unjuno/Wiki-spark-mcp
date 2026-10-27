# Verification record — WikiSpark MCP 0.3.0

## Verified implementation

- Commit: `08f2a770878999840288e6036408be63fb6831a1`.
- [Successful full run](https://github.com/Unjuno/Wiki-spark-mcp/actions/runs/40586241344), completed 2026-10-27 21:23 UTC (2026-10-28 06:23 JST).
- Node.js 20, 22 and 24 jobs each passed dependency installation, syntax checking, the full test suite and the high-severity dependency-audit gate.
- Inspected Node.js 22 log: **60 tests, 60 passed, 0 failed, 0 skipped**. Environment: Node.js 22.23.3, npm 10.9.9, Ubuntu 26.04.1, Linux x64. SDK server/client/core 2.4.0; Zod locked to 4.6.7. This is functional verification, not a throughput benchmark.
- Live job: **8/8 calls passed**, real SDK client → real child-process stdio server → real Wikimedia API. Four tools in each of Japanese and English, with no HTTP fixtures.
- Live job environment: Node.js 22.23.3, Linux x64. Started `2026-10-27T21:22:56.821Z`, finished `2026-10-27T21:22:59.832Z`. This one run is not a latency guarantee.
- `npm audit` reported zero known vulnerabilities at verification time. This is not a security certification or a guarantee about future advisories.

## What the live run actually did

| Language | Search | Read | Random | Skill |
|---|---|---|---|---|
| ja | PASS: 地球 | PASS: revision 111493425 | PASS: one article returned | PASS: one source, analogy mode |
| en | PASS: Earth | PASS: revision 1382152926 | PASS: one article returned | PASS: one source, analogy mode |

The sampled skill sources happened to be `FF USVイェーナ` and `Bean Hill Historic District`. These were actual random selections, not curated demonstration data. Returning them successfully does not establish that they are useful for navigation design.

All four modes, default count three, partial results, error recovery, input bounds, matching text/structured outputs and tool discovery are covered by actual SDK/stdio integration tests. Only upstream Wikipedia HTTP is substituted in those repeatable integration tests.

## Failure reproduced before repair

[Red run](https://github.com/Unjuno/Wiki-spark-mcp/actions/runs/40585641563): 36 passed, two stdio connection tests failed. The old entrypoint called `.catch()` on `serveStdio()` even though SDK v2 returns a handle, not a Promise. The corrected entrypoint was checked using the same connection tests, not by deleting or skipping them.

An earlier [connectivity probe](https://github.com/Unjuno/Wiki-spark-mcp/actions/runs/40584596264) independently verified the real SDK handle shape and HTTP 200 responses from Japanese and English Wikipedia.

## Boundaries and review

The local authoring container could not resolve external hosts, so real dependencies, transport and upstream API were verified on GitHub-hosted runners. The local dependency-free unit suite also passed all 35 checks under Node.js 22.16.0.

Source and tests were self-reviewed; no independent human security audit or external code review is claimed. The supplied tests originally assigned identical page IDs to different equal-length titles; those fixtures were corrected to exercise canonical-ID deduplication accurately.

Not verified: a particular desktop client's configuration on the user's computer, Windows/macOS runtime behavior, a public HTTP deployment, prompt-injection immunity, Wikipedia accuracy, statistical uniformity of random sampling, or improved design/research outcomes. See `SECURITY.md` and `EVALUATION.md`.

The implementation is a local stdio MVP, not a hosted product. Documentation-only commits after the implementation commit should be checked against the current GitHub Actions result before deployment.
