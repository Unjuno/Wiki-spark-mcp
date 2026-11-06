# WikiSpark security model — stdio MCP + public read-only site

WikiSpark has two transports with a single Wikipedia operations layer:

1. **Local stdio MCP** in `src/server.mjs`, with five read-only tools and no HTTP listener.
2. **Anonymous public website / API reference implementation** in `site/`. It serves UI files and five read-only JSON operations. The user does **not** need to create an account or sign in.

The site cannot execute arbitrary commands, edit user files or retrieve arbitrary URLs. Outbound Wikipedia calls target only `ja.wikipedia.org` / `en.wikipedia.org`, use GET and reject redirects. No model API keys or LLM are included.

## Trust boundary

Wikipedia article text is **untrusted reference material**. It is returned separately from fixed explanation instructions with `source_trust: untrusted_reference`. The website renders it as `textContent`, not HTML. This is not a guarantee against prompt-injection attacks on downstream AI systems. Never supply user secrets in tool arguments.

## Anonymous service safeguards

The Node HTTP implementation validates JSON payload size/content type, input properties and argument bounds; rejects cross-site Origin/Fetch-Site requests; sends a restrictive CSP, frame restrictions and safe response headers; serializes or limits upstream concurrency; and returns bounded errors without stack traces.

`SlidingWindowLimiter` enforces per-address and global request budgets, plus concurrency permits, **within one Node process only**. It does not prove robust multi-worker, IP-rotation-resistant, globally distributed abuse prevention. **Run one replica** and configure hosting-gateway traffic limits, or replace/augment with a shared atomic limiter before scaling. `TRUST_PROXY=1` is permitted only behind a trusted gateway that overwrites `X-Forwarded-For`, with no direct path to the app.

A public endpoint can still be abused or cause traffic charges. A user account would not automatically solve this. Monitor upstream traffic and rate-limit errors. No API has a promise of unlimited anonymous requests.

## Wikimedia and licensing

The operator must configure a genuine `WIKIMEDIA_CONTACT`, transmitted in the User-Agent. Wikimedia's Retry-After, rate limits and maxlag cooldown apply. Articles are not licensed under WikiSpark's MIT license; preserve canonical URLs and contributor/license information and review the relevant article license for redistributed excerpts.

Hashes and revision IDs help trace output but are not evidence of factual correctness or an atomic article/revision snapshot. Source text and revision metadata may come from different points in time.

Report reproducible defects through GitHub issues without secrets or private user text. For sensitive disclosures, use an agreed private channel.
