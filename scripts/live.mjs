import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'hltb-live-check', version: '1' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))], stderr: 'inherit' }));
  const search = await client.callTool({ name: 'hltb_search_games', arguments: { query: 'Portal', limit: 3 } });
  console.log(JSON.stringify(search.structuredContent, null, 2));
  if (search.isError) process.exitCode = 1;
  const id = search.structuredContent?.games?.find(g => g.name === 'Portal')?.id ?? '7230';
  const detail = await client.callTool({ name: 'hltb_get_game', arguments: { game_id: id, detail: 'detailed' } });
  console.log(JSON.stringify(detail.structuredContent, null, 2));
  if (detail.isError || !search.structuredContent?.games?.length) process.exitCode = 1;
} finally { await client.close(); }
