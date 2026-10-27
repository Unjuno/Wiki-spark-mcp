import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { WikipediaAPI } from './wiki.mjs';
import { makeServer } from './mcp.mjs';

// stdout belongs exclusively to the JSON-RPC transport.
try {
  const wikipedia = new WikipediaAPI({ contact: process.env.WIKIMEDIA_CONTACT });
  const handle = serveStdio(() => makeServer(wikipedia));
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void handle.close().catch((error) => {
      console.error('WikiSpark shutdown failed:', error.message);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error('Failed to start WikiSpark MCP:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
