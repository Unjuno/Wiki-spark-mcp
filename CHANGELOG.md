# Changelog

## 0.4.0 — 2026-10-30

- Fix intermittent live-test failures when initial random articles have short excerpts; bounded retries now allow up to max(6, 4×count) starts.

- Add no-argument wiki_discover for one random Wikipedia article with provenance and a fixed client-AI explanation handoff.
- Keep external article text out of instructions and mark the explanation as not yet generated.
- Preserve existing four tools and add unit, stdio, and live regression checks.
- Document requirements for updating the separately hosted public website.


## 0.3.0 — 2026-10-28

- Correct the SDK v2 stdio lifecycle: `serveStdio` returns a handle, not a Promise.
- Add actual SDK/child-process/stdio integration tests for legacy and 2026-07-28 protocol modes.
- Return `structuredContent` with matching text content and read-only annotations.
- Pin SDK 2.4.0 and commit a generated dependency lockfile.
- Add sequential, bounded HTTP requests, limited caching, Retry-After cooldowns and response validation.
- Deduplicate canonical page IDs; preserve explicit partial results.
- Separate article text from the generated instruction string; attach source identifiers and reuse notices.
- Add live tests for all four tools in Japanese and English; document trust boundaries and setup.

## 0.2.0 — earlier prototype

Added explicit requirements/avoid lists, revision metadata, snapshot hashes and independent random starts. Its offline tests did not validate actual MCP startup; that gap is addressed in 0.3.0.
