# WikiSpark public web architecture — 2026-11-07

## Context

The local official website (Sites at `https://wikispark-official.unjuno.chatgpt.site`) and the GitHub repository are **separate deployment targets**. Updating GitHub does not update the Sites app. This directory provides a deployable standalone reference implementation, **not** proof that the existing Sites URL was updated.

## Architecture

```text
                       user / supported AI host
                          |             |
                     accessible DOM   WebMCP 5 tools
                          |             |
                          +-- site/public/main.js --+
                                        |            |
                       explicit discovery reducer    |
                                        |            |
                                        +------ POST JSON /api/tools/{name}
                                                          |
                        site/server.mjs (Node.js 20.11+, one replica)
                         | origin check | validation | anonymous rate limits
                                                          |
                      site/service.mjs → src/operations.mjs (shared)
                                                          |
                        src/wiki.mjs → src/http.mjs → ja/en Wikipedia HTTPS
                                                          |
                     structured article + attribution + AI handoff
```

### Invariants

- Five WebMCP tools, five HTTP commands and five stdio tools share the same `src/operations.mjs` logic; different transports cannot silently diverge.
- The default public API is **anonymous**. No `AUTH_REQUIRED` for public read-only tools.
- `wiki_discover` retrieves a random article and returns `explanation_status=requires_client_ai` rather than pretending a model call happened.
- The client renders article titles/extracts as `textContent`, with outgoing links restricted to HTTPS Wikipedia domains.
- The SSR-free index remains readable and keyboard-navigable without Canvas. The main discovery requires JavaScript; `<noscript>` explains this.
- Static assets served from an allowlist; arbitrary disk paths cannot be requested.

## Local and hosted deployment

```sh
npm ci --ignore-scripts
WIKIMEDIA_CONTACT='https://github.com/Unjuno/Wiki-spark-mcp/issues' npm run site:start
```

Defaults to `127.0.0.1:3100`. A hosted Node.js deployment can set `HOST=0.0.0.0`, `PORT` and a genuine `WIKIMEDIA_CONTACT`. Terminate TLS at the hosting gateway, use a single instance by default, and configure gateway request/CPU limits and logs. `TRUST_PROXY=1` **must only** be used when direct network access is restricted to a trusted reverse proxy that **overwrites** `X-Forwarded-For`. The in-process limiter has **no global cross-instance guarantee**. Do not scale replicas until a shared atomic rate limiter is implemented.

The site implementation does not change or install the canonical remote Sites deployment on its own. For the `chatgpt.site` domain, the Sites project's code must be updated by a tool authorized to edit that Sites project; the repo here is deploy-ready but not a verified Sites deployment. Do not copy private authentication secrets to a public branch.

## Security review checklist

- CORS: no Access-Control-Allow-Origin header; reject cross-origin `Origin` and cross-site fetch metadata on write-like tool transport (POST), even though the actual tools read data.
- Request body: JSON only, <= 12 KiB; unknown properties rejected; no arbitrary URI inputs.
- Wikimedia destinations: implementation in `WikiHttp` fixes `ja.wikipedia.org` and `en.wikipedia.org`, rejects redirects and bounds response sizes and retries.
- Content: Wikipedia HTML escapes/clean-up in the core; browser uses `textContent`, never injects extracted content into `innerHTML`.
- AI: untrusted `article` is separate from the fixed explanation prompt. This is defense-in-depth, not prompt-injection immunity.
- Credentials: no auth or model API keys used for these public read-only operations. Admin/configuration functions, if added, must use separate protected routes.
- CSP: strict same-origin script/style/connect policy and `frame-ancestors 'none'`.
- Performance: no heavyweight framework or animation bundle; Canvas 2D is bounded by DPR <=2 and approx <=30 FPS, pauses off-screen/hidden and respects reduced motion.
- Attribution: display source canonical URL + fixed revision link when available; note licenses of Wikipedia content differ from code MIT license.

## Remaining production hardening

External platform-specific tests and a distributed rate limit are still required before claiming high-volume traffic readiness. No anonymous service can guarantee total prevention of automated abuse. In a serverless per-request runtime, the process-local limiter is ineffective as a global quota: use an atomic shared store or platform gateway if not deploying a single persistent process.

## Design decisions

The LP uses editorial visual hierarchy with warm paper background, rust-orange accent, a single orbit/knowledge visual, and a dark high-contrast discovery area. Canvas-in-HTML is a decorative 2D rendering. Native HTML-in-Canvas activates **only** when supported and is restricted to a decorative mark, with an HTML fallback. This avoids blocking screen readers, copy/paste, link navigation or reduced-motion use on experimental APIs.
