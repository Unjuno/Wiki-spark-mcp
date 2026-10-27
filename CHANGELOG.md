# Changelog

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
