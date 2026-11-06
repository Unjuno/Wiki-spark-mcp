# WikiSpark website integration — updated 2026-11-07

This document is a handoff for a **separate** ChatGPT Sites deployment:
https://wikispark-official.unjuno.chatgpt.site

**The public Sites URL is not automatically deployed by GitHub commits.** The implementation in `site/` is ready for review and hosting as a standalone Node.js app; Sites must be updated by its own authorized editor.

## Current primary experience

1. An anonymous visit automatically requests exactly **one random Wikipedia article** using the server-side `wiki_discover` operation. JavaScript is required for fetching, but the page's headings and installation docs remain readable without it.
2. The user sees the actual article title, excerpt, canonical Wikipedia URL, optional revision permalink and source attribution; no fabricated fallback article is shown on errors.
3. The user can draw another article or change language (`ja` / `en`), with stale responses ignored. Randomness does not guarantee different articles on each draw.
4. An optional **Copy AI explanation prompt** action sends actual source data to the user's connected AI. The website does not host an LLM or falsely claim an explanation was produced.
5. An optional Advanced area preserves `wiki_skill` thinking context.

## Implementation contract

Use the source in `site/`, especially `site/public/main.js`, `site/public/machine.js`, and `site/public/webmcp.js`, plus the shared `src/operations.mjs`. Do not rebuild an incompatible second implementation if the hosted Sites project can import the same modules.

Anonymous API tools: `wiki_discover`, `wiki_random`, `wiki_read`, `wiki_search`, `wiki_skill`. The API has strict schemas, same-origin checks and per-process rate limits. **No login required for read-only public operations**. Never remove authentication from future unrelated administration or billing actions.

WebMCP must be verified in three distinct phases: JS tool registration; host discovery; actual execution. The five Site tool registrations in code do not establish host availability by themselves. Work/Codex capability depends on the host configuration.

For production security, use a single persistent Node process plus gateway traffic limits, or add an atomic shared limiter before scaling to multiple workers. Wikimedia requires an identifying User-Agent. See [SITE_ARCHITECTURE.md](SITE_ARCHITECTURE.md), [STATE_MACHINE.md](STATE_MACHINE.md), and [SECURITY.md](../SECURITY.md).

## Evidence required for production completion

- Anonymous request from the **deployed** public URL returns a real Wikipedia article and provenance.
- Next and English language selection work from browser UI without account creation.
- Error and rate-limited states are visible; no dummy data is substituted.
- Site tool invocation is proven in a supported WebMCP host, not by form clicking alone.
- Source code and deployment SHA/ID are recorded. Desktop/mobile screenshots and keyboard/motion tests are captured on the **deployed** build.
- No model-generated explanation is claimed unless a separate real LLM integration is installed and independently verified.
