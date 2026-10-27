# WikiSpark MCP

Wikipediaの記事を検索・取得し、異分野の知識を一時的な思考スキルとしてAIに渡すMCPサーバー。

## MVP scope

- Japanese and English Wikipedia; all-topic random sampling in article namespace 0.
- Four tools: `wiki_search`, `wiki_read`, `wiki_random`, `wiki_skill`.
- Local stdio transport; official MCP TypeScript SDK v2; JavaScript ES modules.
- No embedded LLM, arbitrary-URL fetching, or automatic execution of article instructions.

The initial implementation and its verification are being prepared. This bootstrap commit does not claim a working release.
