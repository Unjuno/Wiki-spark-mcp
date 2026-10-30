# WikiSpark public-site integration — article discovery

## Goal and scope

The public site at https://wikispark-official.unjuno.chatgpt.site currently prioritizes task-oriented wiki_skill. The requested primary experience is **visit → discover one genuinely random Wikipedia article → read source and excerpt → receive an AI explanation → request the next article**. Wikipedia is the only permitted source.

The public Sites project is managed separately from this GitHub repository. These GitHub changes do not automatically update that site's production deployment.

## API/output contract

Reuse WikipediaAPI.randomArticles({ language, count: 1 }) plus buildArticleDiscovery(article, { language }), exposed by the local MCP as wiki_discover (default ja).

Return: kind=wikipedia_article_discovery; article title, extract, URL, revision ID, permalink, retrieval timestamp, attribution, license; explanation_status=requires_client_ai; explanation_prompt; source_trust=untrusted_reference; snapshot_sha256.

The excerpt is **Wikipedia's text, not AI-generated**. To generate an explanation on the website, integrate a separately authorized server-side model with explicit cost controls, abuse protection and tool-data isolation. Otherwise show the excerpt and a “Copy AI explanation prompt” button, clearly indicating that AI explanation is not available.

## UX acceptance

1. Primary CTA is **ランダムな記事を発見**, not a task-entry form.
2. Authenticated visit triggers one random article lookup once (guard against duplicate requests on rerender). Anonymous visits show sign-in and optionally clearly marked samples.
3. Show title, excerpt, article URL, permalink/revision, date, attribution and license.
4. Only label text as an **AI explanation** after a real model call succeeds. Explain the difference between sourced facts and interpretations.
5. **次の記事へ** triggers another fresh request, with loading and error states, bounded rates, and no promise that each draw is unique.
6. Keep wiki_skill in an optional advanced “アイデアに転用” section.
7. If WebMCP is available, register wiki_discover as a fifth site tool. Do not claim actual host discoverability unless an eligible Work/Codex environment lists and calls it. The previously reported Work browser lacked webmcp_list_tools.

## Security/verification

Authenticate, validate and rate-limit at the server. Existing per-worker memory limits do not enforce a global quota. Escape content and never execute Wikipedia article instructions. Only allow ja.wikipedia.org and en.wikipedia.org API access, no HTTP redirects. Keep keys server-side and avoid unlimited model calls.

Independent PASS gates:
- Local MCP SDK/stdio calls wiki_discover with real Wikipedia data.
- Authenticated production site displays genuinely live data; Next refreshes it.
- AI explanation comes from a real model, or the interface accurately says no AI is connected.
- Compatible WebMCP host enumerates and calls wiki_discover; DOM form clicks do not count.
- Anonymous API access is blocked and security/error handling tests pass.

Document each outcome with reproducible logs and do not conflate local CI with production Sites verification.
