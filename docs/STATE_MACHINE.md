# WikiSpark — explicit state machines and invariants

The previous landing page blurred connection status, authentication, WebMCP registration and article retrieval. The redesigned site models these **as separate state machines**. No single boolean such as `isLoading` describes all of them.

## 1. Discovery request lifecycle (user-facing source of truth)

State: `status ∈ {idle, loading, success, error}`, `language ∈ {ja,en}`, monotonically increasing `requestId`, optional `data`, optional `error`, and `source ∈ {initial,page,webmcp}`.

| Current state | Event | Guard | Next state | Side effect elsewhere |
|---|---|---|---|---|
| any | `SET_LANGUAGE(ja/en)` | language valid | idle; increment request ID; clear data | Abort previous HTTP and start new discovery |
| any | `START(source)` | permitted action | loading; increment request ID; clear error/data | Abort previous HTTP; POST JSON to `/api/tools/wiki_discover` |
| loading | `RESOLVE(id,data)` | id is current | success | Render title, extract, attribution, revision, safe links; allow copy |
| loading | `REJECT(id,error)` | id is current | error | Show actionable retry message; never replace with samples |
| any | stale `RESOLVE` / `REJECT` | id differs | unchanged | None; discard stale response |
| any | `CANCEL` | always | idle; increment request ID | Abort previous HTTP and clear transient output |

Invariants: **(I1)** at most one current discovery operation per page, **(I2)** stale network results cannot overwrite newer language or article, **(I3)** loading and error never appear as successful live results, **(I4)** all successful articles come through the same validated server operation, **(I5)** a WebMCP `wiki_discover` call updates the same article view, **(I6)** the copyable AI handoff exists only when the current visible discovery is successful and its article language matches the selected language.

An API request may be aborted after the server starts work; the server's bounded queue and rate limiter still apply. Aborted upstream work does not prove that zero Wikimedia requests occurred.

## 2. Network and rate-limit lifecycle

A request passes `method + path → Origin/Fetch-Site check → JSON size/type → schema validation → anonymous rate budget → concurrency permit → WikipediaAPI → response`. On the first failed guard, it returns structured error and stops. Successful acquisition has an idempotent release in `finally` for both success and failure.

Possible public API response states:

- 200 `ok: true`: actual source data; not automatically an AI interpretation.
- 400 `INVALID_INPUT`: malformed/unknown fields, lengths, language or ranges.
- 403 `ORIGIN_DENIED`: origin or browser fetch metadata violates same-origin policy.
- 429 `RATE_LIMITED`: per-address or single-process global request window exceeded; `Retry-After` present.
- 503 `BUSY`: concurrent request limit reached; `Retry-After` present.
- 502 `WIKIPEDIA_UNAVAILABLE`: upstream failure; do not silently substitute mock data.
- 504 `UPSTREAM_TIMEOUT`: request-level cancellation/timeout.
- 500 `INTERNAL_ERROR`: safe generic error; no server stack traces or tokens.

The `SlidingWindowLimiter` is memory-bounded and **per Node.js process**. This is intentional for a standalone single-replica deployment, not a claim of cross-replica rate limiting. A distributed deployment requires a shared atomic limiter (such as a transactional Redis operation or equivalent managed gateway) before scaling beyond one process. Per-IP limits cannot fully stop malicious IP rotation.

## 3. WebMCP lifecycle (orthogonal to request status)

`checking → unsupported` when the browser does not expose `document.modelContext.registerTool`, or `checking → registered(5)` after five registrations resolve, or `checking → error(n)` after any registration exception. Registration success does **not** prove a specific AI host discovered or invoked the tool. Native browser support varies. All five tools route through the same site service, and `wiki_discover` updates the same reducer as the direct user action. Optional WebMCP cancellation signals are forwarded to fetch; errors are returned as structured, sanitized error objects because thrown callback messages are not reliably visible to agents. The WebMCP adapter declares `untrustedContentHint: true` for third-party Wikipedia content. An omitted `language` in `wiki_discover` always defaults to `ja`, matching the server tool contract, rather than inheriting a mutable UI selection.

## 4. Rendering lifecycle (orthogonal to requests)

`static → enhanced` when Canvas 2D is available; animated only while the canvas is visible, the page is foreground and reduced motion is disabled. Native HTML-in-Canvas is **decoration-only** and activates only when `drawElementImage` is present; unsupported browsers retain normal HTML fallback. All article text and controls are ordinary DOM elements, not trapped in Canvas. API/network activity is never driven by an animation frame.

## 5. AI explanation lifecycle (separate from article retrieval)

The server does not call an LLM. `wiki_discover` returns `explanation_status='requires_client_ai'` and `explanation_prompt`, with article text in separately marked untrusted data. The UI labels this **AIへの解説指示**, never AI-generated explanation. The receiving AI may choose to explain using its own model and cite the article; the WikiSpark server itself does not validate such output.

## 6. Test cases and traceability

- `site/test/site.test.mjs`: 13 focused tests for anonymous API, CSP, same-origin, schema, bounded requests, front-end race reducer, WebMCP metadata and provenance.
- `test/mcp.test.mjs`: real SDK child-process stdio regression suite, before/after shared operations refactor.
- `scripts/live-smoke.mjs`: real Wikimedia API requests (requires CI/network and `WIKIMEDIA_CONTACT`).
- A supported ChatGPT Work/Codex **site tools host** must be used to claim WebMCP discovery. An ordinary browser with a mocked `document.modelContext` can verify registration wiring but **not** host support.
