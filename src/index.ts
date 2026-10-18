#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();
try {
  await server.connect(new StdioServerTransport());
} catch {
  console.error('Unable to start howlongtobeat-mcp.');
  process.exitCode = 1;
}
